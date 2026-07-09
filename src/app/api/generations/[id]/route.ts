import { after, NextResponse } from "next/server";
import { insforge } from "@/lib/insforge";

type JobRow = {
  id: string;
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

  const job = await insforge.maybeSingle<JobRow>("generation_jobs", { id: `eq.${id}` });
  if (!job) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  if (job.status === "queued") {
    after(() => {
      void fetch(new URL("/api/worker/tick", req.url), { method: "POST" }).catch((err) => {
        if (err && (err as Error).message) console.error("[api] worker tick failed", (err as Error).message);
        else console.error("[api] worker tick failed (no message)");
      });
    });
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
