import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { notFound } from "@tanstack/react-router"
import { and, desc, eq } from "drizzle-orm"
import type { DbClient } from "~/db"
import { scrapeArtifacts } from "~/db/schema"
import { AppError, ERROR_CODES, failure, type ActionResult } from "~/lib/errors"
import { scrapeHtml } from "~/lib/fetch-html"
import { validateUrl } from "~/lib/url-validator"
import { consumeQuota, refundQuota } from "./entitlements"
import { checkRateLimit } from "./rate-limit"
import { appDb } from "~/queries/app-db"

export type ScrapeArtifact = typeof scrapeArtifacts.$inferSelect

/**
 * Mirrors the ownership rule in `src/queries/jobs.ts`: an artifact belonging to
 * another user must be indistinguishable from one that does not exist, so both
 * raise `notFound()`. A 403 would confirm the id is real, which turns the route
 * into an enumeration oracle.
 *
 * `scrape_artifacts.user_id` is `NOT NULL` -- there are no guest artifacts --
 * so scoping by user id is total rather than a filter over nullable rows.
 *
 * The plain functions take the Drizzle client as an argument, defaulting to the
 * application `db`, so a unit test can pass `testDb` and reach `docrivo_test`.
 * A `createServerFn` handler cannot be called outside a request, so the logic
 * that holds the rule lives here.
 */
function requireUser(ctx: {
  context: { user: { id: string; email: string } | null }
}): { id: string; email: string } {
  if (!ctx.context.user) {
    throw new Response("Unauthorized", { status: 401 })
  }
  return ctx.context.user
}

export type ScrapeCapture = {
  userId: string
  sourceUrl: string
  status: number
  html: string
  previewHtml: string
  metadata: Record<string, unknown>
}

/**
 * What `getScrape` answers with. The capture metadata is what the detail view
 * renders -- attempt, capture time, final URL, viewport, byte counts -- so it is
 * typed rather than left as `unknown`.
 */
export type ScrapeDetail = {
  id: string
  sourceUrl: string
  html: string
  previewHtml: string
  metadata: ScrapeMetadata
  createdAt: Date
}

export type ScrapeMetadata = {
  attempt: number
  capturedAt: string
  finalUrl: string
  viewport: { width: number; height: number }
  captureMode: string
  htmlBytes: number
  previewHtmlBytes: number
}

/**
 * Drizzle types a `jsonb` column as `unknown`, and a server function's return
 * value has to satisfy the framework's serialisation check -- `unknown` does not.
 * The column is `notNull` with a `'{}'` default, so the object branch is the
 * normal case and the `{}` branch only covers a row written outside this code.
 * The field-level cast is honest about what it is: the column is untyped jsonb,
 * and this is the shape the writer in `fetch-html.ts` produces.
 */
function asMetadata(value: unknown): ScrapeMetadata {
  return value as ScrapeMetadata
}

export async function insertScrapeArtifact(
  capture: ScrapeCapture,
  client: DbClient,
): Promise<ScrapeArtifact> {
  const [artifact] = await client.insert(scrapeArtifacts).values(capture).returning()
  return artifact
}

export async function readScrape(
  input: { scrapeId: string; userId: string },
  client: DbClient,
): Promise<ScrapeArtifact> {
  const [artifact] = await client
    .select()
    .from(scrapeArtifacts)
    .where(
      and(
        eq(scrapeArtifacts.id, input.scrapeId),
        eq(scrapeArtifacts.userId, input.userId),
      ),
    )
    .limit(1)

  if (!artifact) throw notFound()

  return artifact
}

/**
 * The list view. Deliberately a projection rather than whole rows: `html` and
 * `preview_html` reach ~6 MB each, and a history list needs a URL and a date.
 */
export type ScrapeSummary = {
  id: string
  sourceUrl: string
  status: number
  createdAt: Date
}

export async function readScrapeList(
  input: { userId: string; limit?: number },
  client: DbClient,
): Promise<ScrapeSummary[]> {
  return client
    .select({
      id: scrapeArtifacts.id,
      sourceUrl: scrapeArtifacts.sourceUrl,
      status: scrapeArtifacts.status,
      createdAt: scrapeArtifacts.createdAt,
    })
    .from(scrapeArtifacts)
    .where(eq(scrapeArtifacts.userId, input.userId))
    .orderBy(desc(scrapeArtifacts.createdAt))
    .limit(input.limit ?? 50)
}

export async function removeScrape(
  input: { scrapeId: string; userId: string },
  client: DbClient,
): Promise<{ ok: true }> {
  // 404 rather than 403: a 403 confirms the row exists.
  const deleted = await client
    .delete(scrapeArtifacts)
    .where(
      and(
        eq(scrapeArtifacts.id, input.scrapeId),
        eq(scrapeArtifacts.userId, input.userId),
      ),
    )
    .returning({ id: scrapeArtifacts.id })

  if (deleted.length === 0) throw notFound()

  return { ok: true }
}

export const getScrape = createServerFn({ method: "GET" })
  .validator((input: { scrapeId: string }) => {
    if (!input?.scrapeId) throw new Error("scrapeId is required")
    return input
  })
  .handler(async ({ data, context }): Promise<ScrapeDetail> => {
    const user = requireUser({ context })
    const artifact = await readScrape({ scrapeId: data.scrapeId, userId: user.id }, await appDb())

    return {
      id: artifact.id,
      sourceUrl: artifact.sourceUrl,
      html: artifact.html,
      previewHtml: artifact.previewHtml,
      metadata: asMetadata(artifact.metadata),
      createdAt: artifact.createdAt,
    }
  })

export const listScrapes = createServerFn({ method: "GET" })
  .validator((input: { limit?: number } = {}) => input)
  .handler(async ({ data, context }) => {
    const user = requireUser({ context })
    return readScrapeList({ userId: user.id, limit: data.limit }, await appDb())
  })

export const deleteScrape = createServerFn({ method: "POST" })
  .validator((input: { scrapeId: string }) => {
    if (!input?.scrapeId) throw new Error("scrapeId is required")
    return input
  })
  .handler(async ({ data, context }) => {
    const user = requireUser({ context })
    return removeScrape({ scrapeId: data.scrapeId, userId: user.id }, await appDb())
  })

/**
 * Runs the scrape end to end and stores the result.
 *
 * Answers with a value rather than throwing, because the client distinguishes
 * signed out, rate limited, out of credits, private URL and unreachable site --
 * each with its own message.
 *
 * `scrapeHtml` is imported at module scope on purpose: it reaches Playwright
 * through a dynamic `import()` of `render-page`, so naming it here does not pull
 * a browser into this module's load graph.
 */
export const createScrape = createServerFn({ method: "POST" })
  .validator((input: { url: string; attemptNumber?: number }) => {
    if (!input?.url || !input.url.trim()) throw new Error(ERROR_CODES.INVALID_URL)
    return input
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<ActionResult<{ scrapeId: string; sourceUrl: string }>> => {
      const user = context.user
      if (!user) return failure("UNAUTHORIZED", "Masuk dengan Google dulu.")

      // `getRequestHeaders()` rather than a `request` argument: a `type:
      // "function"` middleware's server handler receives `data`, `context`,
      // `next`, `method`, `serverFnMeta` and `signal` -- there is no `request`.
      // Only `type: "request"` middleware gets one, and this is a server
      // function. The fallback keeps a caller with no forwarded header from
      // being rate limited per-call rather than per-address.
      const forwarded = getRequestHeaders().get("x-forwarded-for")
      const client = forwarded?.split(",")[0]?.trim() ?? "local"
      const allowed = await checkRateLimit({
        key: `scrape:${client}`,
        limit: 5,
        windowSeconds: 60,
      }, await appDb())
      if (!allowed) return failure("RATE_LIMITED", ERROR_CODES.RATE_LIMITED)

      // Validate before anything is spent, so a private or malformed URL cannot
      // consume quota. `validateUrl` resolves DNS and rejects link-local,
      // loopback and private ranges, which is the SSRF guard.
      let normalized: string
      try {
        normalized = (await validateUrl(data.url)).normalized
      } catch (error) {
        return failure(
          "INVALID_URL",
          error instanceof AppError ? error.message : ERROR_CODES.PRIVATE_URL_BLOCKED,
        )
      }

      // The credit gate, before any browser is launched. `consume_quota` locks
      // the entitlement row, so two clicks cannot both pass.
      const quota = await consumeQuota({ userId: user.id, kind: "scrape" }, await appDb())
      if (!quota.allowed) {
        return failure("QUOTA_EXCEEDED", ERROR_CODES.QUOTA_EXCEEDED)
      }

      let captured: Awaited<ReturnType<typeof scrapeHtml>>
      try {
        captured = await scrapeHtml(normalized, data.attemptNumber)
      } catch (error) {
        // The scrape never produced anything, so the credit was never really
        // used. Idempotent and clamped at zero, so a repeat is harmless.
        await refundQuota({ userId: user.id, kind: "scrape" }, await appDb()).catch(() => undefined)
        if (error instanceof AppError) {
          return failure(error.code, error.message)
        }
        return failure("BACKEND_TRANSIENT", ERROR_CODES.BACKEND_TRANSIENT)
      }

      let stored
      try {
        stored = await insertScrapeArtifact({
          userId: user.id,
          sourceUrl: captured.sourceUrl,
          status: captured.status,
          html: captured.html,
          previewHtml: captured.previewHtml,
          metadata: captured.metadata,
        }, await appDb())
      } catch {
        // The scrape succeeded and the write did not. Saying "website blocked"
        // here would send the user off to fix a URL that was never the problem.
        await refundQuota({ userId: user.id, kind: "scrape" }, await appDb()).catch(() => undefined)
        return failure("STORAGE_FAILED", ERROR_CODES.STORAGE_FAILED)
      }

      return { ok: true, scrapeId: stored.id, sourceUrl: stored.sourceUrl }
    },
  )
