import { describe, expect, it } from "vitest"
import { scrapeQueryOptions } from "./scrape"

type RetryFn = (failureCount: number, error: Error) => boolean

const retryOf = (opts: ReturnType<typeof scrapeQueryOptions>): RetryFn =>
  opts.retry as unknown as RetryFn

const notFound = () => ({ isNotFound: true }) as unknown as Error

describe("scrapeQueryOptions", () => {
  it("does not poll", () => {
    // A scrape artifact is written once, complete, by `createScrape` -- the row
    // only exists after the HTML is already in hand. There is no intermediate
    // state to wait for, so a poll interval here would be a request every 2.5s
    // for a page that is already finished. `false`, not `undefined`: a missing
    // option reads as "not decided yet", and the next person adds the poll.
    expect(scrapeQueryOptions("scrape-1").refetchInterval).toBe(false)
  })

  it("keys the cache by scrape id", () => {
    expect(scrapeQueryOptions("scrape-1").queryKey).toEqual(["scrape", "scrape-1"])
    expect(scrapeQueryOptions("scrape-1").queryKey).not.toEqual(
      scrapeQueryOptions("scrape-2").queryKey,
    )
  })

  it("does not retry an artifact the caller does not own", () => {
    const shouldRetry = retryOf(scrapeQueryOptions("scrape-1"))

    expect(shouldRetry(0, notFound())).toBe(false)
    expect(shouldRetry(0, new Error("socket hang up"))).toBe(true)
  })
})
