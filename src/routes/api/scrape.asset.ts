import { createFileRoute } from "@tanstack/react-router"
import { AppError } from "~/lib/errors"
import { fetchAsset as fetchAssetFn } from "~/lib/fetch-html"
import { rewriteCssUrls } from "~/lib/preview-html"
import { checkRateLimit } from "~/queries/rate-limit"

/**
 * `GET /api/scrape/asset` -- one proxied asset for the sandboxed preview.
 *
 * A route handler rather than a server function: the sandboxed frame requests
 * these by URL, through the browser, not through a server-function fetch.
 */
export const Route = createFileRoute("/api/scrape/asset")({
  server: { handlers: { GET } },
})

const ASSET_HEADERS: Record<string, string> = {
  "Cache-Control": "public, max-age=3600",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
  // The sandboxed `srcDoc` iframe has origin `null`, and a cross-origin font
  // fetch is CORS-mode even through a same-path proxy -- so without this header
  // every proxied font and stylesheet fails and the preview renders unstyled.
  // It is safe here precisely because the target is arbitrary: the response is
  // `sandbox; default-src 'none'`, so reading these bytes tells a caller nothing
  // they could not read from the origin directly.
  "Access-Control-Allow-Origin": "*",
}

/**
 * Both collaborators are parameters so the response shaping -- and in particular
 * the CSS rewrite, which is the only reason this route does anything to a body --
 * can be tested against the test database and without a live fetch. The
 * framework calls the handler with one argument, so the defaults are what runs
 * in production.
 */
export type AssetRouteDeps = {
  checkRateLimit?: typeof checkRateLimit
  fetchAsset?: typeof fetchAssetFn
}

export async function GET(
  ctx: { request: Request },
  deps: AssetRouteDeps = {},
): Promise<Response> {
  const rateLimit = deps.checkRateLimit ?? checkRateLimit
  const fetchAsset = deps.fetchAsset ?? fetchAssetFn

  const target = new URL(ctx.request.url).searchParams.get("url")
  if (!target) return new Response("Missing url", { status: 400, headers: ASSET_HEADERS })

  try {
    // Generous, and keyed by address: one page pulls dozens of assets, so a
    // tighter budget would break legitimate previews. The SSRF guard inside
    // `fetchAsset` is what actually limits what this will fetch.
    const ip = ctx.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
    const allowed = await rateLimit({
      key: `scrape-asset:${ip}`,
      limit: 1000,
      windowSeconds: 60,
    })
    if (!allowed) return new Response("Rate limited", { status: 429, headers: ASSET_HEADERS })

    const { body, status, contentType } = await fetchAsset(target)

    // CSS that skipped inlining -- a `<link rel=stylesheet>` routed straight
    // through this proxy -- still has raw `url()`s pointing at the source origin.
    // Rewriting them here is what stops the browser fetching them directly and
    // having the CSP block each one.
    const isCss = /text\/css/i.test(contentType)
    const payload =
      status >= 400 ? "" : isCss ? rewriteCssUrls(body.toString("utf8"), target) : new Uint8Array(body)

    return new Response(payload, {
      status: status >= 400 ? status : 200,
      headers: { ...ASSET_HEADERS, "Content-Type": contentType },
    })
  } catch (error) {
    // 400 for a URL the SSRF guard refused, 502 for a site that would not answer.
    // No error text either way: the body is rendered inside a frame pointed at a
    // third-party page, and echoing the rejection reason back is free
    // reconnaissance for someone probing the guard.
    const status =
      error instanceof AppError &&
      (error.code === "INVALID_URL" || error.code === "PRIVATE_URL_BLOCKED")
        ? 400
        : 502
    return new Response("", { status, headers: ASSET_HEADERS })
  }
}
