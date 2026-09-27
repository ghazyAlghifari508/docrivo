/**
 * The worker's persistence layer.
 *
 * Every write the background job makes used to go through `src/lib/insforge-core`
 * -- a hand-rolled PostgREST client that took a table name and an array of
 * snake_case rows. This module replaces it with typed Drizzle calls, which means
 * a column rename is a compile error here instead of a runtime `undefined` that
 * silently writes `null`.
 *
 * The client is the same one the web app uses, imported from `../src/db` rather
 * than built again: one connection string, one `dotenv` load, one place that
 * refuses to start without `DATABASE_URL`. Every function takes the client as an
 * explicit argument defaulting to that one, so `worker/db.test.ts` can pass
 * `testDb` and reach `docrivo_test`. The default is exactly the thing a test
 * would trip over by accident, because the two databases have identical schemas.
 *
 * ## What is NOT here
 *
 * `public.claim_next_job()` is called, not reimplemented. Its `for update skip
 * locked` inside one plpgsql statement is the only thing making the claim atomic,
 * and it lives in `migrations/0002_claim_next_job.sql` next to the stale-job
 * recovery pass, so neither process can drift from the other. `src/queries/jobs.ts`
 * has the sibling wrapper; both are one line over the same database function.
 */
import { eq, sql } from "drizzle-orm"
import { db, type DbClient } from "../src/db"
import {
  crawledPages,
  designExtractions,
  extractedAssets,
  generatedDocuments,
  generationJobs,
  jobLogs,
} from "../src/db/schema"
import { AppError } from "../src/lib/errors"
import type { DesignExtraction, JobStatus } from "../src/lib/types"

/** A `generation_jobs` row as the worker needs it. */
export type JobRow = typeof generationJobs.$inferSelect

/**
 * The columns a status change can also write.
 *
 * An explicit list rather than the old `Record<string, unknown>`, and that is the
 * point: the caller used to spread arbitrary snake_case keys straight into a
 * `PATCH`, and `updated_at` sat in that same bag, so a caller passing
 * `{ updated_at: ... }` would have silently overridden the timestamp the write
 * was supposed to stamp. Here the type says which columns exist.
 */
export type JobStatusPatch = {
  progress?: number
  pagesAnalyzed?: number
  completedAt?: Date
  errorCode?: string
  errorMessage?: string
}

/**
 * A failed write, as one error type.
 *
 * The crawl loop's `isPersistenceError` decides between "fail the job" and "this
 * one page did not load, carry on" by looking for `STORAGE_FAILED`, and it used to
 * find it by pattern-matching the InsForge client's error *messages*
 * (`PATCH ... failed 500`, `insert or update ...`). A Postgres unique-violation
 * message matches none of those words, so a failed write would have been counted
 * as a page failure and the job would have completed with a hole in it.
 *
 * The message is `ERROR_CODES.STORAGE_FAILED` rather than the driver's, and that
 * is not cosmetic. `generation_jobs.error_message` is rendered by
 * `generation-result.tsx`, and `postgres` puts the connection string in its error
 * message -- a DSN in a rendered page is a credential leak. The driver error is
 * kept as `cause` so the worker's own logging still has it.
 */
async function persist<T>(what: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    console.error(`[worker/db] ${what} failed`, err)
    throw new AppError("STORAGE_FAILED", undefined, { cause: err })
  }
}

/** The progress each stage means when the caller does not name one. */
const STAGE_PROGRESS: Record<JobStatus, number> = {
  queued: 0,
  crawling: 20,
  capturing: 40,
  extracting: 60,
  generating: 80,
  completed: 100,
  failed: 0,
  cancelled: 0,
}

const TERMINAL: readonly JobStatus[] = ["completed", "failed", "cancelled"]

/**
 * Each job's highest progress seen, so the bar never rewinds.
 *
 * Process state, not database state, exactly as before: the clamp is a rendering
 * convenience, and persisting it would mean reading the current value on every one
 * of the per-page writes.
 *
 * The terminal-status `delete` below is a memory bound, not a correctness fix, and
 * it is worth being exact about that. A job id is a UUID and is never reused, so
 * clearing the marker cannot un-cap a later job -- the keys are already different.
 * What it prevents is one leaked entry per job the process has ever seen, which on
 * a worker that runs for weeks is a slow leak in a long-lived map.
 */
const highWater = new Map<string, number>()

/**
 * The oldest queued job, already moved to `crawling`, or `null` for an empty queue.
 *
 * `null` and a throw are different answers and the caller treats them differently:
 * `null` is an idle queue and backs the poll interval off, a throw is a database
 * problem and doubles it.
 */
export async function claimNextJob(client: DbClient = db): Promise<JobRow | null> {
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

/**
 * Moves a job to `status`, stamping the progress the browser's bar reads.
 *
 * Progress is monotonic per job: a caller may pass a page-weighted value that is
 * lower than the stage default it replaces, and the bar must not rewind. The
 * high-water mark is keyed by job id, so one job's peak never caps another's.
 * `failed` and `cancelled` force zero *after* the clamp, deliberately -- a bar
 * sitting at 100% on a job that produced nothing is the thing being avoided.
 */
export async function advanceJobStatus(
  jobId: string,
  status: JobStatus,
  patch: JobStatusPatch = {},
  client: DbClient = db,
): Promise<void> {
  const { progress, ...rest } = patch
  let value = progress ?? STAGE_PROGRESS[status]

  const previous = highWater.get(jobId) ?? 0
  if (value < previous) value = previous
  if (value > previous) highWater.set(jobId, value)

  if (status === "failed" || status === "cancelled") value = 0
  if (TERMINAL.includes(status)) highWater.delete(jobId)

  await persist(`advanceJobStatus(${status})`, () =>
    client
      .update(generationJobs)
      .set({ status, progress: value, updatedAt: new Date(), ...rest })
      .where(eq(generationJobs.id, jobId)),
  )
}

export type JobLogEntry = {
  jobId: string
  level: "info" | "warn" | "error"
  event: string
  message?: string
  /**
   * A plain object, which is the column's contract and the shape
   * `errorDetails` produces. Worth being precise about why, because the comment
   * this replaces claimed the opposite: under PostgREST a pre-stringified value
   * *did* land as a JSON string literal, because the client serialised the row
   * itself. `postgres` sends the value as a `jsonb` parameter and Postgres parses
   * it, so a stringified payload now round-trips back to the same object. The
   * distinction is no longer observable from the database -- passing the object
   * is right because it is the declared type, not because the alternative is
   * visibly broken.
   */
  context?: unknown
}

export async function writeJobLog(
  entry: JobLogEntry,
  client: DbClient = db,
): Promise<void> {
  await persist("writeJobLog", () =>
    client.insert(jobLogs).values({
      jobId: entry.jobId,
      level: entry.level,
      event: entry.event,
      message: entry.message,
      context: entry.context,
    }),
  )
}

export type CrawledPageInput = {
  jobId: string
  url: string
  title: string | null
  statusCode: number
  screenshotDesktopUrl: string | null
}

/** Returns the new page's id, which `recordExtractedAsset` links its assets to. */
export async function recordCrawledPage(
  input: CrawledPageInput,
  client: DbClient = db,
): Promise<{ id: string }> {
  return persist("recordCrawledPage", async () => {
    const [page] = await client
      .insert(crawledPages)
      .values({
        jobId: input.jobId,
        url: input.url,
        title: input.title,
        statusCode: input.statusCode,
        screenshotDesktopUrl: input.screenshotDesktopUrl,
      })
      .returning({ id: crawledPages.id })
    return { id: page.id }
  })
}

export type ExtractedAssetInput = {
  jobId: string
  pageId: string | null
  assetType: string
  sourceUrl: string
  filename: string | null
}

export async function recordExtractedAsset(
  input: ExtractedAssetInput,
  client: DbClient = db,
): Promise<void> {
  await persist("recordExtractedAsset", () =>
    client.insert(extractedAssets).values({
      jobId: input.jobId,
      pageId: input.pageId,
      assetType: input.assetType,
      sourceUrl: input.sourceUrl,
      filename: input.filename,
      status: "found",
    }),
  )
}

/**
 * The six columns of the extraction that were stored. `Pick` off the crawler's own
 * `DesignExtraction`, so adding a field to the extraction does not silently start
 * persisting it -- the old code listed the same seven snake_case keys in a literal
 * that nothing checked against the type.
 *
 * `user_id` is absent on purpose. `sync_user_id_from_job()` is a `before insert`
 * trigger on all five child tables and fills it from the parent job, which is how
 * the InsForge path got it too: PostgREST fired the same trigger.
 */
export type DesignExtractionInput = Pick<
  DesignExtraction,
  "colors" | "typography" | "layout_patterns" | "components" | "metadata" | "confidence_score"
> & { jobId: string }

export async function recordDesignExtraction(
  input: DesignExtractionInput,
  client: DbClient = db,
): Promise<void> {
  await persist("recordDesignExtraction", () =>
    client.insert(designExtractions).values({
      jobId: input.jobId,
      colors: input.colors,
      typography: input.typography,
      layoutPatterns: input.layout_patterns,
      components: input.components,
      metadata: input.metadata,
      confidenceScore: input.confidence_score,
    }),
  )
}

export type GeneratedDocumentInput = {
  jobId: string
  designMd: string
  implementationPrompt: string
}

export async function recordGeneratedDocument(
  input: GeneratedDocumentInput,
  client: DbClient = db,
): Promise<void> {
  await persist("recordGeneratedDocument", () =>
    client.insert(generatedDocuments).values({
      jobId: input.jobId,
      designMd: input.designMd,
      implementationPrompt: input.implementationPrompt,
    }),
  )
}
