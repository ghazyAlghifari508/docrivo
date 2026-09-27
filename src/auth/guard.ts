import { notFound, redirect } from "@tanstack/react-router"
import { requireAdmin } from "./admin"
import { safeNext } from "./redirect"

/**
 * The three route guards, and nothing else.
 *
 * ## Why `beforeLoad` and not `loader`
 *
 * A guard has to run before the route's own work, and it has to run on the client
 * as well as on the server. `beforeLoad` is the only hook that does both: it runs
 * during SSR *and* on an in-app navigation, and it runs before the route's
 * `loader`. A `loader`-based guard would still work, but Task 3.3 recorded why the
 * obvious alternative was rejected -- a `type: "request"` middleware's context
 * reaches `beforeLoad` only server-side, so on a client navigation `serverContext`
 * is `undefined` and the guard silently no-ops. That is a guard that looks like a
 * guard. These guards read `context.session`, which the *root route's* `beforeLoad`
 * published, so there is no server-only value anywhere in the chain.
 *
 * ## Why every one of them throws
 *
 * `notFound()` and `redirect()` both **return** their payload unless a caller
 * raises it. A guard written `if (!user) notFound()` therefore admits everybody
 * and still reads as a guard -- `src/auth/admin.ts` says the same thing about the
 * identical trap, and `src/auth/guard.test.ts` asserts the payload rather than
 * "something was thrown" for exactly this reason.
 *
 * ## Why they take the session from the context
 *
 * `context.session` is set once, by the root route's `beforeLoad`, from a single
 * `getSession()` server function. Nothing here resolves a session, so a request
 * that touches six guarded routes still performs one lookup -- see
 * `src/auth/session-cache.test.ts` for the mechanism and the proof.
 */

/** What a signed-in visitor is. A projection, not the whole Better Auth user. */
export type SessionUser = { id: string; email: string; name: string }

export type Session = { user: SessionUser | null }

/**
 * The slice of a route's `beforeLoad` context the guards read.
 *
 * `session` is optional, and that is deliberate: a `beforeLoad` that ran without
 * the root route's context -- a test, a future route mounted outside the tree --
 * produces `undefined` rather than a crash, and the guard treats it as signed out.
 * The failure mode of getting this wrong is a redirect, not an admission.
 */
export type GuardContext = { session?: Session }

/**
 * The internal path a guard should send a visitor back to.
 *
 * `pathname + searchStr + hash`, never `location.href`. `href` is the absolute url
 * including origin, and `safeNext` rejects anything that does not begin with a
 * single slash -- so passing `href` through would drop `next` on every guarded
 * route and quietly turn "return me where I was" into "return me to the site
 * root". The empty parts are omitted rather than concatenated, so the result is
 * `/profile` and not `/profile?`.
 */
export function guardLocation(location: {
  pathname: string
  searchStr: string
  hash: string
}): string {
  return `${location.pathname}${location.searchStr ?? ""}${location.hash ?? ""}`
}

/** The login URL for an internal destination. `href`, not `to`, to stay route-agnostic. */
function loginHref(from: string): string {
  const next = safeNext(from)
  return next === null ? "/login" : `/login?next=${encodeURIComponent(next)}`
}

/**
 * Requires a session, and hands the user back so a loader can scope its own query.
 *
 * Throws a redirect to `/login` carrying the current path in `next`, which
 * `src/routes/login.tsx` re-sanitises with the same `safeNext` on arrival. Two
 * independent checks on the same value is not redundancy for its own sake: the
 * `next` the guard builds is the one that was audited, and `safeNext` inside the
 * login route is the one that has a test suite.
 */
export function requireSession(context: GuardContext, from: string): SessionUser {
  const user = context.session?.user
  if (!user) throw redirect({ href: loginHref(from) })
  return user
}

/**
 * Requires a session *and* an allowlisted address.
 *
 * Both refusals are the router's not-found payload, so a signed-out visitor and a
 * signed-in non-administrator get the identical answer -- and so does a URL that
 * does not exist. A redirect to `/login` would confirm `/admin` exists; a 403
 * would confirm it too. `requireAdmin` is Task 2.2's function and is not
 * reimplemented here: it is where the allowlist comparison lives, and it is
 * already covered for the case-insensitive and near-miss matching.
 */
export function requireAdminSession(context: GuardContext): SessionUser {
  const user = context.session?.user ?? null
  requireAdmin(user)
  // `requireAdmin` has returned, so `user` is neither null nor off the list --
  // unless `ADMIN_EMAILS` is empty, in which case it threw above. The cast is
  // narrowed by that fact rather than by a check, and a second check here would be
  // a second place to get it wrong.
  return user as SessionUser
}

/**
 * Keeps a signed-in visitor off the login page.
 *
 * Returns `undefined` and nothing else. The test asserts the return value rather
 * than "did not throw", because a guard that raised some *other* payload would
 * satisfy a `not.toThrow()` and would still be wrong.
 */
export function redirectSignedIn(context: GuardContext): void {
  if (context.session?.user) throw redirect({ href: "/" })
}

/** Re-exported so a route can answer "is this a 404 page" without a second import. */
export { notFound }
