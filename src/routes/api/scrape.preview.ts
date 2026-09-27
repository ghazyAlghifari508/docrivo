import { createFileRoute } from "@tanstack/react-router"
import { AppError, ERROR_CODES } from "~/lib/errors"
import { scrapeHtml } from "~/lib/fetch-html"
import { rewritePreviewAssets } from "~/lib/preview-html"
import { checkRateLimit } from "~/queries/rate-limit"

/**
 * `GET|POST /api/scrape/preview` -- a single third-party page, fetched and
 * returned as markup for the sandboxed `srcDoc` iframe on `/history/scrapes/$id`.
 *
 * A route handler rather than a server function: the response is loaded into an
 * iframe's `srcDoc` context, and the strict CSP below is part of that contract.
 */
export const Route = createFileRoute("/api/scrape/preview")({
  server: { handlers: { GET, POST } },
})

/**
 * The sandbox policy, preserved verbatim from the deleted
 * `src/app/api/scrape/preview/route.ts` and from `next.config.ts` rule 2.
 *
 * `sandbox allow-scripts` is what actually isolates this untrusted HTML, and
 * `allow-same-origin` is deliberately absent: with it, a script in the frame
 * would share the parent's origin and could read its cookies. `base-uri 'none'`
 * and `form-action 'none'` stop it navigating the top window or posting anywhere.
 * The rest is the asset allowlist the rewritten URLs rely on -- `self` for the
 * proxy, `data:`/`blob:` for inlined payloads.
 *
 * This is the same string as `PREVIEW_SECURITY_HEADERS` in
 * `src/security-headers.ts`, and the request middleware applies that copy by path
 * so a bug in this handler cannot weaken the policy that reaches the response.
 * Two copies rather than one because the value has to be on the response this
 * function returns, which the middleware only sees on its way out.
 */
const PREVIEW_CSP =
  "sandbox allow-scripts; default-src 'self' data: blob:; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; style-src-elem 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; script-src-elem 'self' 'unsafe-inline' blob:; connect-src 'self' data: blob:; frame-src 'self' data: blob:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'self'"

/**
 * Exported so the policy on this route's own responses is assertable without a
 * live scrape. The success path needs a real browser and a reachable site, so a
 * handler-level test could never reach the header set below -- and it is the
 * header set, not the scrape, that is the security control.
 */
export const PREVIEW_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": PREVIEW_CSP,
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  // Re-render live on every request, so re-submitting the same URL never serves a
  // stale frame -- which is exactly why the user re-submits.
  "Cache-Control": "no-store, max-age=0",
}

/**
 * Both collaborators are parameters so the handler's decisions -- the status
 * codes, the headers, the escaping -- can be tested without a live rate-limit
 * table in the development database or a live fetch. The framework calls the
 * handler with one argument, so the defaults are what runs in production.
 */
export type PreviewRouteDeps = {
  checkRateLimit?: typeof checkRateLimit
}

export async function GET(
  ctx: { request: Request },
  deps: PreviewRouteDeps = {},
): Promise<Response> {
  return render(
    new URL(ctx.request.url).searchParams.get("url") ?? "",
    ctx.request,
    deps,
  )
}

export async function POST(
  ctx: { request: Request },
  deps: PreviewRouteDeps = {},
): Promise<Response> {
  let url: string
  try {
    const body = (await ctx.request.json()) as { url?: unknown }
    if (typeof body?.url !== "string" || body.url.length === 0) {
      return htmlError(ERROR_CODES.INVALID_URL, 400)
    }
    url = body.url
  } catch {
    return htmlError(ERROR_CODES.INVALID_URL, 400)
  }
  return render(url, ctx.request, deps)
}

async function render(
  rawUrl: string,
  request: Request,
  deps: PreviewRouteDeps,
): Promise<Response> {
  const rateLimit = deps.checkRateLimit ?? checkRateLimit
  try {
    // Keyed by address, not by user: this endpoint is reachable without a
    // session, and the sandboxed frame is the expensive part.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
    const allowed = await rateLimit({
      key: `scrape-preview:${ip}`,
      limit: 5,
      windowSeconds: 60,
    })
    if (!allowed) return htmlError(ERROR_CODES.RATE_LIMITED, 429)

    const { html, sourceUrl } = await scrapeHtml(rawUrl)

    return new Response(rewritePreviewAssets(html, sourceUrl), { headers: PREVIEW_HEADERS })
  } catch (error) {
    if (error instanceof AppError) {
      return htmlError(
        error.message,
        error.code === "INVALID_URL" || error.code === "PRIVATE_URL_BLOCKED" ? 400 : 422,
      )
    }
    console.error("[api] scrape preview failed", error)
    return htmlError(ERROR_CODES.WEBSITE_BLOCKED, 502)
  }
}

/**
 * The error body is HTML, not JSON, because it is rendered inside the preview
 * frame -- a JSON blob there would show as raw text. `escapeHtml` is what keeps
 * a message that quotes the rejected URL from becoming markup of its own.
 *
 * Exported so the escaping is assertable. No `AppError` message currently
 * contains a URL, so the escaping is defence in depth against a future message
 * that does, and a test that could only reach it through a real failure would
 * never run.
 */
export function htmlError(message: string, status: number): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Preview gagal</title><p>${escapeHtml(message)}</p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" } },
  )
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!,
  )
}
