import { NextResponse } from "next/server";
import { insforge } from "@/lib/insforge";
import { getUser } from "@/lib/dal";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const type = new URL(req.url).searchParams.get("type") ?? "design-md";

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }

  const job = await insforge.maybeSingle<{ id: string; user_id: string | null }>("generation_jobs", {
    id: `eq.${id}`,
    select: "id,user_id",
  });
  if (!job || job.user_id !== user.id) {
    return NextResponse.json({ error: { code: "NOT_FOUND" } }, { status: 404 });
  }

  const data = await insforge.maybeSingle<Record<string, string>>("generated_documents", {
    job_id: `eq.${id}`,
    select: "design_md,implementation_prompt",
  });

  if (!data) {
    return NextResponse.json(
      { error: { code: "RESULT_NOT_READY", message: "Hasil belum tersedia." } },
      { status: 409 },
    );
  }

  const isPrompt = type === "prompt-md";
  const body = isPrompt ? data.implementation_prompt : data.design_md;
  if (!body) {
    return NextResponse.json(
      { error: { code: "RESULT_NOT_READY", message: "Hasil belum tersedia." } },
      { status: 409 },
    );
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${isPrompt ? "IMPLEMENTATION_PROMPT.md" : "DESIGN.md"}"`,
    },
  });
}
