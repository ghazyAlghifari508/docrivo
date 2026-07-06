import { config } from "dotenv";
config({ path: ".env.local" });
import http from "node:http";
import https from "node:https";
import { chromium, type Page } from "playwright";
import { generateDesign } from "../src/lib/ai-provider";
import { AppError } from "../src/lib/errors";
import { insforge } from "../src/lib/insforge-core";
import { validateUrl } from "../src/lib/url-validator";
import type { DesignExtraction, GenerationJob } from "../src/lib/types";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);

async function main() {
  console.log(`[worker] polling every ${POLL_MS}ms`);
  for (;;) {
    try {
      const job = await claimNextJob();
      if (job) await processJob(job);
    } catch (err) {
      console.error("[worker] poll failed", err);
    }
    await sleep(POLL_MS);
  }
}

async function processJob(job: GenerationJob) {
  try {
    await log(job.id, "info", "job_started", job.source_url);
    const browser = await chromium.launch({ headless: true });
    try {
      const result = await crawl(browser, job);
      await setStatus(job.id, "generating");
      const docs = await withHeartbeat(job.id, () => generateDesign(job.source_url, result.extraction));
      await must(
        insforge.insert("design_extractions", [
          {
            job_id: job.id,
            colors: result.extraction.colors,
            typography: result.extraction.typography,
            layout_patterns: result.extraction.layout_patterns,
            components: result.extraction.components,
            metadata: result.extraction.metadata,
            confidence_score: result.extraction.confidence_score,
          },
        ]),
      );
      await must(
        insforge.insert("generated_documents", [
          {
            job_id: job.id,
            design_md: docs.designMd,
            implementation_prompt: docs.implementationPrompt,
          },
        ]),
      );
      await setStatus(job.id, "completed", {
        pages_analyzed: result.pagesAnalyzed,
        completed_at: new Date().toISOString(),
      });
      await log(job.id, "info", "job_completed");
    } finally {
      await browser.close();
    }
  } catch (err) {
    const code = err instanceof AppError ? err.code : "WEBSITE_BLOCKED";
    const message = err instanceof Error ? err.message : "Worker failed";
    await failJob(job.id, code, message);
  }
}

async function crawl(browser: Awaited<ReturnType<typeof chromium.launch>>, job: GenerationJob) {
  const base = new URL(job.source_url);
  const queue: Array<{ url: string; depth: number }> = [{ url: job.source_url, depth: 0 }];
  const seen = new Set<string>();
  const pages: string[] = [];
  const failed: string[] = [];
  const allColors = new Set<string>();
  const allFonts = new Set<string>();
  const components = new Set<string>();
  let title = "";
  let description = "";

  await setStatus(job.id, "crawling");

  while (queue.length && pages.length < job.max_pages) {
    const item = queue.shift()!;
    const rawUrl = item.url;
    if (seen.has(rawUrl) || shouldSkip(rawUrl)) continue;
    const { normalized: url } = await validateUrl(rawUrl);
    seen.add(url);

    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route("**/*", (route) => route.abort());
    const page = await context.newPage();
    try {
      const fetched = await safeFetch(url);
      await page.setContent(fetched.html, { waitUntil: "domcontentloaded", timeout: 25_000 });
      const pageTitle = await page.title();
      title ||= pageTitle;
      description ||= await page.locator('meta[name="description"]').getAttribute("content").catch(() => "") ?? "";

      await setStatus(job.id, "capturing");
      const screenshot = await page.screenshot({ fullPage: true, type: "png" });
      const key = `${job.id}/${pages.length + 1}.png`;
      const uploaded = await insforge.uploadScreenshot(
        key,
        new Blob([new Uint8Array(screenshot)], { type: "image/png" }),
      );
      const screenshotUrl = uploaded?.url ?? null;

      const { colors, fonts, links, foundComponents, foundAssets, theme } = await extractPage(page, base.hostname, url);
      colors.forEach((c) => allColors.add(c));
      fonts.forEach((f) => allFonts.add(f));
      foundComponents.forEach((c) => components.add(c));
      if (item.depth === 0) {
        links
          .filter((link) => !seen.has(link))
          .forEach((link) => queue.push({ url: link, depth: 1 }));
      }

      const [crawled] = await must<{ id: string }[]>(
        insforge.insert("crawled_pages", [
          {
            job_id: job.id,
            url,
            title: pageTitle,
            status_code: fetched.status,
            screenshot_desktop_url: screenshotUrl,
          },
        ], "id"),
      );

      for (const asset of foundAssets) {
        await must(
          insforge.insert("extracted_assets", [
            {
              job_id: job.id,
              page_id: crawled?.id ?? null,
              asset_type: asset.type,
              source_url: asset.url,
              filename: asset.filename,
              status: "found",
            },
          ]),
        );
      }

      pages.push(url);
      await setStatus(job.id, "extracting", { pages_analyzed: pages.length });
      void theme;
    } catch (err) {
      failed.push(url);
      await log(job.id, "warn", "page_failed", url, String(err));
    } finally {
      await context.close();
    }
  }

  if (!pages.length) throw new AppError("NO_ANALYZABLE_CONTENT");

  const extraction: DesignExtraction = {
    colors: [...allColors].slice(0, 24).map((value, i) => ({ role: i === 0 ? "dominant" : "detected", value })),
    typography: [...allFonts].slice(0, 8).map((family) => ({ family })),
    layout_patterns: inferLayoutPatterns([...components]),
    components: [...components],
    metadata: {
      title,
      description,
      theme: "unknown",
      pagesAnalyzed: pages,
      pagesFailed: failed.length,
    },
    confidence_score: Math.max(0.35, Math.min(0.9, pages.length / job.max_pages)),
  };

  return { extraction, pagesAnalyzed: pages.length };
}

async function safeFetch(rawUrl: string, redirects = 0): Promise<{ html: string; status: number }> {
  if (redirects > 3) throw new AppError("WEBSITE_BLOCKED", "Redirect terlalu banyak.");
  const { url, ip } = await validateUrl(rawUrl);
  const isHttps = url.protocol === "https:";
  const client = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        protocol: url.protocol,
        hostname: ip,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        timeout: 25_000,
        headers: { Host: url.host, "User-Agent": "DocrivoBot/1.0" },
        servername: url.hostname,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (location && status >= 300 && status < 400) {
          res.resume();
          safeFetch(new URL(location, url.href).href, redirects + 1).then(resolve, reject);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2_000_000) req.destroy(new AppError("NO_ANALYZABLE_CONTENT", "HTML terlalu besar."));
          else chunks.push(chunk);
        });
        res.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8"), status }));
      },
    );
    req.on("timeout", () => req.destroy(new AppError("FETCH_TIMEOUT")));
    req.on("error", reject);
    req.end();
  });
}

async function extractPage(page: Page, domain: string, pageUrl: string) {
  return page.evaluate(({ domainArg, pageUrlArg }) => {
    const top = Array.from(document.querySelectorAll("body *")).slice(0, 250);
    const colors = new Set<string>();
    const fonts = new Set<string>();
    const components = new Set<string>();
    for (const el of top) {
      const cs = getComputedStyle(el as Element);
      [cs.color, cs.backgroundColor, cs.borderColor].forEach((c) => {
        if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") colors.add(c);
      });
      if (cs.fontFamily) fonts.add(cs.fontFamily.split(",")[0].replaceAll('"', "").trim());
    }
    if (document.querySelector("nav,header")) components.add("navigation/header");
    if (document.querySelector("main section,h1")) components.add("hero section");
    if (document.querySelector("button,a[href]")) components.add("button/CTA");
    if (document.querySelector("form,input,textarea,select")) components.add("form");
    if (document.querySelector("footer")) components.add("footer");
    if (document.querySelector("article,.card,[class*=card]")) components.add("card");
    if (document.querySelector("[class*=pricing],[id*=pricing]")) components.add("pricing block");
    if (document.querySelector("[class*=testimonial],[id*=testimonial]")) components.add("testimonial block");

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .flatMap((a) => {
        try {
          const u = new URL(a.getAttribute("href") || a.href, pageUrlArg);
          return u.hostname === domainArg ? [u.href.split("#")[0]] : [];
        } catch {
          return [];
        }
      })
      .filter((href) => !/\.(pdf|zip|exe|dmg|pkg|msi)$/i.test(href))
      .slice(0, 20);

    const assets = Array.from(document.images)
      .flatMap((img) => {
        try {
          const url = new URL(img.getAttribute("src") || img.currentSrc || img.src, pageUrlArg).href;
          return [{ url, type: "image", filename: url.split("/").pop() || "image" }];
        } catch {
          return [];
        }
      })
      .slice(0, 30);

    const favRaw = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.getAttribute("href");
    if (favRaw) {
      try {
        const fav = new URL(favRaw, pageUrlArg).href;
        assets.push({ url: fav, type: "favicon", filename: fav.split("/").pop() || "favicon" });
      } catch {}
    }

    return { colors: [...colors], fonts: [...fonts], links, foundComponents: [...components], foundAssets: assets, theme: "unknown" };
  }, { domainArg: domain, pageUrlArg: pageUrl });
}

function inferLayoutPatterns(components: string[]) {
  const out = ["single page / marketing page", "responsive sections"];
  if (components.includes("navigation/header")) out.push("top navigation");
  if (components.includes("card")) out.push("card grid / repeated content blocks");
  if (components.includes("footer")) out.push("footer navigation");
  return out;
}

function shouldSkip(url: string) {
  return /\b(login|signin|signup|register|account|checkout|cart|payment|admin)\b/i.test(url);
}

async function claimNextJob(): Promise<GenerationJob | null> {
  const result = await insforge.rpc<GenerationJob | GenerationJob[] | null>("claim_next_job");
  if (Array.isArray(result)) return result[0] ?? null;
  return result?.id ? result : null;
}

async function setStatus(jobId: string, status: GenerationJob["status"], extra: Record<string, unknown> = {}) {
  await insforge.update("generation_jobs", { id: jobId }, {
    status,
    progress: { queued: 0, crawling: 20, capturing: 40, extracting: 60, generating: 80, completed: 100, failed: 100, cancelled: 100 }[status],
    updated_at: new Date().toISOString(),
    ...extra,
  });
}

async function log(jobId: string, level: "info" | "warn" | "error", event: string, message?: string, context?: unknown) {
  await insforge.insert("job_logs", [{ job_id: jobId, level, event, message, context }]);
}

async function failJob(jobId: string, code: string, message: string) {
  await setStatus(jobId, "failed", {
    error_code: code,
    error_message: message,
    completed_at: new Date().toISOString(),
  });
  await log(jobId, "error", "job_failed", `${code}: ${message}`);
}

async function withHeartbeat<T>(jobId: string, work: () => Promise<T>) {
  const timer = setInterval(() => {
    void setStatus(jobId, "generating").catch((err) => console.error("[worker] heartbeat failed", err));
  }, 60_000);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

async function must<T = unknown>(query: PromiseLike<T>): Promise<T> {
  return query;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
