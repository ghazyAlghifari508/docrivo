import { NextResponse } from "next/server";
import { getOwnedScrape, getUser } from "@/lib/dal";
import { insforge } from "@/lib/insforge";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = await getOwnedScrape(id);
  if (!row) return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });

  return NextResponse.json({
    id: row.id,
    sourceUrl: row.source_url,
    html: row.html,
    previewHtml: row.preview_html,
    metadata: row.metadata,
    createdAt: row.created_at,
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const row = await insforge.maybeSingle<{ id: string; user_id: string | null }>("scrape_artifacts", {
    id: `eq.${id}`,
    select: "id,user_id",
  });
  if (!row || row.user_id !== user.id) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  await insforge.delete("scrape_artifacts", { id });
  return NextResponse.json({ ok: true });
}
