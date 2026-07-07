import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { scrapeHtml } from "@/lib/fetch-html";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({ url: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await rateLimit(`scrape:${ip}`))) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: ERROR_CODES.RATE_LIMITED } },
        { status: 429 },
      );
    }

    const { url } = Body.parse(await req.json());
    return NextResponse.json(await scrapeHtml(url));
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: err.code === "INVALID_URL" ? 400 : 422 },
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
