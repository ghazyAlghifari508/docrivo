import { createFileRoute } from "@tanstack/react-router"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { readScreenshot } from "~/storage/screenshots"
import { readOwnedJob } from "~/queries/jobs"
import { appDb } from "~/queries/app-db"

/**
 * `GET /api/screenshot/<jobId>/<page>.png` -- one captured page image.
 *
 * This route is new. The InsForge `screenshots` bucket served these objects
 * directly, so no application route existed for them, and the plan does not
 * specify one -- yet `writeScreenshot` persists `/api/screenshot/${key}` into
 * `crawled_pages.screenshot_desktop_url`, so without this handler every stored
 * screenshot URL 404s.
 *
 * **Authenticated by default, and ownership-checked.** That is a deliberate
 * departure from the old public bucket: a screenshot is a capture of a
 * third-party page belonging to somebody's job, and a public read is an
 * enumeration oracle over job ids. A caller who is not signed in, or who does
 * not own the job, gets the same not-found answer as a missing file, so the
 * route does not confirm that a given job id exists. If the product needs these
 * publicly addressable -- for example for a share link -- that is a deliberate
 * change to make with signed URLs, not a default to restore.
 */
export const Route = createFileRoute("/api/screenshot/$")({
  server: { handlers: { GET } },
})

const HEADERS: Record<string, string> = {
  "Cache-Control": "private, max-age=3600",
  "X-Content-Type-Options": "nosniff",
  // Images are rendered inside the sandboxed preview, so a stray `Content-Type`
  // that the browser sniffs as HTML would be script execution in this origin.
  "Content-Security-Policy": "sandbox; default-src 'none'",
}

export type ScreenshotRouteDeps = {
  /**
   * Injected alongside the others because `getRequestHeaders()` reads the Start
   * event from AsyncLocalStorage and throws `No StartEvent found` outside the
   * server runtime -- so a test that called the real one would never reach the
   * session lookup, let alone the assertions.
   */
  requestHeaders?: () => Headers
  resolveSession?: (headers: Headers) => Promise<{ user?: { id: string } | null } | null>
  readScreenshot?: typeof readScreenshot
  readOwnedJob?: typeof readOwnedJob
}

export async function GET(
  ctx: { request: Request; params: { _splat?: string } },
  deps: ScreenshotRouteDeps = {},
): Promise<Response> {
  const headers = (deps.requestHeaders ?? getRequestHeaders)()
  // Dynamic, not a top-level import: `~/auth/middleware` imports the Better
  // Auth instance, and a route file is in the client graph, so a static import
  // here put the whole auth server plus the `postgres` driver into
  // `dist/client`. Three other call sites already resolve it this way.
  const resolve = deps.resolveSession ?? (await import("~/auth/middleware")).resolveSession
  const session = await resolve(headers)
  const userId = session?.user?.id
  if (!userId) return new Response("Not found", { status: 404, headers: HEADERS })

  // The splat is everything after `/api/screenshot/`, e.g. `job-1/2.png`.
  const key = ctx.params._splat ?? ""
  const match = /^([A-Za-z0-9_-]{1,64})\/(\d{1,4})\.png$/.exec(key)
  if (!match) return new Response("Not found", { status: 404, headers: HEADERS })

  const [, jobId, rawPage] = match
  const pageIndex = Number(rawPage) - 1
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0) {
    return new Response("Not found", { status: 404, headers: HEADERS })
  }

  // A `..` or an encoded separator cannot survive the regex above, so the only
  // keys that reach `readScreenshot` are `<safe id>/<digits>.png`. Asserting the
  // resolved path stays under the root anyway, because that is the property the
  // storage module promises and this route must not be the thing that breaks it.
  if (key.includes("..") || key.includes("\0") || !key.startsWith(jobId)) {
    return new Response("Not found", { status: 404, headers: HEADERS })
  }

  try {
    // Ownership first: a job owned by somebody else must be indistinguishable
    // from one that does not exist, and from a file that was never written.
    //
    // The client is resolved here rather than as a parameter default, because a
    // `db` import at module scope would link the `postgres` driver into the
    // client bundle. See `src/queries/app-db.ts`.
    const readJob = deps.readOwnedJob ?? readOwnedJob
    await readJob({ jobId, userId }, await appDb())

    const bytes = await (deps.readScreenshot ?? readScreenshot)(jobId, pageIndex)
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: { ...HEADERS, "Content-Type": "image/png" },
    })
  } catch (error) {
    // `readOwnedJob` raises the router's not-found payload, which is a plain
    // object with `isNotFound` and no `status` -- so the check is on the
    // property the router itself branches on, not on a status code. A missing
    // file surfaces as an `ENOENT` Error instead, and both collapse to the same
    // 404 the caller already saw for a foreign job.
    if (error && typeof error === "object" && "isNotFound" in error) {
      return new Response("Not found", { status: 404, headers: HEADERS })
    }
    if (isEnoent(error)) {
      return new Response("Not found", { status: 404, headers: HEADERS })
    }
    throw error
  }
}

function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  )
}
