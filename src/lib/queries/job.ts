import { queryOptions } from "@tanstack/react-query"
import { isNotFound } from "@tanstack/react-router"
import { getOwnedJob } from "~/queries/jobs"

/**
 * The three statuses the worker will not leave.
 *
 * `cancelled` is here, and the two-status version of this set is a bug: it is in
 * `JobStatus` in `src/lib/types.ts`, `claim_next_job()`'s recovery path and the
 * worker's own `setStatus` can all write it, and an abandoned job would then be
 * polled every 2.5 seconds until the tab closed. The set is the single place the
 * answer lives, so `src/lib/queries/job.test.ts` pins all three.
 */
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"])

/** The interval the hand-rolled loop in `generation-result.tsx` already used. */
const POLL_MS = 2500

/**
 * Whether this status is one the job will not leave.
 *
 * Exported because the progress view needs the same answer the poll does -- it
 * decides between "in progress" and "here is what happened" -- and a second
 * literal list in the component is a second thing to forget. `undefined` and an
 * unrecognised status both answer `false`, so a caller that passes nothing is
 * told the job is still running rather than the reverse.
 */
export function isTerminalJobStatus(status: string | undefined): boolean {
  return status !== undefined && TERMINAL_STATUSES.has(status)
}

/** The default retry budget, kept explicit so the not-found exemption is visible. */
const RETRY_BUDGET = 3

/**
 * The generation-progress query.
 *
 * The whole point of the factory is that "poll until the job is done" is a
 * decision about a row, not a decision about component lifecycle. Spelled out as
 * an effect it needed an `AbortController`, a `setTimeout` chain, an `alive`
 * flag, a separate not-found branch and a separate transient branch, and every
 * one of those was a place for the next component to get it wrong.
 *
 * `userId` is deliberately absent. `getOwnedJob`'s validator takes the job id
 * alone and resolves the user from the request context; a `userId` parameter here
 * would invite a caller to pass one, and the ownership filter would then compare
 * the job against whatever the caller said -- satisfied by the attacker's own
 * value rather than by the session.
 */
export function jobQueryOptions(jobId: string) {
  return queryOptions({
    queryKey: ["job", jobId],
    queryFn: () => getOwnedJob({ data: { jobId } }),
    refetchInterval: (query) =>
      // `undefined` means the first response has not landed, and an unrecognised
      // status means a row written by a newer version. Both keep polling: the
      // only thing that should stop a progress bar is proof that the job ended.
      isTerminalJobStatus(query.state.data?.status) ? false : POLL_MS,
    // A not-found here is the ownership answer, and it is final -- `getOwnedJob`
    // raises it for a job owned by somebody else and for one that does not exist
    // alike. Retrying it is three more round trips to reach the same answer.
    retry: (failureCount, error) => !isNotFound(error) && failureCount < RETRY_BUDGET,
  })
}
