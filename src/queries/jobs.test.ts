import { beforeEach, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { testDb } from "~/db"
import { generationJobs, crawledPages, extractedAssets, generatedDocuments } from "~/db/schema"
import { users } from "~/db/schema-auth"

/**
 * Every test here targets `docrivo_test` through `testDb`, never the `db`
 * application client. `db` resolves `DATABASE_URL`, which is structurally
 * identical to the test database, so a suite that used it would pass while
 * writing fixtures into the development data. `client()` refuses to fall back
 * rather than defaulting, matching `src/db/schema.test.ts`.
 */
const client = () => {
  if (!testDb) {
    throw new Error(
      "DATABASE_URL_TEST is not set: refusing to write to the development database",
    )
  }
  return testDb
}

/**
 * `generation_jobs.id` and `.user_id` are `uuid`. A non-UUID string is rejected
 * by Postgres with `invalid input syntax for type uuid` before the query under
 * test runs, and the assertion then passes or fails for the wrong reason. Every
 * id below is a well-formed UUID.
 */
const USER_A = "00000000-0000-0000-0000-00000000000a"
const USER_B = "00000000-0000-0000-0000-00000000000b"

beforeEach(async () => {
  const c = client()
  // `cascade` reaches the job's children; `generation_jobs` has no FK to
  // `users`, so the two user rows below are seeded separately and left in place.
  await c.execute(sql`truncate generation_jobs cascade`)
  await c
    .insert(users)
    .values([
      { id: USER_A, name: "User A", email: "user-a@example.com" },
      { id: USER_B, name: "User B", email: "user-b@example.com" },
    ])
    .onConflictDoNothing()
})

const seedJob = (userId: string, sourceUrl: string) =>
  client()
    .insert(generationJobs)
    .values({
      userId,
      sourceUrl,
      normalizedDomain: new URL(sourceUrl).hostname,
    })
    .returning()

describe("insertGeneration", () => {
  it("inserts a queued job owned by the caller", async () => {
    const { insertGeneration } = await import("./jobs")
    const job = await insertGeneration(
      {
        userId: USER_A,
        sourceUrl: "https://example.com",
        normalizedDomain: "example.com",
      },
      client(),
    )

    // The return value, not the absence of a throw: a guard that "rejects" by
    // crashing satisfies a `toThrow()` assertion while being broken.
    expect(job.status).toBe("queued")
    expect(job.userId).toBe(USER_A)
    expect(job.progress).toBe(0)
    expect(job.maxPages).toBe(5)
  })

  it("honours an explicit maxPages and outputLanguage", async () => {
    const { insertGeneration } = await import("./jobs")
    const job = await insertGeneration(
      {
        userId: USER_A,
        sourceUrl: "https://example.com",
        normalizedDomain: "example.com",
        maxPages: 2,
        outputLanguage: "en",
      },
      client(),
    )

    expect(job.maxPages).toBe(2)
    expect(job.outputLanguage).toBe("en")
  })
})

describe("readOwnedJob", () => {
  it("returns the job to its owner", async () => {
    const [seeded] = await seedJob(USER_A, "https://a.example")
    const { readOwnedJob } = await import("./jobs")

    const job = await readOwnedJob({ jobId: seeded.id, userId: USER_A }, client())
    expect(job.id).toBe(seeded.id)
  })

  it("raises not-found, not forbidden, for a job owned by another user", async () => {
    // The row exists, so a 403 here would be a real leak of that fact. Assert
    // `isNotFound`, not `status: 404` -- `notFound()` returns
    // `{ isNotFound: true }` and carries no `status` field at all.
    const [seeded] = await seedJob(USER_A, "https://a.example")
    const { readOwnedJob } = await import("./jobs")

    await expect(
      readOwnedJob({ jobId: seeded.id, userId: USER_B }, client()),
    ).rejects.toMatchObject({ isNotFound: true })
  })

  it("raises the same not-found for an id that does not exist", async () => {
    const { readOwnedJob } = await import("./jobs")

    await expect(
      readOwnedJob({ jobId: "00000000-0000-0000-0000-0000000000ff", userId: USER_A }, client()),
    ).rejects.toMatchObject({ isNotFound: true })
  })
})

describe("readJobList", () => {  it("returns only the caller's jobs, newest first", async () => {
    await seedJob(USER_A, "https://older.example")
    await seedJob(USER_B, "https://theirs.example")
    await client().execute(
      sql`update generation_jobs set created_at = now() - interval '1 hour'
          where source_url = 'https://older.example'`,
    )
    await seedJob(USER_A, "https://newer.example")
    const { readJobList } = await import("./jobs")

    const jobs = await readJobList({ userId: USER_A }, client())

    expect(jobs.map((j) => j.sourceUrl)).toEqual([
      "https://newer.example",
      "https://older.example",
    ])
  })

  it("returns an empty list for a user with no jobs", async () => {
    await seedJob(USER_A, "https://a.example")
    const { readJobList } = await import("./jobs")

    expect(await readJobList({ userId: USER_B }, client())).toEqual([])
  })

  it("honours an explicit limit", async () => {
    await seedJob(USER_A, "https://one.example")
    await seedJob(USER_A, "https://two.example")
    const { readJobList } = await import("./jobs")

    expect(await readJobList({ userId: USER_A, limit: 1 }, client())).toHaveLength(1)
  })
})

/**
 * The three child queries behind `getOwnedJob`. They run after the ownership
 * check has already passed, so they are not an authorisation boundary -- but a
 * `jobId` filter dropped from one of them would leak another job's page list,
 * asset list or generated document into the response, and that is worth a test
 * of its own.
 */
describe("job detail child queries", () => {
  it("returns only the pages of the requested job, oldest first", async () => {
    const [mine] = await seedJob(USER_A, "https://mine.example")
    const [theirs] = await seedJob(USER_A, "https://theirs.example")
    const c = client()
    await c.insert(crawledPages).values([
      { jobId: mine.id, url: "https://mine.example/2", createdAt: new Date("2026-01-02") },
      { jobId: mine.id, url: "https://mine.example/1", createdAt: new Date("2026-01-01") },
      { jobId: theirs.id, url: "https://theirs.example/1", createdAt: new Date("2026-01-01") },
    ])
    const { readJobPages } = await import("./jobs")

    const pages = await readJobPages(mine.id, c)

    expect(pages.map((p) => p.url)).toEqual([
      "https://mine.example/1",
      "https://mine.example/2",
    ])
  })

  it("returns only the assets of the requested job", async () => {
    const [mine] = await seedJob(USER_A, "https://mine.example")
    const [theirs] = await seedJob(USER_A, "https://theirs.example")
    const c = client()
    await c.insert(extractedAssets).values([
      { jobId: mine.id, assetType: "font", sourceUrl: "https://mine.example/f.woff2" },
      { jobId: theirs.id, assetType: "font", sourceUrl: "https://theirs.example/f.woff2" },
    ])
    const { readJobAssets } = await import("./jobs")

    const assets = await readJobAssets(mine.id, c)

    expect(assets.map((a) => a.sourceUrl)).toEqual(["https://mine.example/f.woff2"])
    expect(assets[0]?.assetType).toBe("font")
  })

  it("returns the generated document for the job, and null when there is none", async () => {
    const [mine] = await seedJob(USER_A, "https://mine.example")
    const [theirs] = await seedJob(USER_A, "https://theirs.example")
    const c = client()
    await c.insert(generatedDocuments).values({
      jobId: theirs.id,
      designMd: "# theirs",
      implementationPrompt: "prompt theirs",
    })
    const { readJobDocument } = await import("./jobs")

    // `toBeNull()` rather than "does not throw": returning undefined instead of
    // null would serialise to nothing and the client would read it as missing.
    await expect(readJobDocument(mine.id, c)).resolves.toBeNull()

    await c.insert(generatedDocuments).values({
      jobId: mine.id,
      designMd: "# mine",
      implementationPrompt: "prompt mine",
    })

    expect(await readJobDocument(mine.id, c)).toEqual({
      designMd: "# mine",
      implementationPrompt: "prompt mine",
    })
  })
})

describe("removeJob", () => {
  it("deletes a job the caller owns", async () => {
    const [seeded] = await seedJob(USER_A, "https://a.example")
    const { removeJob, readJobList } = await import("./jobs")

    expect(await removeJob({ jobId: seeded.id, userId: USER_A }, client())).toEqual({ ok: true })
    expect(await readJobList({ userId: USER_A }, client())).toEqual([])
  })

  it("refuses to delete another user's job, and leaves it in place", async () => {
    const [seeded] = await seedJob(USER_A, "https://a.example")
    const { removeJob, readJobList } = await import("./jobs")

    await expect(
      removeJob({ jobId: seeded.id, userId: USER_B }, client()),
    ).rejects.toMatchObject({ isNotFound: true })
    // A refusal that had already deleted the row would pass the assertion above.
    expect(await readJobList({ userId: USER_A }, client())).toHaveLength(1)
  })
})

describe("claimNextJobRow", () => {
  it("never hands the same job to two claims", async () => {
    await seedJob(USER_A, "https://a.example")
    await seedJob(USER_A, "https://b.example")
    const { claimNextJobRow } = await import("./jobs")

    // Two statements issued at once land on two pool connections, so this is a
    // real race and not a sequential one. It is the assertion that `public
    // .claim_next_job()`'s `for update skip locked` is load-bearing: a
    // read-then-write implementation returns the same id here.
    const [first, second] = await Promise.all([
      claimNextJobRow(client()),
      claimNextJobRow(client()),
    ])

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first?.id).not.toBe(second?.id)
  })

  it("moves a claimed job out of the queue", async () => {
    await seedJob(USER_A, "https://a.example")
    const { claimNextJobRow } = await import("./jobs")

    const claimed = await claimNextJobRow(client())

    expect(claimed?.status).toBe("crawling")
    expect(claimed?.progress).toBe(20)
  })

  it("returns null when the queue is empty", async () => {
    const { claimNextJobRow } = await import("./jobs")

    // `resolves.toBeNull()`, not `rejects`: an implementation that threw instead
    // of answering would satisfy a `toThrow` assertion while being wrong.
    await expect(claimNextJobRow(client())).resolves.toBeNull()
  })

  it("does not claim a job that is already running", async () => {
    await seedJob(USER_A, "https://a.example")
    const { claimNextJobRow } = await import("./jobs")

    await claimNextJobRow(client())

    await expect(claimNextJobRow(client())).resolves.toBeNull()
  })
})
