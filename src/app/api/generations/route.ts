import { after, NextResponse } from "next/server";
import { z } from "zod";
import { AppError, ERROR_CODES } from "@/lib/errors";
import { insforge } from "@/lib/insforge";
import { rateLimit } from "@/lib/rate-limit";
import { validateUrl } from "@/lib/url-validator";
import { getUser } from "@/lib/dal";
import { consumeQuota } from "@/lib/plans";

const Body = z.object({
  url: z.string().min(1),
  options: z
    .object({
      maxPages: z.number().int().min(1).max(5).optional(),
      outputLanguage: z.string().optional(),
    })
    .optional(),
});

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
    if (!(await rateLimit(`generations:${ip}`))) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: ERROR_CODES.RATE_LIMITED } },
        { status: 429 },
      );
    }

    const body = Body.parse(await req.json());
    const valid = await validateUrl(body.url);
    const host = valid.url.hostname.toLowerCase();

    // Atomic credit gate right BEFORE creating the job — validated URL first so
    // an invalid URL doesn't burn a credit. Worker can't process a job that was
    // never created, so there's no way to generate without a credit.
    const quota = await consumeQuota(user.id, "designmd");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: { code: "QUOTA_EXCEEDED", message: ERROR_CODES.QUOTA_EXCEEDED } },
        { status: 402 },
      );
    }

    const [job] = await insforge.insert<{ id: string; status: string }>(
      "generation_jobs",
      [
        {
          source_url: valid.normalized,
          normalized_domain: host,
          status: "queued",
          progress: 0,
          max_pages: body.options?.maxPages ?? Number(process.env.MAX_PAGES ?? 5),
          output_language: body.options?.outputLanguage ?? "id",
          user_id: user.id,
        },
      ],
      "id,status",
    );

    after(() => {
      void fetch(new URL("/api/worker/tick", req.url), { method: "POST" }).catch((err) => {
        console.error("[api] worker tick failed", err);
      });
    });

    return NextResponse.json({ jobId: job.id, status: job.status });
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
    console.error("[api] create generation failed", err);
    return NextResponse.json(
      { error: { code: "STORAGE_FAILED", message: ERROR_CODES.STORAGE_FAILED } },
      { status: 500 },
    );
  }
}
