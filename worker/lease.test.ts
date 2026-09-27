import { beforeEach, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { eq } from "drizzle-orm"
import { testDb } from "../src/db"
import { generationJobs } from "../src/db/schema"
import { users } from "../src/db/schema-auth"

/**
 * Lease expiry, against `docrivo_test` through `testDb` and never the `db`
 * application client. `worker/db.ts` defaults to `db` so the worker process needs
 * no wiring, and that default is exactly the thing a test would trip over by
 * accident -- the two databases have identical schemas, so a test that reached
 * the wrong one would pass.
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

/**
 * A fixed instant for every path whose clock is ours.
 *
 * The reclaim is handed this value, so a lease either side of it is a lease the
 * function has to classify. Nothing here sleeps and nothing reads the wall clock.
 */
const NOW = new Date("2026-03-04T05:06:07.000Z")

/**
 * The database's own clock, for the paths that judge the lease themselves.
 *
 * `claim_next_job()` has to use the server clock -- a claim made with the
 * caller's idea of "now" would be wrong the moment the two disagree -- so the
 * claim tests cannot inject an instant. They read the server's instead of using a
 * hardcoded date, which is the difference between a boundary that stays put and
 * one that silently rots into the past and starts requeueing live jobs.
 *
 * `extract(epoch from ...)` is `numeric`, which `postgres` hands back as a
 * string, so it is cast to `float8` for a number. Left as a string, every
 * arithmetic below it produces `Invalid time value` and the test fails somewhere
 * other than where the bug is.
 */
const dbNowMs = async () => {
  const [row] = await client().execute<{ ms: number }>(
    sql`select (extract(epoch from now()) * 1000)::float8 as ms`,
  )
  return row.ms
}

const seed = (status = "queued") =>
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

const setLease = (id: string, at: Date | null) =>
  client()
    .update(generationJobs)
    .set({ leaseExpiresAt: at })
    .where(eq(generationJobs.id, id))

const touch = (id: string, at: Date) =>
  client()
    .update(generationJobs)
    .set({ updatedAt: at })
    .where(eq(generationJobs.id, id))

beforeEach(async () => {
  await client().execute(sql`truncate generation_jobs cascade`)
  await client()
    .insert(users)
    .values({ id: USER_A, name: "User A", email: "user-a@example.com" })
    .onConflictDoNothing()
})

describe("claimNextJob and the lease", () => {
  it("reclaims a job whose lease expired", async () => {
    const [job] = await seed("crawling")
    const now = await dbNowMs()
    await setLease(job.id, new Date(now - 60_000))
    await touch(job.id, new Date(now))
    const { claimNextJob } = await import("./db")

    const claimed = await claimNextJob(client())

    // The reclaimed job, by id. A claim that returned some other row -- or the
    // row it created -- would still satisfy a `not.toBeNull()`.
    expect(claimed?.id).toBe(job.id)
  })

  it("does not reclaim a job whose lease is still valid", async () => {
    const [job] = await seed("crawling")
    const now = await dbNowMs()
    await setLease(job.id, new Date(now + 60_000))
    await touch(job.id, new Date(now))
    const { claimNextJob } = await import("./db")

    // `resolves.toBeNull()`, not `rejects`: a claim that threw would satisfy a
    // `toThrow` assertion while being wrong, and the caller treats the two
    // differently -- a throw is a backoff, a null is an idle queue.
    await expect(claimNextJob(client())).resolves.toBeNull()
  })

  it("hands out a job with a live lease of its own", async () => {
    await seed("queued")
    const { claimNextJob } = await import("./db")

    const claimed = await claimNextJob(client())

    expect(claimed?.status).toBe("crawling")
    // The lease has to be set by the claim itself, not by the worker afterwards:
    // the window between the two is exactly the window in which a second worker
    // could claim the same row. The window is measured in SQL because that is the
    // clock the function compares against, and a `timestamptz` read back through
    // a raw `execute` arrives as a string that would need parsing to compare.
    const [row] = await client().execute<{ seconds: number }>(
      sql`select extract(epoch from (lease_expires_at - now()))::float8 as seconds
          from generation_jobs where id = ${claimed!.id}`,
    )
    expect(row.seconds).toBeGreaterThan(0)
    expect(row.seconds).toBeLessThanOrEqual(300)
  })

  it("leaves a mid-flight job with no lease alone until the legacy timeout", async () => {
    // A `running` job with a NULL lease was started by a worker from before the
    // lease column existed, or by an operator. It falls back to the
    // `updated_at` window the hardened `claim_next_job` has always used, so the
    // two recovery rules cannot disagree about the same row.
    const [job] = await seed("generating")
    const now = await dbNowMs()
    await setLease(job.id, null)
    await touch(job.id, new Date(now))
    const { claimNextJob } = await import("./db")

    await expect(claimNextJob(client())).resolves.toBeNull()
  })

  it("reclaims a mid-flight job with no lease once the legacy timeout passes", async () => {
    const [job] = await seed("generating")
    const now = await dbNowMs()
    await setLease(job.id, null)
    await touch(job.id, new Date(now - 11 * 60_000))
    const { claimNextJob } = await import("./db")

    const claimed = await claimNextJob(client())

    expect(claimed?.id).toBe(job.id)
  })

  it("clears the progress and the error of a job it reclaims", async () => {
    // A requeued job that kept `progress = 60` and its failure text would show
    // "60% -- WEBSITE_BLOCKED" in the browser while sitting in the queue, and the
    // error columns are what `generation-result.tsx` renders on failure.
    const [job] = await seed("extracting")
    const now = await dbNowMs()
    await client()
      .update(generationJobs)
      .set({ progress: 60, errorCode: "WEBSITE_BLOCKED", errorMessage: "blocked" })
      .where(eq(generationJobs.id, job.id))
    await setLease(job.id, new Date(now - 60_000))
    const { claimNextJob } = await import("./db")

    const claimed = await claimNextJob(client())

    // The claim moves it to `crawling` with the stage default, which is the state
    // a fresh job is in. The error columns were cleared on the way out of
    // `running`, so a job that is retried does not carry its previous failure.
    expect(claimed?.progress).toBe(20)
    expect(claimed?.errorCode).toBeNull()
    expect(claimed?.errorMessage).toBeNull()
  })
})

describe("reclaimExpiredJobs", () => {
  it("reclaims a lease one millisecond past and spares one on the instant", async () => {
    // The boundary, placed rather than waited for. The reclaim is handed `NOW`, so
    // this is the exact comparison the production path makes -- only the instant
    // is ours.
    //
    // The middle row is the load-bearing one: its lease expires at `NOW` and not
    // one nanosecond either side, because a rule written `<=` rather than `<`
    // differs from a rule written `<` *only* at equality. An earlier version of
    // this test offset every row by one millisecond, and the `<=` mutation
    // survived it -- correctly, since at a 1ms offset the two spellings agree.
    // A boundary that cannot see the difference is not the boundary.
    //
    // The `updated_at` of the mid-flight rows is left at the insert default, which
    // is "now", so the legacy branch cannot be what spares the middle row.
    const [expired] = await seed("crawling")
    const [onTheInstant] = await seed("capturing")
    const [live] = await seed("extracting")
    await setLease(expired.id, new Date(NOW.getTime() - 1))
    await setLease(onTheInstant.id, NOW)
    await setLease(live.id, new Date(NOW.getTime() + 1))
    const { reclaimExpiredJobs } = await import("./db")

    const reclaimed = await reclaimExpiredJobs({ now: NOW }, client())

    expect(reclaimed).toEqual([expired.id])
    const [after] = await client()
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, expired.id))
    expect(after.status).toBe("queued")
    expect(after.progress).toBe(0)
    // A requeued row must not keep the lease it just lost, or the next reclaim
    // would see a stale expiry on a job nothing is working on.
    expect(after.leaseExpiresAt).toBeNull()

    for (const id of [onTheInstant.id, live.id]) {
      const [untouched] = await client()
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, id))
      expect(untouched.status).not.toBe("queued")
    }
  })

  it("clears the error columns of a job it requeues", async () => {
    const [job] = await seed("generating")
    await client()
      .update(generationJobs)
      .set({ progress: 60, errorCode: "WEBSITE_BLOCKED", errorMessage: "blocked" })
      .where(eq(generationJobs.id, job.id))
    await setLease(job.id, new Date(NOW.getTime() - 1))
    const { reclaimExpiredJobs } = await import("./db")

    await reclaimExpiredJobs({ now: NOW }, client())

    // Re-read through the query builder rather than trusting the function's own
    // return, for the reason `reclaimExpiredJobs` returns ids: the persisted state
    // is the claim, not the echo.
    const [after] = await client()
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, job.id))
    expect(after.errorCode).toBeNull()
    expect(after.errorMessage).toBeNull()
    expect(after.progress).toBe(0)
  })

  it("is a no-op on an empty queue and answers with an empty list", async () => {
    const { reclaimExpiredJobs } = await import("./db")

    await expect(reclaimExpiredJobs({ now: NOW }, client())).resolves.toEqual([])
  })

  it("never touches a queued job", async () => {
    // The reclaim is about work that was in flight and lost. A queued job is
    // waiting its turn, not abandoned, and requeueing it would be a no-op that
    // also reset its position.
    const [queued] = await seed("queued")
    await setLease(queued.id, new Date(NOW.getTime() - 1))
    const { reclaimExpiredJobs } = await import("./db")

    await reclaimExpiredJobs({ now: NOW }, client())

    const [after] = await client()
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, queued.id))
    expect(after.status).toBe("queued")
  })

  it("never touches a job that has already finished", async () => {
    // A completed job keeps the lease its worker last wrote. Reclaiming it would
    // put a finished, paid-for generation back in the queue.
    const [done] = await seed("completed")
    await setLease(done.id, new Date(NOW.getTime() - 1))
    const { reclaimExpiredJobs } = await import("./db")

    await reclaimExpiredJobs({ now: NOW }, client())

    const [after] = await client()
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, done.id))
    expect(after.status).toBe("completed")
  })
})

describe("renewLease", () => {
  it("writes an exact expiry derived from the clock it is given", async () => {
    // The whole reason the clock is a parameter. Sleeping for five minutes to
    // watch a lease expire is not a test, it is a slow flaky one, and it cannot
    // place the boundary. An exact value can: this is equality against a computed
    // instant, so a lease of four minutes or of six both fail it.
    const [job] = await seed("crawling")
    const { renewLease } = await import("./db")

    const expiresAt = await renewLease({ jobId: job.id, now: NOW }, client())

    expect(expiresAt?.toISOString()).toBe("2026-03-04T05:11:07.000Z")
    const [after] = await client()
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, job.id))
    expect(after.leaseExpiresAt?.toISOString()).toBe("2026-03-04T05:11:07.000Z")
  })

  it("answers null for a job that no longer exists", async () => {
    // A heartbeat that fires after the row was deleted -- by the user, by the
    // retention job -- must not raise. The caller logs and carries on.
    const { renewLease } = await import("./db")

    await expect(
      renewLease(
        { jobId: "00000000-0000-0000-0000-0000000000ff", now: NOW },
        client(),
      ),
    ).resolves.toBeNull()
  })
})
