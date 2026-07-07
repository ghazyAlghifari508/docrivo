import { NextResponse } from "next/server";
import { insforge } from "@/lib/insforge";
import { ERROR_CODES } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";

type RetryJob = { id: string; status: string; retry_of: string | null };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!(await rateLimit(`retry:${ip}`))) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: ERROR_CODES.RATE_LIMITED } },
      { status: 429 },
    );
  }

  try {
    const job = await insforge.rpc<RetryJob>("retry_generation_job", { p_job_id: id });
    return NextResponse.json({ jobId: job.id, status: job.status, retryOf: job.retry_of });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Retry gagal.";
    if (message.includes("job not found") || message.includes("not retryable")) {
      return NextResponse.json(
        { error: { code: "INVALID_RETRY", message: "Job ini belum bisa di-retry." } },
        { status: message.includes("job not found") ? 404 : 409 },
      );
    }
    console.error("[api] retry generation failed", err);
    return NextResponse.json(
      { error: { code: "STORAGE_FAILED", message: ERROR_CODES.STORAGE_FAILED } },
      { status: 500 },
    );
  }
}
