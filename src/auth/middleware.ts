import { createMiddleware } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import type { Session } from "./guard"

/**
 * Session resolution, and the per-request cache in front of it.
 *
 * ## Why a cache at all
 *
 * `authMiddleware` runs once per *server function*, not once per request, and a
 * page load runs several: the root loader's `getSession`, plus whatever
 * `listJobs`, `listScrapes` and `getEntitlement` the route's own loader calls. A
 * page that called four of them performed four session lookups, each of which is
 * a signed-cookie verification and a database read. That is F3, and it is a
 * defect rather than a style point: it is per-request duplicated work on the
 * hottest path in the application.
 *
 * ## Why it is keyed on the `Headers` object
 *
 * Because that object *is* the request. Read out of the installed
 * `@tanstack/start-server-core`:
 *
 *     function getRequestHeaders() { return getH3Event().req.headers }
 *
 * and `requestHandler` builds exactly one `H3Event` per request and runs the
 * whole handler inside `eventStorage.run({ h3Event }, ...)`. Every
 * `getRequestHeaders()` call within one request therefore returns the *identical*
 * `Headers` instance, and two concurrent requests have two different ones.
 *
 * So a `WeakMap<Headers, Promise<Session | null>>` is a per-request cache that
 * cannot leak between requests, needs no AsyncLocalStorage of our own, and cannot
 * outlive the request -- the entry is collected with the headers. The two
 * alternatives both fail: a module-level variable serves one visitor's session to
 * the next concurrent request, and a process-wide TTL cache does the same while
 * additionally keeping a signed-out answer alive after sign-out.
 *
 * ## Why the *promise* is cached
 *
 * SSR matches a route tree in parallel, so a second server function starts before
 * the first has answered. Caching the resolved value would find nothing in the map
 * for the second caller and would still issue a lookup. Caching the pending promise
 * collapses concurrent callers as well as sequential ones --
 * `src/auth/session-cache.test.ts` asserts that case separately, because it is the
 * one that a value cache would pass by accident on a single-threaded test.
 *
 * ## Why failures are cached too
 *
 * A rejected lookup is stored like any other answer. A request that retried would
 * let the second caller succeed where the first failed, and the page would be
 * assembled from two different answers -- which is a worse outcome than a single
 * failed request, and much harder to read in a log.
 */

/** Resolves a session from a request's headers, or answers `null`. */
export type SessionResolver = (headers: Headers) => Promise<Session | null>

/**
 * Keyed on the request's own `Headers`, so an entry is reachable only from the
 * request that created it and is collectable the moment that request is done.
 *
 * A `Map` here would be a cross-request session leak with a memory leak on top.
 */
const perRequest = new WeakMap<Headers, Promise<Session | null>>()

/**
 * `resolveSession`, once per request.
 *
 * `resolve` is a parameter so the cache is testable without a session cookie, and
 * so the count of database lookups is observable rather than inferred. It is not
 * a seam for production: the only caller that omits it is `resolveSession`.
 */
export function cachedSession(
  headers: Headers,
  resolve: SessionResolver,
): Promise<Session | null> {
  const hit = perRequest.get(headers)
  if (hit) return hit
  const pending = resolve(headers)
  perRequest.set(headers, pending)
  return pending
}

/**
 * Resolves the session through the Better Auth instance, **imported lazily**.
 *
 * This module is unavoidably in the client bundle: `src/start.ts` imports it, and
 * the Start plugin puts `start.ts` in the client graph because function
 * middleware runs there too (that is what makes an in-app navigation hit the same
 * guard a full page load does). A top-level `import { auth } from "./server"`
 * therefore links the whole Better Auth server, the `postgres` driver and all
 * fifteen `pgTable` definitions into `dist/client`, where two of them throw on
 * evaluation and hydration dies on every route.
 *
 * A dynamic import alone is not sufficient in general -- a bundler treats it as a
 * loading boundary, not an elimination boundary, and ships the module as a lazy
 * chunk. It works here because this function is only ever reached from
 * `authMiddleware`'s `.server()` body, which the Start plugin strips from the
 * client build along with everything it references.
 */
const defaultResolver: SessionResolver = async (headers) => {
  const { auth } = await import("./server")
  return auth.api.getSession({ headers }) as Promise<Session | null>
}

/** The session for this request, or `null`. Resolved at most once per request. */
export function resolveSession(
  requestHeaders: Headers,
  resolve: SessionResolver = defaultResolver,
): Promise<Session | null> {
  return cachedSession(requestHeaders, resolve)
}

/**
 * Makes the session available to every server function. It does not decide
 * whether authentication is required -- a missing session becomes
 * `user: null` here, and the route that knows the answer turns that into a
 * redirect (page) or a 401 (server function). Throwing from the middleware
 * would collapse "logged out" and "the session lookup failed" into the same
 * opaque error.
 *
 * `getRequestHeaders()` rather than a `request` argument: a `type: "function"`
 * middleware's server handler receives `data`, `context`, `next`, `method`,
 * `serverFnMeta` and `signal` -- there is no `request`. Only `type: "request"`
 * middleware gets one.
 */
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => next())
  .server(async ({ next }) => {
    const session = await resolveSession(getRequestHeaders())
    return next({ context: { user: session?.user ?? null } })
  })
