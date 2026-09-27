import { beforeEach, describe, expect, it, vi } from "vitest"
import { sql } from "drizzle-orm"
import { testDb } from "../src/db"
import { generatedDocuments, generationJobs, scrapeArtifacts } from "../src/db/schema"
import { users } from "../src/db/schema-auth"

/**
 * Retention, against `docrivo_test` through `testDb` and never the `db`
 * application client -- the two schemas are identical, so a test that reached the
 * wrong one would pass.
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

/** A fixed instant, so "older than" is a comparison and not a wait. */
const NOW = new Date("2026-06-07T08:09:10.000Z")

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000)

/** `scrape_artifacts` requires a user; the html and preview html are NOT NULL. */
const seedArtifact = (url: string, createdAt: Date) =>
  client()
    .insert(scrapeArtifacts)
    .values({
      userId: USER_A,
      sourceUrl: url,
      status: 200,
      html: "<html></html>",
      previewHtml: "<html></html>",
      createdAt,
    })
    .returning({ id: scrapeArtifacts.id })

const seedDocument = (createdAt: Date) =>
  client()
    .insert(generationJobs)
    .values({
      userId: USER_A,
      sourceUrl: "https://example.com",
      normalizedDomain: "example.com",
      status: "completed",
    })
    .returning({ id: generationJobs.id })
    .then(([job]) =>
      client()
        .insert(generatedDocuments)
        .values({
          jobId: job.id,
          designMd: "# Example",
          implementationPrompt: "prompt",
          createdAt,
        })
        .returning({ id: generatedDocuments.id }),
    )

const remainingArtifacts = async () =>
  client().select({ url: scrapeArtifacts.sourceUrl }).from(scrapeArtifacts)

const remainingDocuments = async () =>
  client()
    .select({ md: generatedDocuments.designMd })
    .from(generatedDocuments)

beforeEach(async () => {
  await client().execute(sql`truncate generation_jobs cascade`)
  await client().execute(sql`truncate scrape_artifacts cascade`)
  await client()
    .insert(users)
    .values({ id: USER_A, name: "User A", email: "user-a@example.com" })
    .onConflictDoNothing()
})

describe("runRetention: scrape artifacts", () => {
  it("deletes artifacts older than the threshold and keeps recent ones", async () => {
    await seedArtifact("https://old.com", daysAgo(40))
    await seedArtifact("https://new.com", daysAgo(1))
    const { runRetention } = await import("./retention")

    const removed = await runRetention(
      { artifactDays: 30, documentDays: 3650, now: NOW },
      client(),
    )

    expect(removed.artifacts).toBe(1)
    const left = await remainingArtifacts()
    expect(left).toHaveLength(1)
    expect(left[0].url).toBe("https://new.com")
  })

  it("keeps an artifact exactly on the threshold", async () => {
    // The same boundary the lease test pins, for the same reason: a rule written
    // `<=` instead of `<` differs from one written `<` only at equality, and a
    // test that never sits on the instant cannot tell them apart.
    await seedArtifact("https://edge.com", daysAgo(30))
    const { runRetention } = await import("./retention")

    await runRetention({ artifactDays: 30, documentDays: 3650, now: NOW }, client())

    expect(await remainingArtifacts()).toHaveLength(1)
  })

  it("answers with a zero count on an empty table", async () => {
    const { runRetention } = await import("./retention")

    const removed = await runRetention(
      { artifactDays: 30, documentDays: 3650, now: NOW },
      client(),
    )

    // Returned counts, not "did not throw": a retention pass that deleted nothing
    // and one that found nothing to delete are the same answer only if the count
    // is what comes back.
    expect(removed).toEqual({ artifacts: 0, documents: 0 })
  })
})

describe("runRetention: the paid-output guard", () => {
  it("keeps a generated document eight years old when thirty days were asked for", async () => {
    // The load-bearing assertion of this task.
    //
    // `generated_documents` holds the artefact the user paid for: the DESIGN.md
    // itself. A retention job that deletes it is not cleaning up, it is
    // destroying revenue and the user's purchase at once, and it does it silently
    // -- no error, no row, just a download that 404s for work already paid for.
    //
    // The threshold here is `documentDays: 30`, far below the floor, and the row
    // is eight years old. Any floor anywhere below roughly 2,900 days fails this
    // assertion, which is the point: the guard is not "a big number somebody
    // picked", it is a floor that a request cannot talk the job under.
    await seedDocument(daysAgo(365 * 8))
    const { runRetention } = await import("./retention")

    const removed = await runRetention(
      { artifactDays: 30, documentDays: 30, now: NOW },
      client(),
    )

    expect(removed.documents).toBe(0)
    const left = await remainingDocuments()
    expect(left).toHaveLength(1)
    expect(left[0].md).toBe("# Example")
  })

  it("raises a below-floor request to the floor rather than honouring it", async () => {
    // The mechanism, stated as its own assertion so a floor that stopped being
    // applied -- rather than a floor that moved -- is what goes red.
    await seedDocument(daysAgo(365 * 8))
    const { runRetention, effectiveDocumentDays } = await import("./retention")

    expect(effectiveDocumentDays(1)).toBe(3650)
    expect(effectiveDocumentDays(30)).toBe(3650)
    expect(effectiveDocumentDays(3650)).toBe(3650)
    // Above the floor the request is honoured: the floor is a minimum, not a
    // constant, or lowering it would become impossible without a code change.
    expect(effectiveDocumentDays(7300)).toBe(7300)

    await runRetention({ artifactDays: 30, documentDays: 1, now: NOW }, client())
    expect(await remainingDocuments()).toHaveLength(1)
  })

  it("still deletes a document that is past even the floor", async () => {
    // A floor that can never be crossed is not a retention policy. Sixteen years is
    // past ten, and by then the row is a liability rather than a purchase -- but
    // this is the one deletion the guard is not protecting, and it has to be
    // reachable or the guard is untested in the other direction.
    await seedDocument(daysAgo(365 * 16))
    const { runRetention } = await import("./retention")

    const removed = await runRetention(
      { artifactDays: 30, documentDays: 3650, now: NOW },
      client(),
    )

    expect(removed.documents).toBe(1)
    expect(await remainingDocuments()).toHaveLength(0)
  })

  it("prunes artifacts in the same pass without touching documents", async () => {
    // The two halves are independent. A pass that deleted documents because it was
    // also pruning artifacts would satisfy both suites separately and neither.
    await seedArtifact("https://old.com", daysAgo(400))
    await seedDocument(daysAgo(400))
    const { runRetention } = await import("./retention")

    const removed = await runRetention(
      { artifactDays: 30, documentDays: 3650, now: NOW },
      client(),
    )

    expect(removed).toEqual({ artifacts: 1, documents: 0 })
    expect(await remainingArtifacts()).toHaveLength(0)
    expect(await remainingDocuments()).toHaveLength(1)
  })
})

describe("retention configuration", () => {
  it("defaults artifacts to 30 days and documents to the floor", async () => {
    const { resolveRetention } = await import("./retention")

    expect(resolveRetention({})).toEqual({ artifactDays: 30, documentDays: 3650 })
  })

  it("reads both from the environment", async () => {
    const { resolveRetention } = await import("./retention")

    expect(
      resolveRetention({
        RETENTION_ARTIFACT_DAYS: "7",
        RETENTION_DOCUMENT_DAYS: "5000",
      }),
    ).toEqual({ artifactDays: 7, documentDays: 5000 })
  })

  it("falls back to the defaults on a value that is not a number of days", async () => {
    // `Number("monthly")` is `NaN`, and `NaN` in a date arithmetic expression is
    // `NaN`, which PostgreSQL turns into a comparison against an invalid date.
    const { resolveRetention } = await import("./retention")

    expect(
      resolveRetention({
        RETENTION_ARTIFACT_DAYS: "monthly",
        RETENTION_DOCUMENT_DAYS: "",
      }),
    ).toEqual({ artifactDays: 30, documentDays: 3650 })
  })

  it("never resolves a document threshold under the floor, whatever is configured", async () => {
    // Configuration is not a back door around the guard. An operator who sets
    // `RETENTION_DOCUMENT_DAYS=1` gets the floor, not a job that deletes paid
    // output, and the effective value is visible rather than implied.
    const { resolveRetention, effectiveDocumentDays } = await import("./retention")

    const resolved = resolveRetention({ RETENTION_DOCUMENT_DAYS: "1" })
    expect(resolved.documentDays).toBe(1)
    expect(effectiveDocumentDays(resolved.documentDays)).toBe(3650)
  })
})

describe("the hourly schedule", () => {
  it("runs on the first tick and not again inside the interval", async () => {
    // An injected clock, so "once an hour" is a comparison rather than a sleep.
    const run = vi.fn(async () => ({ artifacts: 0, documents: 0 }))
    const { createRetentionSchedule } = await import("./retention")
    let now = NOW
    const schedule = createRetentionSchedule({
      intervalMs: 3_600_000,
      now: () => now,
      run,
    })

    expect(await schedule.tick()).toBe(true)
    now = new Date(NOW.getTime() + 3_599_999)
    expect(await schedule.tick()).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("runs again once the interval has elapsed", async () => {
    const run = vi.fn(async () => ({ artifacts: 0, documents: 0 }))
    const { createRetentionSchedule } = await import("./retention")
    let now = NOW
    const schedule = createRetentionSchedule({
      intervalMs: 3_600_000,
      now: () => now,
      run,
    })

    await schedule.tick()
    now = new Date(NOW.getTime() + 3_600_000)
    expect(await schedule.tick()).toBe(true)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("does not advance its own guard when the pass throws", async () => {
    // A database that is down for the length of the interval must not consume the
    // window: the next tick has to be free to try again rather than skipping an
    // hour because the hour was spent failing.
    const run = vi.fn(async () => {
      throw new Error("connection terminated")
    })
    const { createRetentionSchedule } = await import("./retention")
    const schedule = createRetentionSchedule({
      intervalMs: 3_600_000,
      now: () => NOW,
      run,
    })

    await expect(schedule.tick()).resolves.toBe(false)
    await expect(schedule.tick()).resolves.toBe(false)
    expect(run).toHaveBeenCalledTimes(2)
  })
})
