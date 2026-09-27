import { beforeEach, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { asc, eq } from "drizzle-orm"
import { testDb } from "../src/db"
import { crawledPages, designExtractions, extractedAssets, generatedDocuments, jobLogs } from "../src/db/schema"
import { generationJobs } from "../src/db/schema"
import { users } from "../src/db/schema-auth"

/**
 * The worker's persistence layer, against `docrivo_test` through `testDb` and
 * never the `db` application client. `worker/db.ts` defaults to `db` so the
 * worker process needs no wiring, and that default is exactly the thing a test
 * would trip over by accident -- the two databases have identical schemas, so a
 * test that reached the wrong one would pass.
 */
const client = () => {
  if (!testDb) {
    throw new Error(
      "DATABASE_URL_TEST is not set: refusing to write to the development database",
    )
  }
  return testDb
}

const USER_A = "00000000-0000-0000-0000-00000000000a"
/** Well-formed but absent, so a foreign key violation is the only possible failure. */
const MISSING_JOB = "00000000-0000-0000-0000-0000000000ff"

const seedJob = (status = "queued") =>
  client()
    .insert(generationJobs)
    .values({
      userId: USER_A,
      sourceUrl: "https://example.com",
      normalizedDomain: "example.com",
      status,
      maxPages: 3,
    })
    .returning()

beforeEach(async () => {
  await client().execute(sql`truncate generation_jobs cascade`)
  await client()
    .insert(users)
    .values({ id: USER_A, name: "User A", email: "user-a@example.com" })
    .onConflictDoNothing()
})

describe("claimNextJob", () => {
  it("claims the oldest queued job and returns the fields the worker reads", async () => {
    await client().execute(
      sql`insert into generation_jobs (user_id, source_url, normalized_domain, status, created_at)
          values (${USER_A}, 'https://newer.example', 'newer.example', 'queued', now())`,
    )
    const [older] = await seedJob()
    await client().execute(
      sql`update generation_jobs set created_at = now() - interval '1 hour' where id = ${older.id}`,
    )
    const { claimNextJob } = await import("./db")

    const job = await claimNextJob(client())

    // The three fields `crawl()` and `processJob()` read, asserted by value. A
    // rename that left `job.sourceUrl` undefined would throw inside the crawl
    // loop and be reported as a page failure, which is not what it is.
    expect(job?.sourceUrl).toBe("https://example.com")
    expect(job?.maxPages).toBe(3)
    expect(job?.status).toBe("crawling")
    expect(job?.progress).toBe(20)
  })

  it("returns null on an empty queue", async () => {
    const { claimNextJob } = await import("./db")

    // `resolves.toBeNull()`, not `rejects`: a claim that threw would satisfy a
    // `toThrow` assertion while being wrong, and the caller treats the two
    // differently -- a throw is a backoff, a null is an idle queue.
    await expect(claimNextJob(client())).resolves.toBeNull()
  })

  it("does not claim a job that is already running", async () => {
    await seedJob("generating")
    const { claimNextJob } = await import("./db")

    await expect(claimNextJob(client())).resolves.toBeNull()
  })
})

/**
 * `user_id` on the five child tables is filled by the
 * `sync_user_id_from_job()` `before insert` trigger, not by the worker. That is
 * the same arrangement the InsForge path relied on -- PostgREST fired the trigger
 * too -- so a port that started passing `userId` explicitly, or dropped the
 * column, would change who can read a row. These assertions are what pin it.
 */
describe("child rows inherit the job's user", () => {
  it("records a crawled page with its screenshot url and the job's user", async () => {
    const [job] = await seedJob()
    const { recordCrawledPage } = await import("./db")

    const page = await recordCrawledPage(
      {
        jobId: job.id,
        url: "https://example.com/pricing",
        title: "Pricing",
        statusCode: 200,
        screenshotDesktopUrl: `/api/screenshot/${job.id}/1.png`,
      },
      client(),
    )

    expect(page.id).toMatch(/^[0-9a-f-]{36}$/)
    const [stored] = await client()
      .select()
      .from(crawledPages)
      .where(eq(crawledPages.id, page.id))
    expect(stored.userId).toBe(USER_A)
    expect(stored.screenshotDesktopUrl).toBe(`/api/screenshot/${job.id}/1.png`)
  })

  it("records an extracted asset against the page", async () => {
    const [job] = await seedJob()
    const { recordCrawledPage, recordExtractedAsset } = await import("./db")
    const page = await recordCrawledPage(
      { jobId: job.id, url: "https://example.com", title: null, statusCode: 200, screenshotDesktopUrl: null },
      client(),
    )

    await recordExtractedAsset(
      {
        jobId: job.id,
        pageId: page.id,
        assetType: "font",
        sourceUrl: "https://example.com/f.woff2",
        filename: "f.woff2",
      },
      client(),
    )

    const [asset] = await client()
      .select()
      .from(extractedAssets)
      .where(eq(extractedAssets.jobId, job.id))
    expect(asset.pageId).toBe(page.id)
    expect(asset.userId).toBe(USER_A)
    // No assertion on `status`: the column defaults to "found" and the insert
    // states it explicitly, so any value it produced would read "found" and the
    // assertion would pass whether or not the code wrote it. `pageId` and
    // `userId` above are the ones the insert alone can produce.
  })

  it("records the design extraction and the generated document", async () => {
    const [job] = await seedJob()
    const { recordDesignExtraction, recordGeneratedDocument } = await import("./db")
    // The crawler's own field names, which is what `Pick<DesignExtraction, ...>`
    // takes -- `layout_patterns` and `confidence_score`, not camelCase. Passing
    // camelCase here is silently ignored by the column mapping rather than
    // rejected, so the assertions below are what notice.
    const extraction = {
      colors: [{ role: "dominant", value: "rgb(1, 2, 3)" }],
      typography: [{ family: "Inter" }],
      layout_patterns: ["top navigation"],
      components: ["hero section"],
      metadata: { title: "Example", description: "", theme: "unknown" as const, pagesAnalyzed: ["https://example.com"], pagesFailed: 0 },
      confidence_score: 0.8,
    }

    await recordDesignExtraction({ jobId: job.id, ...extraction }, client())
    await recordGeneratedDocument(
      { jobId: job.id, designMd: "# Example", implementationPrompt: "prompt" },
      client(),
    )

    const [stored] = await client()
      .select()
      .from(designExtractions)
      .where(eq(designExtractions.jobId, job.id))
    expect(stored.userId).toBe(USER_A)
    expect(stored.colors).toEqual(extraction.colors)
    expect(stored.layoutPatterns).toEqual(["top navigation"])
    // `real`, not `numeric`: 0.8 has to survive the round trip as 0.8.
    expect(stored.confidenceScore).toBe(0.8)

    const [doc] = await client()
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.jobId, job.id))
    expect(doc.designMd).toBe("# Example")
    expect(doc.userId).toBe(USER_A)
  })
})

describe("advanceJobStatus", () => {
  it("writes the status and the patch columns", async () => {
    const [job] = await seedJob()
    const { advanceJobStatus } = await import("./db")

    await advanceJobStatus(
      job.id,
      "completed",
      { progress: 100, pagesAnalyzed: 3, completedAt: new Date("2026-02-03T04:05:06Z") },
      client(),
    )

    const [stored] = await client()
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, job.id))
    expect(stored.status).toBe("completed")
    expect(stored.progress).toBe(100)
    expect(stored.pagesAnalyzed).toBe(3)
    expect(stored.completedAt?.toISOString()).toBe("2026-02-03T04:05:06.000Z")
  })

  it("never lets progress go backwards", async () => {
    // The bar in the browser is driven by this column, and a lower value makes it
    // jump backwards mid-job. The clamp is per job id, and `crawl` writes a
    // page-weighted progress that can legitimately be lower than the stage
    // default it replaces.
    const [job] = await seedJob()
    const { advanceJobStatus } = await import("./db")

    await advanceJobStatus(job.id, "capturing", { progress: 70 }, client())
    await advanceJobStatus(job.id, "extracting", { progress: 20 }, client())

    const [stored] = await client()
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, job.id))
    expect(stored.progress).toBe(70)
  })

  it("keys the high-water mark by job id, so one job never caps another", async () => {
    // Not the same assertion as the clamp above. A single scalar instead of a Map
    // would let a job that peaked at 100 leave the *next* job stuck at 100, and
    // that is the shape of bug this pins.
    //
    // The `highWater.delete` on a terminal status is a memory bound, not this: a
    // job id is a UUID and is never reused, so clearing the marker cannot un-cap
    // a later job. There is no observable difference through the exported
    // functions, so it is not asserted here rather than asserted vacuously.
    const { advanceJobStatus } = await import("./db")
    const [first] = await seedJob()
    const [second] = await seedJob()

    await advanceJobStatus(first.id, "completed", { progress: 100 }, client())
    await advanceJobStatus(second.id, "crawling", { progress: 20 }, client())

    const [stored] = await client()
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, second.id))
    expect(stored.progress).toBe(20)
  })

  it("forces progress to zero on a failure and on a cancellation", async () => {
    // Both bypass the clamp deliberately: a bar sitting at 100% on a job that
    // produced nothing is the exact thing this avoids.
    const { advanceJobStatus } = await import("./db")
    const [failed] = await seedJob()
    const [cancelled] = await seedJob()

    await advanceJobStatus(failed.id, "failed", { progress: 80, errorCode: "WEBSITE_BLOCKED", errorMessage: "blocked" }, client())
    await advanceJobStatus(cancelled.id, "cancelled", { progress: 80 }, client())

    const rows = await client()
      .select()
      .from(generationJobs)
      .orderBy(asc(generationJobs.createdAt))
    expect(rows.map((r) => r.progress)).toEqual([0, 0])
    expect(rows[0].errorCode).toBe("WEBSITE_BLOCKED")
    expect(rows[0].errorMessage).toBe("blocked")
  })

  it("reports a write failure as a STORAGE_FAILED AppError", async () => {
    // Load-bearing for the crawl loop, not for its own sake. `isPersistenceError`
    // in `worker/index.ts` decides between "fail the job" and "this one page did
    // not load, keep going" by looking for exactly this code. The old classifier
    // matched InsForge error *messages* ("... failed 500", "PATCH ..."), and a
    // Postgres unique-violation message matches none of them -- so without the
    // wrap, a failed write would be silently counted as a page failure.
    //
    // An `insert`, not an `update`: `update ... where id = <absent>` matches zero
    // rows and is a successful no-op, so it cannot be made to fail this way. The
    // foreign key on `job_logs.job_id` is what raises.
    const { writeJobLog } = await import("./db")

    await expect(
      writeJobLog(
        { jobId: MISSING_JOB, level: "error", event: "job_failed", message: "x" },
        client(),
      ),
    ).rejects.toMatchObject({ name: "AppError", code: "STORAGE_FAILED" })
  })

  it("does not put a connection string in the error message", async () => {
    // `generation_jobs.error_message` is rendered by `generation-result.tsx`, and
    // `postgres` puts the DSN in its error message. A DSN in a rendered page is a
    // credential leak, so the wrap keeps the driver's text as `cause` only. The
    // message itself is `ERROR_CODES.STORAGE_FAILED`, in Bahasa Indonesia.
    const { writeJobLog } = await import("./db")

    const error = await writeJobLog(
      { jobId: MISSING_JOB, level: "error", event: "job_failed" },
      client(),
    ).catch((err: unknown) => err)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe("Terjadi kendala saat menyimpan hasil.")
    expect((error as Error).message).not.toMatch(/postgres|:\/\/|password/i)
  })
})

describe("writeJobLog", () => {
  it("stores level, event, message and a plain-object context", async () => {
    const [job] = await seedJob()
    const { writeJobLog } = await import("./db")

    await writeJobLog(
      {
        jobId: job.id,
        level: "warn",
        event: "page_failed",
        message: "https://example.com/x",
        context: { name: "TimeoutError", message: "timed out" },
      },
      client(),
    )

    const [row] = await client().select().from(jobLogs).where(eq(jobLogs.jobId, job.id))
    expect(row.level).toBe("warn")
    expect(row.event).toBe("page_failed")
    expect(row.userId).toBe(USER_A)
    // The round trip preserves the object. Stated precisely because the
    // pre-stringify mutation SURVIVES this assertion: `postgres` sends the value
    // as a `jsonb` parameter, so `JSON.stringify(context)` lands back as the same
    // object. The comment in `worker/db.ts` that called the double-encode a
    // visible defect was true under PostgREST and is not true here.
    expect(row.context).toEqual({ name: "TimeoutError", message: "timed out" })
  })
})
