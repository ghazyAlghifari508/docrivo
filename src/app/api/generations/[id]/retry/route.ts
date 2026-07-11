import { NextResponse } from "next/server";
import { insforge } from "@/lib/insforge";
import { ERROR_CODES } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { getUser } from "@/lib/dal";
import { consumeQuota, refundQuota } from "@/lib/plans";

type RetryJob = { id: string; status: string; retry_of: string | null };

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  let quotaConsumed = false;

  try {
    const owned = await insforge.maybeSingle<{ id: string; user_id: string | null }>("generation_jobs", {
      id: `eq.${id}`,
      select: "id,user_id",
    });
    if (!owned || owned.user_id !== user.id) {
      return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!(await rateLimit(`retry:${ip}`))) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: ERROR_CODES.RATE_LIMITED } },
        { status: 429 },
      );
    }

    // A retry is a fresh generation — it costs a DESIGN.md credit like any other.
    const quota = await consumeQuota(user.id, "designmd");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: { code: "QUOTA_EXCEEDED", message: ERROR_CODES.QUOTA_EXCEEDED } },
        { status: 402 },
      );
    }
    quotaConsumed = true;

    const job = await insforge.rpc<RetryJob>("retry_generation_job", { p_job_id: id });
    return NextResponse.json({ jobId: job.id, status: job.status, retryOf: job.retry_of });
  } catch (err) {
    if (quotaConsumed) {
      await refundQuota(user.id, "designmd").catch((refundErr) => {
        console.error("[api] retry refund failed — credit may be stuck", refundErr);
      });
    }
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
