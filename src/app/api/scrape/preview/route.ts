import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { scrapeHtml } from "@/lib/fetch-html";
import { rewritePreviewAssets } from "@/lib/preview-html";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Assets are same-origin via the proxy ('self'); inline+eval scripts kept so JS animations run.
// The iframe sandbox (no allow-same-origin) is what actually isolates this untrusted HTML.
const PREVIEW_CSP =
  "sandbox allow-scripts; default-src 'self' data: blob:; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; script-src-elem 'self' 'unsafe-inline' blob:; connect-src 'self' data: blob:; frame-src 'self' data: blob:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'self'";

const Body = z.object({ url: z.string().min(1) });

export async function GET(req: Request) {
  return render(new URL(req.url).searchParams.get("url") ?? "", req);
}

export async function POST(req: Request) {
  try {
    const { url } = Body.parse(await req.json());
    return render(url, req);
  } catch (err) {
    if (err instanceof z.ZodError || err instanceof SyntaxError) return htmlError(ERROR_CODES.INVALID_URL, 400);
    throw err;
  }
}

async function render(rawUrl: string, req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await rateLimit(`scrape-preview:${ip}`))) return htmlError(ERROR_CODES.RATE_LIMITED, 429);

    const { html, sourceUrl } = await scrapeHtml(rawUrl);

    return new NextResponse(rewritePreviewAssets(html, sourceUrl), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": PREVIEW_CSP,
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        // Re-render live every request so re-scraping the same URL never serves a
        // stale cached frame (the user re-submits precisely to get a fresh result).
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    if (err instanceof AppError) return htmlError(err.message, err.code === "INVALID_URL" ? 400 : 422);
    console.error("[api] scrape preview failed", err);
    return htmlError(ERROR_CODES.WEBSITE_BLOCKED, 502);
  }
}

function htmlError(message: string, status: number) {
  return new NextResponse(`<!doctype html><meta charset="utf-8"><title>Preview gagal</title><p>${escapeHtml(message)}</p>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}
