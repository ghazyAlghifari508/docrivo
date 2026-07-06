import { NextResponse } from "next/server";
import { insforge } from "@/lib/insforge";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const type = new URL(req.url).searchParams.get("type") ?? "design-md";

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
