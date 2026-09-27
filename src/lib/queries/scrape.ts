import { queryOptions } from "@tanstack/react-query"
import { isNotFound } from "@tanstack/react-router"
import { getScrape } from "~/queries/scrapes"

/** The default retry budget, named so the not-found exemption reads as a choice. */
const RETRY_BUDGET = 3

/**
 * The scrape-artifact query.
 *
 * No polling, and the reason is worth stating because the sibling factory in
 * `./job` does poll: `createScrape` writes the artifact after the HTML is
 * already in hand, so the row never exists in a partial state. The previous
 * component read it exactly once, and `refetchInterval: false` is written out
 * rather than left off so the absence reads as decided.
 */
export function scrapeQueryOptions(scrapeId: string) {
  return queryOptions({
    queryKey: ["scrape", scrapeId],
    queryFn: () => getScrape({ data: { scrapeId } }),
    refetchInterval: false,
    // Same ownership answer as the job factory: `getScrape` raises not-found for
    // somebody else's artifact and for a missing one alike, and it will not
    // become found on a retry.
    retry: (failureCount, error) => !isNotFound(error) && failureCount < RETRY_BUDGET,
  })
}
