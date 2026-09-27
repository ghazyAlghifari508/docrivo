/**
 * The bounded pool the worker drains its queue with.
 *
 * This is a separate module from `worker/index.ts` for exactly one reason: the
 * claim worth testing is "at most N jobs are in flight at any moment", and
 * answering it needs a `claim` and a `process` that can both be observed. Inside
 * the crawl loop that question can only be answered by launching Chromium, which
 * is neither fast nor deterministic. Here it is answered by holding each job's
 * `process` open on a promise the test releases by hand, so the peak is a fact
 * rather than a race. `worker/pool.test.ts` is that test.
 *
 * No timers and no sleeping anywhere in here. The bound is established by
 * counting, not by waiting.
 */

/**
 * How many jobs may run at once, from an environment bag rather than
 * `process.env` directly.
 *
 * A parameter so the reading of the variable is testable, and a floor at one for
 * the same reason the pool has one: a bound of zero is a worker that claims
 * nothing and looks idle, and a bound of `NaN` is one that behaves differently
 * depending on which comparison the loop happens to write. Both are
 * misconfigurations dressed as settings.
 */
export function workerConcurrency(env: Record<string, string | undefined>): number {
  const raw = Number(env.WORKER_CONCURRENCY)
  if (!Number.isFinite(raw)) return 1
  return Math.max(1, Math.floor(raw))
}

export type PoolOptions<T> = {
  /** The most jobs allowed in flight. Always at least one. */
  concurrency: number
  /** The next job, or `null` for an empty queue. A throw means the database is unwell. */
  claim: () => Promise<T | null>
  /** Runs one job to completion. May throw; the pool keeps going. */
  process: (item: T) => Promise<void>
  /** Called with `(error, item)` for each failure, and once for a failing claim. */
  onError?: (error: unknown, item: T | null) => void
}

export type PoolSummary = { processed: number; failed: number }

/**
 * Claims and processes until the queue answers "empty".
 *
 * Three decisions worth naming.
 *
 * **A failing claim stops the pool.** `claimNextJob` answers an empty queue with
 * `null` and an unreachable database with a throw, and the two are not the same
 * event: one is an idle queue, the other is a fault the caller backs off from.
 * Retrying a throw immediately would hammer a database that is already unwell,
 * which is the exact thing the old loop's backoff existed to prevent.
 *
 * **A failing job does not stop the pool.** One site that blocks the crawler is
 * one job, and `processJob` already writes the failure to the row before
 * returning. Letting the rejection escape would abandon every job behind it in
 * the queue.
 *
 * **The loop refills as slots free, rather than claiming a batch.** Claiming a
 * batch up front would hold rows the pool has no capacity to work on, and every
 * one of them would sit behind a lease it is not renewing.
 */
export async function runPool<T>(options: PoolOptions<T>): Promise<PoolSummary> {
  const bound = Math.max(1, Math.floor(options.concurrency))
  const inFlight = new Set<Promise<void>>()
  const summary: PoolSummary = { processed: 0, failed: 0 }

  for (;;) {
    while (inFlight.size < bound) {
      let item: T | null
      try {
        item = await options.claim()
      } catch (error) {
        options.onError?.(error, null)
        return summary
      }

      if (item === null) {
        // The queue is empty. Wait for the jobs already running, then stop --
        // claiming again now would be a second "empty" answer for the same
        // instant and the caller would see an idle tick it cannot distinguish
        // from a finished pool.
        await Promise.allSettled([...inFlight])
        return summary
      }

      const running = options
        .process(item)
        .then(() => {
          summary.processed += 1
        })
        .catch((error: unknown) => {
          summary.failed += 1
          options.onError?.(error, item)
        })
        .finally(() => {
          inFlight.delete(running)
        })

      inFlight.add(running)
    }

    // Every slot is busy. Retire one before claiming again, so `claim` is never
    // called while the pool is already full.
    await Promise.race(inFlight)
  }
}
