import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start"
import { authMiddleware } from "~/auth/middleware"
import { securityHeadersFor, withSecurityHeaders } from "~/security-headers"

/**
 * The `type: "request"` counterpart to `authMiddleware`.
 *
 * `requestMiddleware`, not `functionMiddleware`: this one has to touch the
 * outbound `Response`, and a function middleware's `next()` resolves to a
 * result object with no response on it. Request middleware runs for page
 * requests and server-function calls alike, which is the coverage
 * `next.config.ts` `headers()` gave.
 *
 * The header set is chosen by path, not applied flat. `/api/scrape/preview`
 * sandboxes scraped third-party HTML and needs the stricter policy from
 * `next.config.ts` rule 2; everything else gets rule 1. Applying rule 1 to the
 * preview as well would overwrite the sandbox directive on the way out, and
 * applying rule 2 globally would break hydration on every page.
 */
const securityHeadersMiddleware = createMiddleware({ type: "request" }).server(
  async ({ next, request }) => {
    const result = await next()
    const { pathname } = new URL(request.url)
    return withSecurityHeaders(result.response, securityHeadersFor(pathname))
  },
)

/**
 * **Start's default CSRF middleware, re-registered by hand.**
 *
 * `createStartHandler` picks its middleware like this:
 *
 *   requestMiddleware: startInstance ? startOptions.requestMiddleware
 *                                  : isServerFnRequest ? [defaultCsrfMiddleware]
 *                                                      : undefined
 *
 * Exporting a `startInstance` therefore *displaces* the built-in CSRF check
 * rather than adding to it. Without this line every POST server function --
 * `createGeneration`, `updateProfile`, `consumeQuota`,
 * `insertPaymentTransaction`, the Midtrans pair -- accepted a cross-origin
 * request carrying the session cookie, with no origin check at all.
 *
 * `SameSite=Lax` on the session cookie is the real barrier and it holds in
 * current browsers, so this is defence in depth rather than the fix for a live
 * hole. It is here because the alternative is a protection that silently
 * disappears the moment anyone adds a `startInstance`, and nothing warns you:
 * the only sign was a dev-mode log line.
 *
 * The `filter` is copied from the default this displaces
 * (`createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" })`).
 * Without it the check also runs on ordinary page navigations, which carry no
 * `Origin` the middleware can validate, and every page 403s -- found by loading
 * `/faq` after wiring it up.
 */
const csrfProtection = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
})

// The export name is `startInstance`, not a name of our choosing: the generated
// `src/routeTree.gen.ts` emits `import type { startInstance } from './start'`
// and wires its `Register` interface to it, and the package's own default entry
// declares `export const startInstance = undefined` to merge with. A different
// name type-checks here and breaks the generated file.
export const startInstance = createStart(() => ({
  // Security headers first: they belong on every response, including the CSRF
  // failure response below, which is otherwise the one reply that escapes them.
  requestMiddleware: [securityHeadersMiddleware, csrfProtection],
  // `functionMiddleware`, not `requestMiddleware`. `authMiddleware` is
  // `type: "function"`, and `requestMiddleware` is typed
  // `ReadonlyArray<AnyRequestMiddleware>`.
  functionMiddleware: [authMiddleware],
}))
