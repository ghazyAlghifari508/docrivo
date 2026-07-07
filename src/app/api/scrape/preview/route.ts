import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { scrapeHtml } from "@/lib/fetch-html";
import { toStaticPreviewHtml } from "@/lib/preview-html";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

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

    const { html } = await scrapeHtml(rawUrl);

    return new NextResponse(toStaticPreviewHtml(html), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; style-src https: 'unsafe-inline'; img-src https: data: blob:; media-src https: data: blob:; font-src https: data:; script-src 'none'; connect-src 'none'; frame-src 'none'; child-src 'none'; base-uri https:; form-action 'none'; object-src 'none'; frame-ancestors 'self'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
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
