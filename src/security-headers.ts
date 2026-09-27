/**
 * Security headers ported from the deleted `next.config.ts` `headers()` array.
 *
 * Next applied these declaratively to every response. TanStack Start has no
 * equivalent option, so they are applied by a `type: "request"` middleware in
 * `src/start.ts` instead -- the only hook that sees every response on its way
 * out, for both page requests and server-function calls.
 */

/**
 * Rule 1 of 2 from `next.config.ts`, applied to `/(.*)`.
 *
 * `connect-src` lost `https://*.insforge.app`: InsForge is gone in this
 * migration, and leaving a dead origin in a CSP is an allowlist entry nobody
 * audits any more.
 */
export const GLOBAL_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  [
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
  ],
]

/**
 * Rule 2 of 2 from `next.config.ts`, scoped to `/api/scrape/preview`.
 *
 * NOT applied here. It exists to sandbox scraped third-party HTML inside a
 * same-document iframe, and the route it guards is created in Task 4.4. Landing
 * it now would apply a `sandbox allow-scripts` CSP to every page in the app,
 * which is a stricter policy than the original and breaks hydration. The full
 * rule is preserved here verbatim so Task 4.4 can apply it by path.
 */
export const PREVIEW_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "SAMEORIGIN"],
  ["Referrer-Policy", "no-referrer"],
  [
    "Content-Security-Policy",
    "sandbox allow-scripts; default-src 'self' data: blob:; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; script-src-elem 'self' 'unsafe-inline' blob:; connect-src 'self' data: blob:; frame-src 'self' data: blob:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'self';",
  ],
]

/** The path rule 2 was scoped to. Task 4.4 owns the route itself. */
export const PREVIEW_ROUTE_PATH = "/api/scrape/preview"

/**
 * Which header set a given response gets.
 *
 * Rule 2 has to win on the preview path, and it cannot be left to whichever
 * handler happens to set its own headers: the global set is applied by a
 * request middleware on the way out, and a `Headers.set` there would overwrite
 * whatever the handler chose. Selecting by path before the copy is what makes
 * the stricter policy actually reach the response.
 *
 * The match is on the pathname with the query string already stripped, so
 * `/api/scrape/preview?url=https://example.com` is recognised. A prefix match
 * would also cover `/api/scrape/preview-evil`, which is not this route, so the
 * comparison is exact.
 */
export function securityHeadersFor(
  pathname: string,
): ReadonlyArray<readonly [string, string]> {
  return pathname === PREVIEW_ROUTE_PATH
    ? PREVIEW_SECURITY_HEADERS
    : GLOBAL_SECURITY_HEADERS
}

/**
 * Copies `headers` onto `response` as **defaults**, never as overrides.
 *
 * A header the response already carries wins. This is load-bearing: the request
 * middleware in `src/start.ts` runs on every response, so a route that sets its
 * own `Content-Security-Policy` had it replaced on the way out. For
 * `/api/scrape/asset` the route sets `sandbox; default-src 'none'` because it
 * echoes arbitrary third-party bytes at this origin, and the global default
 * arriving afterwards replaced it with `script-src 'self' 'unsafe-inline'
 * 'unsafe-eval'` -- turning the proxy into active HTML with script execution at
 * the app's own origin. `has()` is the test rather than a truthiness check on
 * the value, so a route that deliberately set an empty string still wins.
 *
 * The response is rebuilt rather than mutated in place: a `Response` that
 * arrived from a redirect or a static-asset handler has an immutable `Headers`
 * guard, and a `TypeError` here would take down every request. Rebuilding
 * preserves status, body and existing headers.
 *
 * `new Headers(response.headers)` already carries every `Set-Cookie`, and it
 * keeps them separate -- a field-by-field copy is what would collapse repeated
 * values into one. Re-appending them here, as an earlier version did, sent each
 * session cookie twice.
 */
export function withSecurityHeaders(
  response: Response,
  headers: ReadonlyArray<readonly [string, string]>,
): Response {
  const merged = new Headers(response.headers)

  for (const [key, value] of headers) {
    if (!merged.has(key)) merged.set(key, value)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  })
}
