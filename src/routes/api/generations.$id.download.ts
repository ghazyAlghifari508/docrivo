import { createFileRoute, isNotFound } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { db, type DbClient } from "~/db"
import { generatedDocuments } from "~/db/schema"
import { readOwnedJob } from "~/queries/jobs"

/**
 * `GET /api/generations/$id/download` -- the DESIGN.md and implementation prompt
 * as file downloads.
 *
 * A route handler rather than a server function because the browser navigates to
 * it with a plain `<a download>`, which a server-function fetch cannot do.
 */
export const Route = createFileRoute("/api/generations/$id/download")({
  server: { handlers: { GET } },
})

export type DownloadOutcome =
  | { kind: "unauthorized" }
  | { kind: "not_found" }
  | { kind: "not_ready" }
  | { kind: "ok"; body: string; filename: string }

const FILENAMES = {
  "design-md": "DESIGN.md",
  "prompt-md": "IMPLEMENTATION_PROMPT.md",
} as const

/**
 * The download decision, as a plain function so the ownership rule can be
 * tested without a request.
 *
 * The ownership check comes first and alone, and it reuses `readOwnedJob` so
 * there is one implementation of the rule rather than two that can drift. It
 * raises the router's not-found payload for a job owned by somebody else and for
 * an id that does not exist alike; a 403 for the first would confirm the id is
 * real, which is an enumeration oracle.
 *
 * `409` for "not generated yet" is deliberately not a 404. The caller has already
 * proved they own the job, so there is nothing to hide, and a 404 would send the
 * polling page into its "this result is gone" state for a job that is merely
 * still running.
 */
export async function resolveDownload(
  input: { jobId: string; type: string; userId: string | null },
  client: DbClient = db,
): Promise<DownloadOutcome> {
  if (!input.userId) return { kind: "unauthorized" }

  try {
    // The ownership check, first and alone. Throws the router's not-found
    // payload, which is the shape a route loader wants; this is an HTTP route,
    // so it is translated into the outcome below rather than into a Response, and
    // the translation happens in exactly one place.
    await readOwnedJob({ jobId: input.jobId, userId: input.userId }, client)
  } catch (error) {
    if (isNotFound(error)) return { kind: "not_found" }
    throw error
  }

  const [document] = await client
    .select({
      designMd: generatedDocuments.designMd,
      implementationPrompt: generatedDocuments.implementationPrompt,
    })
    .from(generatedDocuments)
    .where(eq(generatedDocuments.jobId, input.jobId))
    .limit(1)

  const isPrompt = input.type === "prompt-md"
  const body = isPrompt ? document?.implementationPrompt : document?.designMd
  if (!body) return { kind: "not_ready" }

  return {
    kind: "ok",
    body,
    filename: isPrompt ? FILENAMES["prompt-md"] : FILENAMES["design-md"],
  }
}

/**
 * Outcome to HTTP status. Kept separate from `resolveDownload` so the mapping is
 * assertable on its own: a 403 anywhere in here would be the bug the ownership
 * rule exists to prevent, and a test that only checked "cross-user is not 200"
 * would not notice one.
 */
export function downloadResponse(outcome: DownloadOutcome): Response {
  switch (outcome.kind) {
    case "unauthorized":
      return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 })
    case "not_found":
      return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 })
    case "not_ready":
      return Response.json(
        { error: { code: "RESULT_NOT_READY", message: "Hasil belum tersedia." } },
        { status: 409 },
      )
    case "ok":
      return new Response(outcome.body, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${outcome.filename}"`,
        },
      })
  }
}

export async function GET(ctx: {
  params: { id: string }
  request: Request
}): Promise<Response> {
  const { id } = ctx.params
  const type = new URL(ctx.request.url).searchParams.get("type") ?? "design-md"

  // `resolveSession` is shared with the function middleware, which has no
  // `request` argument of its own, so it takes `Headers` rather than a request.
  const { resolveSession } = await import("~/auth/middleware")
  const session = await resolveSession(ctx.request.headers)

  return downloadResponse(
    await resolveDownload({ jobId: id, type, userId: session?.user?.id ?? null }),
  )
}
