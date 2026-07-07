import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { fetchAsset } from "@/lib/fetch-html";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Proxies a single asset for the sandboxed preview: same-origin to the iframe, so no
// CORS/crossorigin failures, and SSRF-guarded via fetchAsset. Never forwards cookies.
export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url");
  if (!target) return new NextResponse("Missing url", { status: 400 });

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await rateLimit(`scrape-asset:${ip}`, 200))) return new NextResponse("Rate limited", { status: 429 });

    const { body, status, contentType } = await fetchAsset(target);
    return new NextResponse(status >= 400 ? "" : new Uint8Array(body), {
      status: status >= 400 ? status : 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (err) {
    const status = err instanceof AppError && err.code === "INVALID_URL" ? 400 : 502;
    return new NextResponse("", { status });
  }
}
