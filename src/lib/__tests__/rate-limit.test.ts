import { afterEach, describe, expect, it } from "vitest"
import { inArray, sql } from "drizzle-orm"
import { testDb } from "~/db"
import { rateLimits } from "~/db/schema"
import { checkRateLimit } from "~/queries/rate-limit"

/**
 * The rate limiter, driven against the real Postgres function.
 *
 * The brief for this file called `hitRateLimit({ data: ... })`. That cannot work:
 * a `createServerFn` handler resolves its context from AsyncLocalStorage and
 * throws `No Start context found` outside a request, so the call never reaches
 * the query. `checkRateLimit` is the plain function the server function
 * delegates to, and it is the part that has to pass the arguments through.
 *
 * `testDb` rather than the application client, so the bucket this file fills is
 * in `docrivo_test`. The default client is the one the running application uses,
 * and a test that wrote to its `rate_limits` table would throttle real traffic.
 */
const client = () => {
  if (!testDb) {
    throw new Error(
      "DATABASE_URL_TEST is not set: refusing to write to the development database",
    )
  }
  return testDb
}

const keys: string[] = []

/** A key no other suite can collide with, tracked so it can be deleted. */
const uniqueKey = (label: string) => {
  const key = `test:rate-limit:${label}:${Date.now()}:${keys.length}`
  keys.push(key)
  return key
}

afterEach(async () => {
  if (keys.length === 0) return
  await client().delete(rateLimits).where(inArray(rateLimits.key, keys))
  keys.length = 0
})

describe("rate limiting", () => {
  it("allows requests up to the limit and then refuses", async () => {
    const key = uniqueKey("basic")
    const results: boolean[] = []

    for (let i = 0; i < 5; i += 1) {
      results.push(
        await checkRateLimit({ key, limit: 3, windowSeconds: 60 }, client()),
      )
    }

    // Exactly three, not "at most three": a wrapper that ignored the `limit`
    // argument and defaulted to something larger would pass an `at most` check.
    expect(results.filter(Boolean)).toHaveLength(3)
    expect(results.some((allowed) => !allowed)).toBe(true)
    // And the refusals come after the allows, not interleaved.
    expect(results).toEqual([true, true, true, false, false])
  })

  it("counts each call, so the refusal is not a fixed answer", async () => {
    const key = uniqueKey("counting")
    const first = await checkRateLimit({ key, limit: 1, windowSeconds: 60 }, client())
    const second = await checkRateLimit({ key, limit: 1, windowSeconds: 60 }, client())

    expect(first).toBe(true)
    expect(second).toBe(false)
  })

  it("keeps separate keys in separate buckets", async () => {
    const [a, b] = [uniqueKey("bucket-a"), uniqueKey("bucket-b")]

    await checkRateLimit({ key: a, limit: 1, windowSeconds: 60 }, client())

    // One caller exhausting their bucket must not refuse another. A wrapper that
    // dropped the key would answer `false` here.
    expect(await checkRateLimit({ key: b, limit: 1, windowSeconds: 60 }, client())).toBe(true)
  })

  it("resets the bucket once the window has passed", async () => {
    const key = uniqueKey("window")
    expect(await checkRateLimit({ key, limit: 1, windowSeconds: 60 }, client())).toBe(true)
    expect(await checkRateLimit({ key, limit: 1, windowSeconds: 60 }, client())).toBe(false)

    // `reset_at` is moved into the past rather than waited out. The reset is the
    // one behaviour here that calling cannot observe, because a fresh window is
    // always in the future -- and a `windowSeconds: 0` call would not do it,
    // because that only shortens the *new* window while the existing one still
    // governs whether the counter resets.
    await client().execute(
      sql`update rate_limits set reset_at = now() - interval '1 second' where key = ${key}`,
    )

    expect(await checkRateLimit({ key, limit: 1, windowSeconds: 60 }, client())).toBe(true)
  })

  it("passes a large limit through rather than defaulting it", async () => {
    const key = uniqueKey("passthrough")
    const results: boolean[] = []

    // Twenty calls against a limit of twenty-five. A wrapper that dropped the
    // limit and fell back to a small default would start refusing somewhere in
    // here, and a caller with a legitimately high ceiling would be locked out.
    for (let i = 0; i < 20; i += 1) {
      results.push(
        await checkRateLimit({ key, limit: 25, windowSeconds: 60 }, client()),
      )
    }

    expect(results.every(Boolean)).toBe(true)
  })
})
