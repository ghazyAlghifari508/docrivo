import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import type { DbClient } from "~/db"
import { appDb } from "~/queries/app-db"

/**
 * Calls the existing `public.hit_rate_limit(key, limit, window_seconds)` RPC.
 *
 * The counting lives in PostgreSQL and is not reimplemented here. The function
 * is an upsert that resets the window when `reset_at` has passed and returns
 * `count <= limit`, so it is correct under concurrency because the row lock the
 * upsert takes is the serialisation point. Application code counting in a
 * process-local map would be correct on one instance and wrong on two, and the
 * bucket is keyed by values the client controls anyway.
 */
export async function checkRateLimit(
  input: { key: string; limit: number; windowSeconds: number },
  client: DbClient,
): Promise<boolean> {
  const rows = await client.execute<{ allowed: boolean }>(
    sql`select public.hit_rate_limit(${input.key}, ${input.limit}::int, ${input.windowSeconds}::int) as allowed`,
  )
  // `true` on a missing row, not `false`: a failed lookup must not silently lock
  // every caller out of the feature. Failing closed here would turn a database
  // blip into a total outage, and the caller is a rate limit, not an auth check.
  return rows[0]?.allowed ?? true
}

/**
 * The server-function wrapper. The arguments are passed through verbatim, so a
 * default that silently swallowed them would make this answer `true` forever and
 * no rate limit would exist at all -- which is why
 * `src/lib/__tests__/rate-limit.test.ts` drives `checkRateLimit` directly and
 * requires three allows followed by a refusal.
 */
export const hitRateLimit = createServerFn({ method: "GET" })
  .validator((input: { key: string; limit: number; windowSeconds: number }) => {
    if (!input?.key) throw new Error("key is required")
    return input
  })
  .handler(async ({ data }) => checkRateLimit(data, await appDb()))
