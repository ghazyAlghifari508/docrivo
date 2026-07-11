import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { scrapeHtml, fetchHtml, inlineStyles } from "@/lib/fetch-html";
import { apifyScrape } from "@/lib/apify";
import { rewritePreviewAssets } from "@/lib/preview-html";
import { rateLimit } from "@/lib/rate-limit";
import { getUser } from "@/lib/dal";
import { consumeQuota, refundQuota } from "@/lib/plans";
import { insforge } from "@/lib/insforge";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ url: z.string().min(1), attemptNumber: z.number().int().positive().optional() });

/** Inline href then absolutize */
function applyInline(html: string, base: string) {
  const tag = `<base href="${new URL(base).href}">`;
  const withBase = /<base\b[^>]*>/i.test(html)
    ? html.replace(/<base\b[^>]*>/i, tag)
    : /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`)
      : `${tag}${html}`;
  return withBase;
}

/**
 * Render a URL to HTML + previewHtml. Playwright (scrapeHtml) works locally but
 * fails in Vercel's serverless lambda. Production uses Apify (JS-rendered browser)
 * with fallback to raw HTTP. After getting HTML, we inline external CSS and rewrite
 * all asset URLs through the same-origin proxy so previews look complete.
 */
async function renderScrape(url: string, attemptNumber?: number) {
  const isLocal = !process.env.VERCEL;
  if (isLocal) return scrapeHtml(url, attemptNumber);

  let html: string;
  try {
    const result = await apifyScrape(url);
    html = result.html;
  } catch (apifyErr) {
    console.warn("[scrape] Apify failed, fallback to raw HTTP:", apifyErr);
    const fb = await fetchHtml(url);
    html = fb.html;
  }
  if (!html || html.length < 50) throw new AppError("NO_ANALYZABLE_CONTENT");

  // Inline external stylesheets so the preview doesn't need N separate proxy
  // fetches for CSS (which hit rate limits). Then absolutize <base> so relative
  // assets resolve against the source origin. Finally rewrite all urls through
  // the same-origin SSRF-safe proxy.
  const inlined = await inlineStyles(html, url).catch(() => html);
  const withBase = applyInline(inlined, url);
  const previewHtml = rewritePreviewAssets(withBase, url);
  return {
    sourceUrl: url,
    status: 200,
    html,
    previewHtml,
    metadata: {
      attempt: attemptNumber ?? 1,
      capturedAt: new Date().toISOString(),
      finalUrl: url,
      viewport: { width: 1280, height: 720 },
      captureMode: "apify",
      htmlBytes: Buffer.byteLength(html, "utf8"),
      previewHtmlBytes: Buffer.byteLength(previewHtml, "utf8"),
    },
  };
}

export async function POST(req: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Masuk dengan Google dulu." } },
        { status: 401 },
      );
    }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await rateLimit(`scrape:${ip}`))) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: ERROR_CODES.RATE_LIMITED } },
        { status: 429 },
      );
    }

    const { url, attemptNumber } = Body.parse(await req.json());

    // Atomic credit gate BEFORE any work — no way to run a scrape without a credit.
    const quota = await consumeQuota(user.id, "scrape");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: { code: "QUOTA_EXCEEDED", message: ERROR_CODES.QUOTA_EXCEEDED } },
        { status: 402 },
      );
    }

    try {
      const result = await renderScrape(url, attemptNumber);

      let stored;
      try {
        [stored] = await insforge.insert<{ id: string }>(
          "scrape_artifacts",
          [
            {
              user_id: user.id,
              source_url: result.sourceUrl,
              status: result.status,
              html: result.html,
              preview_html: result.previewHtml,
              metadata: result.metadata,
            },
          ],
          "id",
        );
      } catch (storageErr) {
        // Scrape succeeded but persistence failed — surface the real cause, not
        // a misleading WEBSITE_BLOCKED 502.
        throw new AppError("STORAGE_FAILED", undefined, { cause: String(storageErr) });
      }

      return NextResponse.json({ ...result, scrapeId: stored.id });
    } catch (workErr) {
      // Work failed → the credit was never really used. Give it back.
      await refundQuota(user.id, "scrape").catch((refundErr) => {
        console.error("[api] scrape refund failed — credit may be stuck", refundErr);
      });
      throw workErr;
    }
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.code === "INVALID_URL" ? 400 : err.code === "STORAGE_FAILED" ? 500 : 422 },
      );
    }
    if (err instanceof z.ZodError || err instanceof SyntaxError) {
      return NextResponse.json(
        { error: { code: "INVALID_URL", message: ERROR_CODES.INVALID_URL } },
        { status: 400 },
      );
    }
    console.error("[api] scrape failed", err);
    return NextResponse.json(
      { error: { code: "WEBSITE_BLOCKED", message: ERROR_CODES.WEBSITE_BLOCKED } },
      { status: 502 },
    );
  }
}
