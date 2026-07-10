import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { scrapeHtml } from "@/lib/fetch-html";
import { rateLimit } from "@/lib/rate-limit";
import { getUser } from "@/lib/dal";
import { insforge } from "@/lib/insforge";

export const runtime = "nodejs";

const Body = z.object({ url: z.string().min(1), attemptNumber: z.number().int().positive().optional() });

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
    const result = await scrapeHtml(url, attemptNumber);

    const [stored] = await insforge.insert<{ id: string }>(
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

    return NextResponse.json({ ...result, scrapeId: stored.id });
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
