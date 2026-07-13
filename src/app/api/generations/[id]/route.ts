import { NextResponse } from "next/server";
import { insforge } from "@/lib/insforge";
import { getUser } from "@/lib/dal";
import { isTransient } from "@/lib/retry";

type JobRow = {
  id: string;
  user_id: string | null;
  source_url: string;
  status: string;
  progress: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  pages_analyzed: number;
};

type DocRow = { design_md: string | null; implementation_prompt: string | null };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  let job: JobRow | null;
  try {
    job = await insforge.maybeSingle<JobRow>("generation_jobs", { id: `eq.${id}` });
  } catch (err) {
    // InsForge timeout/blip on the poll path. Return 503 so the client's poller
    // retries instead of surfacing a 500 and crashing Next's error normalizer.
    if (isTransient(err)) {
      console.warn("[api] job detail transient", err);
      return NextResponse.json({ error: { code: "BACKEND_TRANSIENT" } }, { status: 503 });
    }
    throw err;
  }
  if (!job || job.user_id !== user.id) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }


  // allSettled, not all: a failed pages/assets query must not hide an existing
  // DESIGN.md from the polling client. Each falls back to empty/null on reject.
  const [pagesR, assetsR, documentR] = await Promise.allSettled([
    insforge.select("crawled_pages", {
      job_id: `eq.${id}`,
      select: "id,url,title,status_code,screenshot_desktop_url,created_at",
      order: "created_at.asc",
    }),
    insforge.select("extracted_assets", {
      job_id: `eq.${id}`,
      select: "id,asset_type,source_url,filename,mime_type,status,storage_url,created_at",
      order: "created_at.asc",
    }),
    insforge.maybeSingle<DocRow>("generated_documents", {
      job_id: `eq.${id}`,
      select: "design_md,implementation_prompt",
    }),
  ]);
  for (const r of [pagesR, assetsR, documentR]) {
    if (r.status === "rejected") console.error("[api] job detail sub-query failed", r.reason);
  }
  const pages = pagesR.status === "fulfilled" ? pagesR.value : [];
  const assets = assetsR.status === "fulfilled" ? assetsR.value : [];
  const document = documentR.status === "fulfilled" ? documentR.value : null;

  return NextResponse.json({
    id: job.id,
    sourceUrl: job.source_url,
    status: job.status,
    progress: job.progress,
    errorCode: job.error_code,
    errorMessage: job.error_message,
    createdAt: job.created_at,
    completedAt: job.completed_at,
    pagesAnalyzed: job.pages_analyzed,
    pages,
    assets,
    result: document
      ? { designMd: document.design_md, implementationPrompt: document.implementation_prompt }
      : null,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const row = await insforge.maybeSingle<{ id: string; user_id: string | null }>("generation_jobs", {
    id: `eq.${id}`,
    select: "id,user_id",
  });
  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  await insforge.delete("generation_jobs", { id });
  return NextResponse.json({ ok: true });
}
