import { config } from "dotenv";
config({ path: ".env.local" });
import { chromium, type Page } from "playwright";
import { generateDesign } from "../src/lib/ai-provider";
import { AppError } from "../src/lib/errors";
import { insforge } from "../src/lib/insforge-core";
import { BROWSER_UA, DESKTOP_VIEWPORT, guardContext } from "../src/lib/render-page";
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
  const spacing = new Set<string>();
  const radii = new Set<string>();
  const shadows = new Set<string>();
  const maxWidths = new Set<string>();
  const lineHeights = new Set<string>();
  const letterSpacing = new Set<string>();
  const cssVariables: Record<string, string> = {};
  const componentDetails: DesignExtraction["component_details"] = [];
  const surfaces: DesignExtraction["surfaces"] = [];
  const imageExamples = new Set<string>();
  let imageCount = 0;
  let title = "";
  let description = "";

  await setStatus(job.id, "crawling");

  while (queue.length && pages.length < job.max_pages) {
    const item = queue.shift()!;
    const rawUrl = item.url;
    if (seen.has(rawUrl) || shouldSkip(rawUrl)) continue;
    const { normalized: url } = await validateUrl(rawUrl);
    seen.add(url);

    const context = await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      userAgent: BROWSER_UA,
      locale: "en-US",
      ignoreHTTPSErrors: true,
      serviceWorkers: "block",
    });
    await guardContext(context);
    const page = await context.newPage();
    let statusCode = 200;
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });
      statusCode = res?.status() ?? 200;
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(600);
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
      if (!uploaded?.url || !uploaded?.key) throw new AppError("STORAGE_FAILED", "Upload screenshot gagal.");
      const screenshotUrl = uploaded.url;

      const {
        colors,
        fonts,
        links,
        foundComponents,
        foundAssets,
        theme,
        tokens,
        componentDetails: pageComponents,
        surfaces: pageSurfaces,
        imagery,
      } = await extractPage(page, base.hostname, url);
      colors.forEach((c) => allColors.add(c));
      fonts.forEach((f) => allFonts.add(f));
      foundComponents.forEach((c) => components.add(c));
      tokens.spacing.forEach((v) => spacing.add(v));
      tokens.radii.forEach((v) => radii.add(v));
      tokens.shadows.forEach((v) => shadows.add(v));
      tokens.maxWidths.forEach((v) => maxWidths.add(v));
      tokens.lineHeights.forEach((v) => lineHeights.add(v));
      tokens.letterSpacing.forEach((v) => letterSpacing.add(v));
      Object.assign(cssVariables, tokens.cssVariables);
      componentDetails.push(...pageComponents);
      surfaces.push(...pageSurfaces);
      imageCount += imagery.imageCount;
      imagery.examples.forEach((src) => imageExamples.add(src));
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
            status_code: statusCode,
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
      if (isPersistenceError(err)) throw err;
      failed.push(url);
      await log(job.id, "warn", "page_failed", url, errorDetails(err));
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
    tokens: {
      spacing: [...spacing].slice(0, 40),
      radii: [...radii].slice(0, 24),
      shadows: [...shadows].slice(0, 24),
      maxWidths: [...maxWidths].slice(0, 24),
      lineHeights: [...lineHeights].slice(0, 24),
      letterSpacing: [...letterSpacing].slice(0, 24),
      cssVariables: Object.fromEntries(Object.entries(cssVariables).slice(0, 80)),
    },
    component_details: componentDetails.slice(0, 60),
    surfaces: surfaces.slice(0, 30),
    imagery: { imageCount, examples: [...imageExamples].slice(0, 20) },
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

async function extractPage(page: Page, domain: string, pageUrl: string) {
  return page.evaluate(({ domainArg, pageUrlArg }) => {
    const top = Array.from(document.querySelectorAll<HTMLElement>("body *")).slice(0, 600);
    const colors = new Set<string>();
    const fonts = new Set<string>();
    const components = new Set<string>();
    const spacing = new Set<string>();
    const radii = new Set<string>();
    const shadows = new Set<string>();
    const maxWidths = new Set<string>();
    const lineHeights = new Set<string>();
    const letterSpacing = new Set<string>();
    const cssVariables: Record<string, string> = {};
    const componentDetails: Array<{ type: string; text?: string; colors?: string[]; typography?: string; spacing?: string; shape?: string }> = [];
    const surfaces: Array<{ selector: string; background: string; color: string }> = [];

    const keep = (v: string) => v && v !== "rgba(0, 0, 0, 0)" && v !== "transparent" && v !== "none" && v !== "normal";
    const px = (v: string) => keep(v) && /px|rem|em|%|vw|vh/.test(v);
    const label = (el: HTMLElement) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : el.className ? `.${String(el.className).split(/\s+/).slice(0, 2).join(".")}` : "");

    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          const text = rule.cssText;
          for (const [, name, value] of text.matchAll(/(--[\w-]+)\s*:\s*([^;}{]+)/g)) {
            if (Object.keys(cssVariables).length < 120) cssVariables[name] = value.trim();
          }
        }
      } catch {}
    }

    for (const el of top) {
      const cs = getComputedStyle(el);
      [cs.color, cs.backgroundColor, cs.borderColor, cs.outlineColor].forEach((c) => keep(c) && colors.add(c));
      if (cs.fontFamily) fonts.add(cs.fontFamily.split(",")[0].replaceAll('"', "").trim());
      [cs.marginTop, cs.marginRight, cs.marginBottom, cs.marginLeft, cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft, cs.gap, cs.rowGap, cs.columnGap].forEach((v) => px(v) && spacing.add(v));
      [cs.borderRadius, cs.borderTopLeftRadius, cs.borderTopRightRadius].forEach((v) => px(v) && radii.add(v));
      if (keep(cs.boxShadow)) shadows.add(cs.boxShadow);
      if (px(cs.maxWidth) && cs.maxWidth !== "none") maxWidths.add(cs.maxWidth);
      if (keep(cs.lineHeight)) lineHeights.add(cs.lineHeight);
      if (keep(cs.letterSpacing)) letterSpacing.add(cs.letterSpacing);
      if (keep(cs.backgroundColor) && surfaces.length < 30) surfaces.push({ selector: label(el), background: cs.backgroundColor, color: cs.color });
    }

    const sample = (selector: string, type: string, limit = 8) => {
      Array.from(document.querySelectorAll<HTMLElement>(selector)).slice(0, limit).forEach((el) => {
        const cs = getComputedStyle(el);
        componentDetails.push({
          type,
          text: el.innerText?.trim().replace(/\s+/g, " ").slice(0, 120) || undefined,
          colors: [cs.color, cs.backgroundColor, cs.borderColor].filter(keep),
          typography: `${cs.fontFamily.split(",")[0].replaceAll('"', "")} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.letterSpacing}`,
          spacing: `p:${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}; m:${cs.marginTop} ${cs.marginBottom}; gap:${cs.gap}`,
          shape: `radius:${cs.borderRadius}; border:${cs.borderWidth} ${cs.borderStyle} ${cs.borderColor}; shadow:${cs.boxShadow}`,
        });
      });
    };

    if (document.querySelector("nav,header")) components.add("navigation/header");
    if (document.querySelector("main section,h1")) components.add("hero section");
    if (document.querySelector("button,a[href]")) components.add("button/CTA");
    if (document.querySelector("form,input,textarea,select")) components.add("form");
    if (document.querySelector("footer")) components.add("footer");
    if (document.querySelector("article,.card,[class*=card]")) components.add("card");
    if (document.querySelector("[class*=pricing],[id*=pricing]")) components.add("pricing block");
    if (document.querySelector("[class*=testimonial],[id*=testimonial]")) components.add("testimonial block");
    sample("h1,h2,h3", "heading");
    sample("button,a[href]", "button/link", 12);
    sample("nav,header", "navigation", 4);
    sample("article,.card,[class*=card]", "card", 12);
    sample("footer", "footer", 2);

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

    return {
      colors: [...colors],
      fonts: [...fonts],
      links,
      foundComponents: [...components],
      foundAssets: assets,
      theme: "unknown",
      tokens: {
        spacing: [...spacing],
        radii: [...radii],
        shadows: [...shadows],
        maxWidths: [...maxWidths],
        lineHeights: [...lineHeights],
        letterSpacing: [...letterSpacing],
        cssVariables,
      },
      componentDetails,
      surfaces,
      imagery: { imageCount: assets.filter((a) => a.type === "image").length, examples: assets.filter((a) => a.type === "image").map((a) => a.url) },
    };
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

function isPersistenceError(err: unknown) {
  return err instanceof AppError && err.code === "STORAGE_FAILED"
    || err instanceof Error && /database|storage|records|upload|insert|patch|rpc/i.test(err.message);
}

function errorDetails(err: unknown) {
  if (!(err instanceof Error)) return String(err);
  return JSON.stringify({ name: err.name, message: err.message, stack: err.stack });
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
    void setStatus(jobId, "generating").catch((err) => {
      console.error("[worker] heartbeat failed", err);
    });
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
