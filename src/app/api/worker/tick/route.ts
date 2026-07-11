import { NextResponse } from "next/server";

// No-op. The Playwright worker runs as a persistent InsForge compute container
// that polls claim_next_job() on its own — no HTTP trigger needed here.
// Kept mounted so stray callers resolve without 404.
export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ ok: true });
}
