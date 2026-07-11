import { after, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge";
import { getUser } from "@/lib/dal";

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

  const job = await insforge.maybeSingle<JobRow>("generation_jobs", { id: `eq.${id}` });
  if (!job || job.user_id !== user.id) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }


  const [pages, assets, document] = await Promise.all([
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
