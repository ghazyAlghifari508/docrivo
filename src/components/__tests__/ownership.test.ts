import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { db } from "~/db"
import { users } from "~/db/schema-auth"
import { generationJobs } from "~/db/schema"

/**
 * The ownership rule: a resource owned by somebody else must be
 * indistinguishable from one that does not exist. Anything other than a
 * not-found answer -- a 403, a permission message -- confirms the id is real,
 * which turns the endpoint into an enumeration oracle for other users' ids.
 *
 * Three corrections to the version this test was drafted from, each found by
 * running it rather than by reading it:
 *
 * 1. It called `getOwnedJob({ data: ... })` directly. A `createServerFn`
 *    handler reads its context from AsyncLocalStorage and throws
 *    `No Start context found in AsyncLocalStorage` outside a request, so the
 *    call never reached the query. The test exercises `readOwnedJob`, the plain
 *    function the server function delegates to, which is the part that holds
 *    the rule.
 * 2. It asserted `toMatchObject({ status: 404 })`. `notFound()` returns
 *    `{ isNotFound: true }` and carries no `status` field at all, so that
 *    assertion could never pass.
 * 3. It used a job id that did not exist, and passed anyway when the ownership
 *    filter was deleted from the query -- because a missing row is missing
 *    whether or not `user_id` is part of the WHERE clause. That version proved
 *    nothing about ownership. The mutation check in this file's comment below
 *    records the catch. The fixtures below create a real job owned by one user
 *    and read it back as a different user, which is the case the rule is for.
 *
 * `jobId` and `userId` are well-formed UUIDs throughout: `generation_jobs.id`
 * and `.user_id` are `uuid`, so a non-UUID string is rejected by Postgres with
 * `invalid input syntax for type uuid` before the query runs, and the test
 * would then be asserting on the wrong error.
 */
const OWNER = "00000000-0000-0000-0000-0000000000a1"
const INTRUDER = "00000000-0000-0000-0000-0000000000b2"
const JOB = "00000000-0000-0000-0000-0000000000c3"

async function seed() {
  await db
    .insert(users)
    .values([
      { id: OWNER, name: "Owner", email: "owner@example.com" },
      { id: INTRUDER, name: "Intruder", email: "intruder@example.com" },
    ])
    .onConflictDoNothing()

  await db
    .insert(generationJobs)
    .values({
      id: JOB,
      userId: OWNER,
      sourceUrl: "https://example.com",
      normalizedDomain: "example.com",
    })
    .onConflictDoNothing()
}

afterEach(async () => {
  await db.delete(generationJobs).where(eq(generationJobs.id, JOB))
  await db.delete(users).where(eq(users.id, OWNER))
  await db.delete(users).where(eq(users.id, INTRUDER))
})

describe("ownership enforcement", () => {
  it("returns the job to its owner", async () => {
    await seed()
    const { readOwnedJob } = await import("~/queries/jobs")

    const job = await readOwnedJob({ jobId: JOB, userId: OWNER })
    expect(job.id).toBe(JOB)
  })

  it("raises not-found, not forbidden, for a job owned by another user", async () => {
    await seed()
    const { readOwnedJob } = await import("~/queries/jobs")

    // The row exists -- the previous assertion just read it. So a 403 here
    // would be a real leak of that fact, and a bare throw of any other shape
    // would mean the ownership filter is not doing the work.
    await expect(
      readOwnedJob({ jobId: JOB, userId: INTRUDER }),
    ).rejects.toMatchObject({ isNotFound: true })
  })

  it("raises not-found for a job that does not exist, indistinguishably", async () => {
    const { readOwnedJob } = await import("~/queries/jobs")

    await expect(
      readOwnedJob({
        jobId: "00000000-0000-0000-0000-0000000000ff",
        userId: OWNER,
      }),
    ).rejects.toMatchObject({ isNotFound: true })
  })
})
