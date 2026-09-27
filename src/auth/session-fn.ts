import { createServerFn } from "@tanstack/react-start"
import type { Session } from "~/auth/guard"

/**
 * The session, as a server function, for the root route's `beforeLoad`.
 *
 * **This module must never import `~/auth/server`, `~/auth/middleware` or
 * `~/db`.** It is imported by `src/routes/__root.tsx`, which is a component
 * file and therefore always in the client graph. A static import of the Better
 * Auth instance from here drags `betterAuth({...})`, the `postgres` driver and
 * all fifteen `pgTable` definitions into `dist/client` — and two of those
 * modules throw on evaluation in a browser, so hydration dies on every route
 * while `tsc`, `vitest`, `eslint`, `vite build` and an `HTTP 200` on `/` all
 * report success. That defect is invisible to every gate the project has.
 *
 * It lived in `~/auth/middleware` until the final review, which is exactly the
 * mistake: that module imports `auth` at the top level for `authMiddleware` and
 * `defaultResolver`, neither of which this function needs. The whole trick is
 * that `getSession` reads `context.user` — a value the middleware already put
 * there — so it has no reason to know the auth instance exists.
 *
 * A server function rather than a direct `resolveSession(getRequestHeaders())`
 * call in the loader, because that is what makes the guard work on an in-app
 * navigation as well as a full page load: during SSR Start invokes a server
 * function in-process, and on the client it is an RPC to the same origin. A
 * loader reaching for `getRequestHeaders()` directly would be a static import of
 * `@tanstack/react-start/server` in the client graph, which the Start plugin's
 * import protection refuses outright.
 *
 * It adds no lookup of its own: the middleware already resolved the session for
 * the request, so reading the result is free.
 */
export const getSession = createServerFn({ method: "GET" }).handler(
  async ({ context }): Promise<Session> => {
    const user = (context as { user?: Session["user"] }).user
    return { user: user ?? null }
  },
)
