import { after, NextResponse } from "next/server";
import { claimNextJob, processJob } from "../../../../../worker";

export const runtime = "nodejs";

export async function POST() {
  after(async () => {
    const job = await claimNextJob();
    if (job) await processJob(job);
  });
  return NextResponse.json({ ok: true });
}
