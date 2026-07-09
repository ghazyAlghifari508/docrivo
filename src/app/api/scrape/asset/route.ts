import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { fetchAsset } from "@/lib/fetch-html";
import { rateLimit } from "@/lib/rate-limit";
import { rewriteCssUrls } from "@/lib/preview-html";

export const runtime = "nodejs";

// Proxies a single asset for the sandboxed preview: same-origin to the iframe, so no
// CORS/crossorigin failures, and SSRF-guarded via fetchAsset. Never forwards cookies.
export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url");
  if (!target) return new NextResponse("Missing url", { status: 400 });

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await rateLimit(`scrape-asset:${ip}`, 1000))) return new NextResponse("Rate limited", { status: 429 });

    const { body, status, contentType } = await fetchAsset(target);
    // CSS that skips inlining (a <link rel=stylesheet> routed straight through this
    // proxy) still has raw font/image url()s pointing at the source origin unless
    // rewritten here too, so the browser fetches them directly and CSP blocks them.
    const isCss = /text\/css/i.test(contentType);
    const payload = status >= 400 ? "" : isCss ? rewriteCssUrls(body.toString("utf8"), target) : new Uint8Array(body);
    return new NextResponse(payload, {
      status: status >= 400 ? status : 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        // Sandboxed srcDoc iframe has origin "null"; cross-origin font fetches are
        // CORS-mode even through a same-path proxy, so this header is required.
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const status = err instanceof AppError && err.code === "INVALID_URL" ? 400 : 502;
    return new NextResponse("", { status });
  }
}
