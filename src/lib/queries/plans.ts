import { queryOptions } from "@tanstack/react-query"
import { listPlans } from "~/queries/plans"

/** The catalogue is four rows; a minute of staleness is free and saves a read. */
const STALE_MS = 60_000

/**
 * The plan catalogue.
 *
 * The one factory here with a single, shared key, because there is a single
 * catalogue -- five route loaders read it and a per-caller key would give each
 * of them its own copy of the same four rows.
 *
 * It has no consumer yet, and that is a fact about the tree rather than an
 * oversight: every plans read in this codebase is a route *loader* (`index`,
 * `pricing`, `setting`, `template`), and a loader runs on the server where a
 * client query cache does not exist. The factory is here so the moment a client
 * component does need the catalogue the shape is already decided.
 */
export function plansQueryOptions() {
  return queryOptions({
    queryKey: ["plans"],
    queryFn: () => listPlans({ data: undefined }),
    refetchInterval: false,
    staleTime: STALE_MS,
  })
}
