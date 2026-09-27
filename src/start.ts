import { createMiddleware, createStart } from "@tanstack/react-start"
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

// The export name is `startInstance`, not a name of our choosing: the generated
// `src/routeTree.gen.ts` emits `import type { startInstance } from './start'`
// and wires its `Register` interface to it, and the package's own default entry
// declares `export const startInstance = undefined` to merge with. A different
// name type-checks here and breaks the generated file.
export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware],
  // `functionMiddleware`, not `requestMiddleware`. `authMiddleware` is
  // `type: "function"`, and `requestMiddleware` is typed
  // `ReadonlyArray<AnyRequestMiddleware>`.
  functionMiddleware: [authMiddleware],
}))
