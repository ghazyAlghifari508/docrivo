import { describe, expect, it, vi } from "vitest"
import { runPool, workerConcurrency } from "./pool"

/**
 * Bounded concurrency, as a pure function.
 *
 * The pool is separated from `worker/index.ts` for one reason: the part worth
 * testing is "at most N claims are in flight at any moment", and that question
 * needs a claim and a process that can both be observed. Reaching it through the
 * real loop would mean launching Chromium, which is neither fast nor a test.
 *
 * Nothing here sleeps and nothing uses a timer. The bound is established by
 * holding each job's `process` open on a promise the test resolves by hand, so
 * the in-flight count at its peak is a fact rather than a race.
 */

type Deferred = { promise: Promise<void>; release: () => void }

/** A gate the test opens by hand, so a job can be held in flight indefinitely. */
function deferred(): Deferred {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

describe("workerConcurrency", () => {
  it("defaults to one when WORKER_CONCURRENCY is unset", () => {
    // One, not a larger default. The right number depends on measured memory
    // headroom with Chromium resident, which is not known here, and an
    // over-confident default launches N browsers on a 512MB microVM.
    expect(workerConcurrency({})).toBe(1)
  })

  it("reads the bound from the environment", () => {
    expect(workerConcurrency({ WORKER_CONCURRENCY: "4" })).toBe(4)
  })

  it("never returns fewer than one slot", () => {
    // Zero would be a pool that claims nothing and returns immediately, which
    // looks like an idle queue rather than a misconfiguration.
    expect(workerConcurrency({ WORKER_CONCURRENCY: "0" })).toBe(1)
    expect(workerConcurrency({ WORKER_CONCURRENCY: "-3" })).toBe(1)
  })

  it("falls back to one on a value that is not a count", () => {
    // `Number("many")` is `NaN`, and `Math.max(1, NaN)` is `NaN` -- a pool with a
    // `NaN` bound either claims nothing or claims everything, depending on which
    // comparison is written. Neither is a decision anybody made.
    expect(workerConcurrency({ WORKER_CONCURRENCY: "many" })).toBe(1)
    expect(workerConcurrency({ WORKER_CONCURRENCY: "" })).toBe(1)
    expect(workerConcurrency({ WORKER_CONCURRENCY: "  " })).toBe(1)
  })

  it("rounds a fractional bound down to a whole number of slots", () => {
    // `2.5` is not a count of anything. Taken literally it is a loop bound of two
    // and a half, whose behaviour depends on which comparison the loop writes.
    expect(workerConcurrency({ WORKER_CONCURRENCY: "2.5" })).toBe(2)
  })
})

describe("runPool", () => {
  it("processes every queued job", async () => {
    const queue = ["a", "b", "c", "d", "e"]
    const done: string[] = []

    const summary = await runPool({
      concurrency: 2,
      claim: async () => queue.shift() ?? null,
      process: async (item) => {
        done.push(item)
      },
    })

    // Five jobs, two slots: every one of them ran. A pool that stopped after the
    // first batch would satisfy a `toBeGreaterThan(0)` and nothing else.
    expect([...done].sort()).toEqual(["a", "b", "c", "d", "e"])
    expect(summary.processed).toBe(5)
  })

  it("never has more jobs in flight than the bound", async () => {
    // The assertion the whole task exists for. Each job blocks until the test
    // releases it, so the pool has to refill the freed slot -- and the recorded
    // peak is the highest number that ever ran at once.
    const gates = Array.from({ length: 5 }, () => deferred())
    let inFlight = 0
    let peak = 0
    let next = 0

    const run = runPool({
      concurrency: 3,
      claim: async () => (next < gates.length ? next++ : null),
      process: async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await gates[next - 1].promise
        inFlight -= 1
      },
    })

    // Let the pool fill its three slots, then drain them one at a time. Each
    // release is followed by a microtask turn so the refill can claim again.
    while (next < 3) await Promise.resolve()
    for (let i = 0; i < 5; i += 1) {
      gates[i].release()
      await new Promise((resolve) => setImmediate(resolve))
    }
    await run

    expect(peak).toBe(3)
  })

  it("runs strictly one at a time when the bound is one", async () => {
    // The old loop's shape, kept as a test: a single-slot pool is the pre-Task-7.1
    // behaviour, and the bounded version has to reduce to it.
    let inFlight = 0
    let peak = 0
    const queue = [1, 2, 3, 4]

    await runPool({
      concurrency: 1,
      claim: async () => queue.shift() ?? null,
      process: async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        inFlight -= 1
      },
    })

    expect(peak).toBe(1)
  })

  it("stops when the queue runs dry", async () => {
    let claims = 0

    const summary = await runPool({
      concurrency: 2,
      claim: async () => {
        claims += 1
        return claims <= 3 ? claims : null
      },
      process: async () => {},
    })

    expect(summary.processed).toBe(3)
    // Four claims: three jobs and the one that answered "empty". A pool that
    // re-polls after an empty answer would show a fifth.
    expect(claims).toBe(4)
  })

  it("keeps going when one job fails, and reports the failure", async () => {
    const onError = vi.fn()
    const done: number[] = []
    const queue = [1, 2, 3]

    const summary = await runPool({
      concurrency: 1,
      claim: async () => queue.shift() ?? null,
      process: async (item) => {
        if (item === 2) throw new Error("crawl exploded")
        done.push(item)
      },
      onError,
    })

    // A pool that let one failure reject would abandon the rest of the queue, and
    // the worker would restart from scratch having lost every later job.
    expect(done).toEqual([1, 3])
    expect(summary.processed).toBe(2)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[1]).toBe(2)
  })

  it("treats a failing claim as a reason to stop, not to spin", async () => {
    // `claimNextJob` distinguishes an empty queue (`null`) from a database outage
    // (a throw), and the two mean different things to the loop. A pool that
    // swallowed a claim error and retried immediately would hammer a database
    // that is already unwell.
    const onError = vi.fn()
    let claims = 0

    const summary = await runPool({
      concurrency: 2,
      claim: async () => {
        claims += 1
        if (claims === 1) return "job-1"
        throw new Error("connection terminated")
      },
      process: async () => {},
      onError,
    })

    expect(claims).toBe(2)
    expect(summary.processed).toBe(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it("does nothing at all when the queue is empty", async () => {
    const process = vi.fn()

    const summary = await runPool({
      concurrency: 4,
      claim: async () => null,
      process,
    })

    expect(process).not.toHaveBeenCalled()
    expect(summary.processed).toBe(0)
  })
})
