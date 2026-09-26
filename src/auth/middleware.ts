import { createMiddleware } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { auth } from "./server"

export async function resolveSession(requestHeaders: Headers) {
  return auth.api.getSession({ headers: requestHeaders })
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
