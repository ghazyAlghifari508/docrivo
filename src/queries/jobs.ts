import { createServerFn } from "@tanstack/react-start"
import { notFound } from "@tanstack/react-router"
import { and, asc, desc, eq, sql } from "drizzle-orm"
import { db, type DbClient } from "~/db"
import {
  crawledPages,
  extractedAssets,
  generatedDocuments,
  generationJobs,
} from "~/db/schema"
import { requireAdmin } from "~/auth/admin"
import { ERROR_CODES, failure, type ActionResult } from "~/lib/errors"
import { validateUrl } from "~/lib/url-validator"
import { consumeQuota, refundQuota } from "./entitlements"
import { checkRateLimit } from "./rate-limit"

export type Job = typeof generationJobs.$inferSelect

/**
 * The ownership rule, stated once for every function in this file: a job
 * belonging to another user must be indistinguishable from a job that does not
 * exist. Both raise `notFound()`, so a caller probing for someone else's job id
 * learns nothing -- not even that the id is real. A 403, or any other
 * "forbidden" answer, confirms the id exists, which turns the endpoint into an
 * enumeration oracle for other users' ids.
 *
 * It is enforced by scoping the WHERE clause to `user_id`, not by comparing the
 * result afterwards, so a row owned by somebody else never enters the result set
 * and reaches the `notFound()` below on the same path a missing row takes. One
 * path, one response.
 *
 * Split into plain functions plus thin server-function wrappers on purpose. A
 * `createServerFn` handler resolves its request context from AsyncLocalStorage
 * and throws `No Start context found` when called outside a request, so logic
 * inlined into one cannot be unit-tested. The plain functions take the Drizzle
 * client as an explicit argument, defaulting to the application `db`, so a
 * unit test can pass `testDb` and reach `docrivo_test`.
 */
function requireUser(ctx: {
  context: { user: { id: string; email: string } | null }
}): { id: string; email: string } {
  if (!ctx.context.user) {
    throw new Response("Unauthorized", { status: 401 })
  }
  return ctx.context.user
}

/** Queues a job. The caller has already validated and normalised the URL. */
export async function insertGeneration(
  input: {
    userId: string
    sourceUrl: string
    normalizedDomain: string
    maxPages?: number
    outputLanguage?: string
  },
  client: DbClient = db,
): Promise<Job> {
  const [job] = await client
    .insert(generationJobs)
    .values({
      userId: input.userId,
      sourceUrl: input.sourceUrl,
      normalizedDomain: input.normalizedDomain,
      maxPages: input.maxPages ?? 5,
      outputLanguage: input.outputLanguage ?? "id",
      status: "queued",
      progress: 0,
    })
    .returning()

  return job
}

export async function readOwnedJob(
  input: { jobId: string; userId: string },
  client: DbClient = db,
): Promise<Job> {
  const [job] = await client
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.id, input.jobId),
        eq(generationJobs.userId, input.userId),
      ),
    )
    .limit(1)

  if (!job) throw notFound()

  return job
}

export async function readJobList(
  input: { userId: string; limit?: number },
  client: DbClient = db,
): Promise<Job[]> {
  return client
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.userId, input.userId))
    .orderBy(desc(generationJobs.createdAt))
    .limit(input.limit ?? 50)
}

export async function removeJob(
  input: { jobId: string; userId: string },
  client: DbClient = db,
): Promise<{ ok: true }> {
  // 404 rather than 403: a 403 confirms the row exists.
  const deleted = await client
    .delete(generationJobs)
    .where(
      and(
        eq(generationJobs.id, input.jobId),
        eq(generationJobs.userId, input.userId),
      ),
    )
    .returning({ id: generationJobs.id })

  if (deleted.length === 0) throw notFound()

  return { ok: true }
}

/**
 * Claims the oldest queued job, or answers `null` when the queue is empty.
 *
 * The whole operation is one call to `select public.claim_next_job()`, and that
 * is not an implementation detail: the function's `for update skip locked`,
 * inside a single plpgsql statement, is the only thing making the claim atomic.
 * A read-then-write here -- select a queued row, then update it by id -- hands
 * the *same* row to two concurrent callers, which is the double-processing the
 * worker exists to prevent. `src/queries/jobs.test.ts` asserts that by racing
 * two claims and requiring two different ids.
 *
 * The function also requeues jobs abandoned mid-flight for more than ten
 * minutes. That recovery lives in the database, next to the claim, so the two
 * cannot drift apart.
 */
export async function claimNextJobRow(client: DbClient = db): Promise<Job | null> {
  const rows = await client.execute<{ id: string }>(
    sql`select (public.claim_next_job()).id as id`,
  )
  const id = rows[0]?.id
  if (!id) return null

  const [job] = await client
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, id))
    .limit(1)

  return job ?? null
}

export async function readJobPages(jobId: string, client: DbClient = db) {
  return client
    .select({
      id: crawledPages.id,
      url: crawledPages.url,
      title: crawledPages.title,
      screenshotDesktopUrl: crawledPages.screenshotDesktopUrl,
    })
    .from(crawledPages)
    .where(eq(crawledPages.jobId, jobId))
    .orderBy(asc(crawledPages.createdAt))
}

export async function readJobAssets(jobId: string, client: DbClient = db) {
  return client
    .select({
      id: extractedAssets.id,
      assetType: extractedAssets.assetType,
      sourceUrl: extractedAssets.sourceUrl,
      filename: extractedAssets.filename,
      status: extractedAssets.status,
    })
    .from(extractedAssets)
    .where(eq(extractedAssets.jobId, jobId))
    .orderBy(asc(extractedAssets.createdAt))
}

export async function readJobDocument(jobId: string, client: DbClient = db) {
  const [document] = await client
    .select({
      designMd: generatedDocuments.designMd,
      implementationPrompt: generatedDocuments.implementationPrompt,
    })
    .from(generatedDocuments)
    .where(eq(generatedDocuments.jobId, jobId))
    .limit(1)

  return document
    ? { designMd: document.designMd, implementationPrompt: document.implementationPrompt }
    : null
}

/**
 * The admin view's read: the most recent jobs across every user.
 *
 * Unscoped by design and by necessity -- `readJobList` is scoped to one user,
 * which is the whole point of it, and the admin table is the one place that has
 * to see other people's rows. That makes this the one function in the file that
 * is not an authorisation boundary on its own, so it carries no user id and no
 * session: the caller must have run `requireAdmin` first. `listRecentJobs` is
 * the server-function form and resolves the session itself.
 *
 * It is a projection, not whole rows, for the same reason the scrape list is:
 * the table shows a URL, a status, a page count and an error code.
 */
export type AdminJob = {
  id: string
  sourceUrl: string
  status: string
  errorCode: string | null
  pagesAnalyzed: number
}

export async function readRecentJobs(
  input: { limit?: number },
  client: DbClient = db,
): Promise<AdminJob[]> {
  return client
    .select({
      id: generationJobs.id,
      sourceUrl: generationJobs.sourceUrl,
      status: generationJobs.status,
      errorCode: generationJobs.errorCode,
      pagesAnalyzed: generationJobs.pagesAnalyzed,
    })
    .from(generationJobs)
    .orderBy(desc(generationJobs.createdAt))
    .limit(input.limit ?? 30)
}

/**
 * The admin view's read, as a server function.
 *
 * The gate lives here rather than in the route's loader, for two reasons. It
 * has to: `readRecentJobs` is unscoped, so nothing below this line authorises
 * anything. And a route loader runs in the client graph too, where the Start
 * plugin's import protection refuses `@tanstack/react-start/server` -- resolving
 * the session from a loader would need that import. Inside a server function's
 * handler the session is already in the middleware context, and the handler is
 * extracted to the server.
 *
 * `requireAdmin` raises the router's not-found payload for both a missing
 * session and an address that is not on the allowlist, so neither reveals that
 * `/admin` exists.
 */
export const listRecentJobs = createServerFn({ method: "GET" })
  .validator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    requireAdmin(context.user ? { email: context.user.email } : null)
    return readRecentJobs({ limit: data.limit ?? 30 })
  })

/**
 * `userId` is resolved from the middleware context, never from the payload.
 *
 * The Phase 3 stub took `{ jobId, userId }` as its validator input. That would
 * have let a caller pass somebody else's id and read their job, because the
 * ownership filter compares against whatever the caller said -- the check would
 * have been satisfied by the attacker's own value. Correctness of the ownership
 * rule depends on the user id being server-derived, so the validator accepts
 * the job id alone.
 */
export const getOwnedJob = createServerFn({ method: "GET" })
  .validator((input: { jobId: string }) => {
    if (!input?.jobId) throw new Error("jobId is required")
    return input
  })
  .handler(async ({ data, context }) => {
    const user = requireUser({ context })

    // The ownership check runs first and alone. If it raises, nothing about the
    // job's contents is read, so a caller who does not own it learns nothing
    // beyond the id not being theirs.
    const job = await readOwnedJob({ jobId: data.jobId, userId: user.id })

    // `allSettled`, not `all`: a failed child query must not hide an existing
    // DESIGN.md from the polling client. Each falls back to empty or null.
    const [pages, assets, document] = await Promise.allSettled([
      readJobPages(job.id),
      readJobAssets(job.id),
      readJobDocument(job.id),
    ])

    return {
      id: job.id,
      sourceUrl: job.sourceUrl,
      status: job.status,
      progress: job.progress,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      pagesAnalyzed: job.pagesAnalyzed,
      pages: pages.status === "fulfilled" ? pages.value : [],
      assets: assets.status === "fulfilled" ? assets.value : [],
      result: document.status === "fulfilled" ? document.value : null,
    }
  })

export const listJobs = createServerFn({ method: "GET" })
  .validator((input: { limit?: number }) => input ?? {})
  .handler(async ({ data, context }) => {
    const user = requireUser({ context })
    return readJobList({ userId: user.id, limit: data.limit })
  })

export const deleteJob = createServerFn({ method: "POST" })
  .validator((input: { jobId: string }) => {
    if (!input?.jobId) throw new Error("jobId is required")
    return input
  })
  .handler(async ({ data, context }) => {
    const user = requireUser({ context })
    return removeJob({ jobId: data.jobId, userId: user.id })
  })

/**
 * Creates a job for the signed-in user.
 *
 * Answers with a value rather than throwing, because the client has to tell
 * signed out, rate limited and unusable URL apart, and each has its own message
 * from `ERROR_CODES`.
 */
export const createGeneration = createServerFn({ method: "POST" })
  .validator((input: { url: string; maxPages?: number; outputLanguage?: string }) => {
    if (!input?.url || !input.url.trim()) throw new Error(ERROR_CODES.INVALID_URL)
    return input
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<ActionResult<{ jobId: string; status: string }>> => {
      const user = context.user
      if (!user) {
        return failure("UNAUTHORIZED", "Masuk dengan Google dulu.")
      }

      // Keyed by user id rather than by IP: several users behind one NAT share
      // an address and must not throttle each other.
      const allowed = await checkRateLimit({
        key: `generations:${user.id}`,
        limit: 5,
        windowSeconds: 60,
      })
      if (!allowed) return failure("RATE_LIMITED", ERROR_CODES.RATE_LIMITED)

      // Validate before anything is spent, so a typo cannot consume quota.
      let sourceUrl: string
      let normalizedDomain: string
      try {
        const valid = await validateUrl(data.url)
        sourceUrl = valid.normalized
        normalizedDomain = valid.url.hostname.toLowerCase()
      } catch {
        return failure("INVALID_URL", ERROR_CODES.INVALID_URL)
      }

      // The credit gate. `consume_quota` locks the entitlement row and only
      // increments if the plan's quota has room, so two clicks cannot both pass.
      // It sits after the URL check on purpose: an unusable URL must not cost a
      // credit.
      const quota = await consumeQuota({ userId: user.id, kind: "designmd" })
      if (!quota.allowed) {
        return failure("QUOTA_EXCEEDED", ERROR_CODES.QUOTA_EXCEEDED)
      }

      try {
        const job = await insertGeneration({
          userId: user.id,
          sourceUrl,
          normalizedDomain,
          maxPages: data.maxPages,
          outputLanguage: data.outputLanguage,
        })
        return { ok: true, jobId: job.id, status: job.status }
      } catch (error) {
        // The credit is spent and no job exists, so give it back. `refund_quota`
        // is idempotent and clamps at zero, so a repeat is harmless.
        await refundQuota({ userId: user.id, kind: "designmd" }).catch(() => undefined)
        throw error
      }
    },
  )

/**
 * The worker's entry point. A server function rather than a bare export so it
 * runs inside the same request-scoped pipeline as everything else. It takes no
 * user id because the queue is not user-scoped.
 */
export const claimNextJob = createServerFn({ method: "POST" })
  .handler(async (): Promise<Job | null> => claimNextJobRow())
