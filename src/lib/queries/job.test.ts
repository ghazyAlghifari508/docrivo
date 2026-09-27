import { describe, expect, it } from "vitest"
import { jobQueryOptions } from "./job"

/**
 * The `refetchInterval` callback receives a whole `Query` object, and this
 * project never constructs one in a test. The probe below carries only the
 * field the implementation reads, so the assertion is about the decision --
 * poll, or stop -- rather than about the shape of a class the test would have to
 * fabricate. `state.data` is `undefined` between the first render and the first
 * response, so `undefined` is a real value for it to be given, and one the
 * factory has to survive.
 */
type IntervalFn = (query: {
  state: { data: { status: string } | undefined }
}) => number | false | undefined

type RetryFn = (failureCount: number, error: Error) => boolean

const intervalOf = (opts: ReturnType<typeof jobQueryOptions>): IntervalFn =>
  opts.refetchInterval as unknown as IntervalFn

const retryOf = (opts: ReturnType<typeof jobQueryOptions>): RetryFn =>
  opts.retry as unknown as RetryFn

/** Stands in for the router's not-found payload. `isNotFound` reads one field. */
const notFound = () => ({ isNotFound: true }) as unknown as Error

describe("jobQueryOptions", () => {
  it("keeps polling through every status the worker can still leave", () => {
    const probe = intervalOf(jobQueryOptions("job-1"))

    // Every non-terminal status, not just two of them. A status left out of this
    // list is a status the bar keeps polling on forever.
    for (const status of ["queued", "crawling", "capturing", "extracting", "generating"]) {
      expect(probe({ state: { data: { status } } })).toBe(2500)
    }
  })

  it("stops polling on a terminal status", () => {
    const probe = intervalOf(jobQueryOptions("job-1"))

    // `cancelled` is a terminal status too. It is in `JobStatus` in
    // `src/lib/types.ts` and the worker writes it, so omitting it here means an
    // abandoned job is polled until the tab is closed.
    expect(probe({ state: { data: { status: "completed" } } })).toBe(false)
    expect(probe({ state: { data: { status: "failed" } } })).toBe(false)
    expect(probe({ state: { data: { status: "cancelled" } } })).toBe(false)
  })

  it("keeps polling before the first response has landed", () => {
    const probe = intervalOf(jobQueryOptions("job-1"))

    // Reading `.status` off `undefined` throws, and an inverted membership test
    // answers "terminal" for a status it has never heard of. Both would stop the
    // poll on the very first tick, before the job had been fetched at all.
    expect(probe({ state: { data: undefined } })).toBe(2500)
    expect(probe({ state: { data: { status: "a-status-from-the-future" } } })).toBe(2500)
  })

  it("does not retry a job the caller does not own", () => {
    const shouldRetry = retryOf(jobQueryOptions("job-1"))

    // `getOwnedJob` answers a cross-user id with the router's not-found payload.
    // Retrying that three times is three more database round trips to reach the
    // same 404, so the predicate has to read the error, not just count failures.
    expect(shouldRetry(0, notFound())).toBe(false)
    expect(shouldRetry(2, notFound())).toBe(false)
  })

  it("still retries a transient failure, three times", () => {
    const shouldRetry = retryOf(jobQueryOptions("job-1"))

    // The counterpart to the line above: a socket hang is worth another attempt,
    // and the default budget of three is what the previous hand-rolled loop used.
    expect(shouldRetry(0, new Error("socket hang up"))).toBe(true)
    expect(shouldRetry(2, new Error("socket hang up"))).toBe(true)
    expect(shouldRetry(3, new Error("socket hang up"))).toBe(false)
  })

  it("keys the cache by job id", () => {
    // Two open job views must not share one cache entry, or the second one to
    // render overwrites the first one's data under a key it still owns.
    expect(jobQueryOptions("job-1").queryKey).toEqual(["job", "job-1"])
    expect(jobQueryOptions("job-1").queryKey).not.toEqual(
      jobQueryOptions("job-2").queryKey,
    )
  })
})
