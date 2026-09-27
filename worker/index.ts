import { config } from "dotenv";
config({ path: ".env.local" });
import http from "node:http";
import { chromium, type Page } from "playwright";
import { generateDesign } from "../src/lib/ai-provider";
import { AppError } from "../src/lib/errors";
import { BROWSER_UA, DESKTOP_VIEWPORT, guardContext } from "../src/lib/render-page";
import { writeScreenshot } from "../src/storage/screenshots";
import { validateUrl } from "../src/lib/url-validator";
import type { DesignExtraction, JobStatus } from "../src/lib/types";
import {
  advanceJobStatus,
  claimNextJob as claimNextJobRow,
  recordCrawledPage,
  recordDesignExtraction,
  recordExtractedAsset,
  recordGeneratedDocument,
  writeJobLog,
  type JobRow,
  type JobStatusPatch,
} from "./db";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
const PORT = Number(process.env.PORT ?? 8080);

export async function main() {
  serveHttp();
  let backoff = POLL_MS;
  console.log(`[worker] polling every ${POLL_MS}ms`);
  for (;;) {
    try {
      const job = await claimNextJobRow();
      if (job) {
        await processJob(job);
        backoff = POLL_MS; // reset after a successful job
      } else {
        backoff = Math.min(backoff * 1.5, 30_000); // no jobs → easier on nano
      }
    } catch (err) {
      // The only thing that lands here is a failure to reach the database: a
      // claim, a status write, a page write. The retry lives in Postgres and in
      // the connection pool, so the loop's job is to wait longer rather than to
      // hammer. (The comment that used to sit here named a PostgREST schema-cache
      // reload, which no longer exists -- there is no HTTP hop between this
      // process and the row any more.)
      console.error("[worker] poll failed", err);
      backoff = Math.min(backoff * 2, 30_000);
    }
    await sleep(backoff);
  }
}

function serveHttp() {
  http
    .createServer((req, res) => {
      // Health check keeps Fly from cordoning the machine
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"ok":true}');
        return;
      }
      res.writeHead(404);
      res.end();
    })
    .listen(PORT, () => console.log(`[worker] http on :${PORT}`));
}

export async function processJob(job: JobRow) {
  try {
    await log(job.id, "info", "job_started", job.sourceUrl);
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-software-rasterizer", "--headless=chrome", "--proxy-auto-detect"] });
    try {
      const result = await crawl(browser, job);
      await setStatus(job.id, "generating");
      const docs = await withHeartbeat(job.id, () => generateDesign(job.sourceUrl, result.extraction));
      const extraction = result.extraction;
      // The same six columns the old table-name insert listed, named explicitly.
      // Spreading the whole extraction would quietly start persisting `tokens`,
      // `component_details` and the rest the first time someone added a field to
      // `DesignExtraction`; the input type is a `Pick`, so the two lists have to
      // agree or it stops compiling.
      await recordDesignExtraction({
        jobId: job.id,
        colors: extraction.colors,
        typography: extraction.typography,
        layout_patterns: extraction.layout_patterns,
        components: extraction.components,
        metadata: extraction.metadata,
        confidence_score: extraction.confidence_score,
      });
      await recordGeneratedDocument({
        jobId: job.id,
        designMd: docs.designMd,
        implementationPrompt: docs.implementationPrompt,
      });
      await setStatus(job.id, "completed", {
        pagesAnalyzed: result.pagesAnalyzed,
        completedAt: new Date(),
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

async function crawl(browser: Awaited<ReturnType<typeof chromium.launch>>, job: JobRow) {
  const base = new URL(job.sourceUrl);
  const queue: Array<{ url: string; depth: number }> = [{ url: job.sourceUrl, depth: 0 }];
  const seen = new Set<string>();
  const pages: string[] = [];
  const failed: string[] = [];
  const allColors = new Set<string>();
  const allFonts = new Set<string>();
  let mergedTypographyRoles: DesignExtraction["typographyRoles"] = [];
  let mergedCtaButtons: DesignExtraction["ctaButtons"] = [];
  let mergedFontFaces: DesignExtraction["fontFaces"] = [];
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

  while (queue.length && pages.length < job.maxPages) {
    const item = queue.shift()!;
    const rawUrl = item.url;
    if (seen.has(rawUrl) || shouldSkip(rawUrl)) continue;
    const { normalized: url } = await validateUrl(rawUrl);
    seen.add(url);

    // ponytail: use default context instead of newContext() — spawning a renderer
    // process in Fly.io's 512MB microVM blocks the fork and hangs forever.
    // Default context is launched with the browser and has no fork cost.
    const contexts = browser.contexts();
    const context = contexts[0] || (await browser.newContext({
      viewport: DESKTOP_VIEWPORT,
      userAgent: BROWSER_UA,
      locale: "en-US",
      ignoreHTTPSErrors: true,
      serviceWorkers: "block",
    }));
    await guardContext(context);
    // ponytail: tsx injects __name() helper into arrow functions. When
    // page.evaluate serialises the fn to string the helper leaks into browser
    // where it doesn't exist. Shim it at the context level so every page has it.
    await context.addInitScript("window.__name=(fn)=>fn");
    const page = await context.newPage();
    let statusCode = 200;
    try {
      const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35_000 });
      statusCode = res?.status() ?? 200;
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
      // Scroll so lazy images + scroll-in animations fire before the full-page
      // screenshot; otherwise the capture shows unloaded imgs and opacity:0 blocks.
      await autoScrollPage(page).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
      await page.waitForTimeout(600);
      const pageTitle = await page.title();
      title ||= pageTitle;
      description ||= await page.locator('meta[name="description"]').getAttribute("content").catch(() => "") ?? "";

      // ponytail: page-weighted progress so the bar never bounces back
      const pageProg = Math.min(78, Math.round(20 + (pages.length / job.maxPages) * 60));
      await setStatus(job.id, "capturing", { progress: pageProg });
      const screenshot = await page.screenshot({ fullPage: true, type: "png" });
      // A file on local disk plus the URL the screenshot route serves, in place of
      // the object-storage upload. The key is unchanged -- `${jobId}/${n}.png`,
      // one-based -- so stored `crawled_pages.screenshot_desktop_url` values keep
      // their shape. `pages.length` counts the pages already pushed, so it is the
      // zero-based index of the page being captured.
      const screenshotUrl = (await writeScreenshot(job.id, pages.length, screenshot)).url;

      const {
        colors,
        typographyRoles: pageTypographyRoles,
        ctaButtons: pageCtaButtons,
        fontFaces: pageFontFaces,
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
      pageTypographyRoles.forEach((r) => allFonts.add(r.family));
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
        // Keep role typography + CTA samples from the FIRST page (depth 0 root) —
        // it carries the site's brand intent and layout primitives. Other pages
        // (case studies, blog, etc.) over-index on internal content and dilute
        // the style signal with their own typography.
        mergedTypographyRoles = pageTypographyRoles;
        mergedCtaButtons = pageCtaButtons;
        mergedFontFaces = pageFontFaces;
      }

      const crawled = await recordCrawledPage({
        jobId: job.id,
        url,
        title: pageTitle,
        statusCode,
        screenshotDesktopUrl: screenshotUrl,
      });

      for (const asset of foundAssets) {
        await recordExtractedAsset({
          jobId: job.id,
          pageId: crawled.id,
          assetType: asset.type,
          sourceUrl: asset.url,
          filename: asset.filename,
        });
      }

      pages.push(url);
      await setStatus(job.id, "extracting", { pagesAnalyzed: pages.length });
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
    typographyRoles: mergedTypographyRoles,
    ctaButtons: mergedCtaButtons,
    fontFaces: mergedFontFaces,
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
    confidence_score: Math.max(0.35, Math.min(0.9, pages.length / job.maxPages)),
  };

  return { extraction, pagesAnalyzed: pages.length };
}

export async function extractPage(page: Page, domain: string, pageUrl: string) {
  return page.evaluate(({ domainArg, pageUrlArg }) => {
    const top = Array.from(document.querySelectorAll<HTMLElement>("body *")).slice(0, 600);
    const colors = new Set<string>();
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
      } catch {
        // Another origin's stylesheet. Reading its `cssRules` throws a
        // SecurityError by design; there is nothing to recover, and the page
        // simply contributes no CSS custom properties.
      }
    }

    for (const el of top) {
      const cs = getComputedStyle(el);
      [cs.color, cs.backgroundColor, cs.borderColor, cs.outlineColor].forEach((c) => keep(c) && colors.add(c));
      // Per-role typography (h1, h2, h3, body, nav) is captured separately via
      // typographyRoles so it carries weight + size — family-only above
      // threw it away and let the LLM soften headings.
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

    // Per-role typography with REAL weight/size — the single highest-value
    // fidelity signal. Family-name-only lets the LLM guess weights and soften
    // headings; capturing 700/64px for h1 vs 400/16px for body pins hierarchy.
    const fam = (cs: CSSStyleDeclaration) => cs.fontFamily.split(",")[0].replaceAll('"', "").trim();
    const typographyRoles: Array<{ role: string; family: string; weight: string; size: string; lineHeight: string; letterSpacing: string }> = [];
    for (const [role, sel] of [["h1", "h1"], ["h2", "h2"], ["h3", "h3"], ["body", "p"], ["nav", "nav a,header a"]] as const) {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) continue;
      const cs = getComputedStyle(el);
      typographyRoles.push({ role, family: fam(cs), weight: cs.fontWeight, size: cs.fontSize, lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing });
    }

    // Primary CTAs: score buttons by visual prominence (colored bg + bold weight
    // + padding + radius) so the real pill button beats plain nav links, which
    // otherwise dominate the DOM-order sample and hide the site's actual CTA.
    const ctaButtons: Array<{ text?: string; family: string; weight: string; size: string; bg: string; color: string; radius: string; padding: string; border: string }> = [];
    const scoreBtn = (cs: CSSStyleDeclaration) =>
      (keep(cs.backgroundColor) ? 3 : 0) + Math.max(0, ((parseInt(cs.fontWeight) || 400) - 400) / 100) + (parseFloat(cs.paddingLeft) > 8 ? 1 : 0) + (keep(cs.borderRadius) ? 1 : 0);
    Array.from(document.querySelectorAll<HTMLElement>("button,a[href],[role=button]"))
      .map((el) => ({ el, cs: getComputedStyle(el), s: 0 }))
      .map((o) => ({ ...o, s: scoreBtn(o.cs) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 8)
      .forEach(({ el, cs }) => {
        ctaButtons.push({
          text: el.innerText?.trim().replace(/\s+/g, " ").slice(0, 40) || undefined,
          family: fam(cs), weight: cs.fontWeight, size: cs.fontSize,
          bg: cs.backgroundColor, color: cs.color, radius: cs.borderRadius,
          padding: `${cs.paddingTop} ${cs.paddingRight}`, border: `${cs.borderWidth} ${cs.borderStyle} ${cs.borderColor}`,
        });
      });

    // @font-face identity: the true webfont family + its declared weight axis.
    const fontFaces: Array<{ family: string; weights: string }> = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (!/@font-face/.test(rule.cssText)) continue;
          const family = rule.cssText.match(/font-family:\s*([^;]+)/i)?.[1]?.replace(/["']/g, "").trim();
          const weights = rule.cssText.match(/font-weight:\s*([^;]+)/i)?.[1]?.trim() ?? "";
          if (family && fontFaces.length < 12 && !fontFaces.some((f) => f.family === family && f.weights === weights)) {
            fontFaces.push({ family, weights });
          }
        }
      } catch {
        // Another origin's stylesheet. Reading its `cssRules` throws a
        // SecurityError by design; there is nothing to recover, and the page
        // simply contributes no font faces.
      }
    }

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
      } catch {
        // A malformed href in the markup, not a crawl failure.
      }
    }

    return {
      colors: [...colors],
      links: Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
        .flatMap((a) => {
          try {
            const u = new URL(a.getAttribute("href") || a.href, pageUrlArg);
            return u.hostname === domainArg ? [u.href.split("#")[0]] : [];
          } catch {
            return [];
          }
        })
        .filter((href) => !/\.(pdf|zip|exe|dmg|pkg|msi)$/i.test(href))
        .slice(0, 20),
      foundComponents: [...components],
      foundAssets: assets,
      theme: "unknown",
      typographyRoles,
      ctaButtons,
      fontFaces,
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

/** Scroll top→bottom→top to trigger lazy images + scroll-in animations before
 * the screenshot. Bounded so an infinite-scroll page can't hang the job. */
async function autoScrollPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = 600, delay = 100, maxSteps = 60;
    await new Promise<void>((resolve) => {
      let steps = 0;
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        steps += 1;
        if (steps >= maxSteps || window.scrollY + window.innerHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, delay);
    });
  });
}

/**
 * A thin wrapper over `advanceJobStatus`, kept so the call sites read as a
 * transition rather than a database call. The monotonic high-water clamp, the
 * stage defaults and the forced-zero on failure all live in `./db` now, where
 * `worker/db.test.ts` can reach them: they are policy about a column, and this
 * file is a crawl loop.
 */
async function setStatus(
  jobId: string,
  status: JobStatus,
  patch: JobStatusPatch = {},
) {
  await advanceJobStatus(jobId, status, patch);
}

async function log(jobId: string, level: "info" | "warn" | "error", event: string, message?: string, context?: unknown) {
  await writeJobLog({ jobId, level, event, message, context });
}

function isPersistenceError(err: unknown) {
  // The first clause is the load-bearing one now: every write in `./db` goes
  // through `persist()`, which raises `STORAGE_FAILED`. The regex stays for
  // errors raised outside that module -- a screenshot write throws the
  // filesystem's own error rather than a wrapped one.
  return err instanceof AppError && err.code === "STORAGE_FAILED"
    || err instanceof Error && /storage|upload|screenshot/i.test(err.message);
}

function errorDetails(err: unknown) {
  // Return a plain object, not a JSON string — `log` passes this straight into
  // the JSONB `context` column, which stringifies the row. Pre-stringifying
  // would double-encode it into a JSON string literal.
  if (!(err instanceof Error)) return { message: String(err) };
  return { name: err.name, message: err.message, stack: err.stack };
}

async function failJob(jobId: string, code: string, message: string) {
  await setStatus(jobId, "failed", {
    errorCode: code,
    errorMessage: message,
    completedAt: new Date(),
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("worker/index.ts")) {
  // Log stray rejections instead of letting Node exit(1) with no context.
  process.on("unhandledRejection", (err) => console.error("[worker] unhandledRejection", err));
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
