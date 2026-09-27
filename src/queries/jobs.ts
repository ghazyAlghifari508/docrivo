import { createServerFn } from "@tanstack/react-start"
import { notFound } from "@tanstack/react-router"
import { eq, and } from "drizzle-orm"
import { db } from "~/db"
import { generationJobs } from "~/db/schema"

/**
 * Phase 4 scaffolding. Task 4.1 completes this module with `listJobs`,
 * `createGeneration` and `deleteJob`; only the ownership read exists here
 * because `src/components/__tests__/ownership.test.ts` needs it to prove the
 * 404-not-403 rule.
 *
 * The rule: a job belonging to another user must be indistinguishable from a
 * job that does not exist. Both raise `notFound()`, so a caller probing for
 * someone else's job id learns nothing -- not even that the id is real.
 * Returning 403 instead would confirm the id exists, which is an enumeration
 * oracle.
 *
 * Split into a plain function plus a thin server-function wrapper on purpose.
 * A `createServerFn` handler reads its request context from AsyncLocalStorage
 * and throws `No Start context found` when called outside a request, so the
 * logic inlined into one would be untestable. Keeping the query in a plain
 * function means the ownership rule can be unit-tested directly.
 */
export async function readOwnedJob(input: {
  jobId: string
  userId: string
}): Promise<typeof generationJobs.$inferSelect> {
  const [job] = await db
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.id, input.jobId),
        eq(generationJobs.userId, input.userId),
      ),
    )
    .limit(1)

  // Scoped by `userId` in the WHERE clause, so a row owned by somebody else
  // never enters the result set and lands here identically to a missing row.
  // One path, one response.
  if (!job) throw notFound()

  return job
}

export const getOwnedJob = createServerFn({ method: "GET" })
  .inputValidator((input: { jobId: string; userId: string }) => {
    if (!input?.jobId) throw new Error("jobId is required")
    if (!input?.userId) throw new Error("userId is required")
    return input
  })
  .handler(({ data }) => readOwnedJob(data))
