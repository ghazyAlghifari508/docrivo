import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import ts from "typescript"

/**
 * Executable guards on the security controls that survived the migration.
 *
 * `render-page.ts`, `preview-html.ts`, `fetch-html.ts` and `url-validator.ts`
 * are preserved pure-logic modules with their own behavioural tests. This file
 * does not duplicate that -- it asserts that the *specific* defences are still
 * present, so that an edit which keeps the module's tests green while dropping a
 * defence is caught. A comment is not a guard.
 *
 * Every assertion runs against `code(path)`, which is the file's tokens with all
 * trivia removed, using TypeScript's own scanner. That is not a detail, and it
 * took two attempts to get right:
 *
 *   * The first draft asserted `169.254` against `url-validator.ts`, where the
 *     only occurrence of that string was the comment beside the check. A mutation
 *     that deleted the check went green, because the comment satisfied it.
 *   * The second draft stripped comments with a regular expression. `render-page`
 *     routes on a glob whose leading slash and star opened a "block comment" in
 *     the stripper, which swallowed 2,264 characters of real code --
 *     `route.abort()` included.
 *
 * A scanner has no parser context, so it splits `>=` into two tokens and a
 * regular-expression literal into its punctuation. `code` re-joins each run of
 * operator characters to undo that, which is why the patterns below are written
 * whitespace-insensitively.
 */
const source = (path: string) => readFileSync(path, "utf8")

/** The file's tokens: no comments, no formatting, operator runs re-joined. */
const code = (path: string) => {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    ts.LanguageVariant.Standard,
    source(path),
  )
  const parts: string[] = []
  for (
    let kind = scanner.scan();
    kind !== ts.SyntaxKind.EndOfFileToken;
    kind = scanner.scan()
  ) {
    if (
      kind === ts.SyntaxKind.WhitespaceTrivia ||
      kind === ts.SyntaxKind.NewLineTrivia ||
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue
    }
    parts.push(scanner.getTokenText())
  }
  return parts.join(" ").replace(/\s*([<>=!+\-*/%&|^~?]+)\s*/g, "$1")
}

describe("preserved security controls", () => {
  it("render-page.ts still intercepts every request to pin DNS", () => {
    const src = code("src/lib/render-page.ts")

    // The browser must be made to fetch the address the validator already
    // checked. Without the interception it re-resolves the host, and a rebinding
    // answer gets fetched.
    expect(src).toMatch(/context\s*\.\s*route/)
    expect(src).not.toMatch(/context\s*\.\s*unroute/)
    // The handler is what makes the interception do anything: it has to consult
    // the host block list, and then answer the request. A token assertion cannot
    // see an interception moved into a dead branch, so the body's presence is
    // checked too.
    expect(src).toMatch(/BLOCK_HOSTS\s*\.\s*has/)
    expect(src).toMatch(/route\s*\.\s*abort\s*\(\s*\)/)
    expect(src).toMatch(/route\s*\.\s*fulfill/)
  })

  it("render-page.ts still blocks WebSockets in the preview", () => {
    const src = code("src/lib/render-page.ts")

    // A `ws://` subresource would leave the page over a channel the request
    // filter never sees. Asserted on the *install*, because a class declaration
    // that nothing binds to the global blocks nothing.
    expect(src).toMatch(/class\s+BlockedWebSocket/)
    expect(src).toMatch(/WebSocket\s*:\s*\{\s*value\s*:\s*BlockedWebSocket/)
    expect(src).toMatch(/SharedWorker\s*:\s*\{\s*value\s*:\s*BlockedWorker/)
  })

  it("render-page.ts still refuses loopback and private subresources", () => {
    const src = code("src/lib/render-page.ts")

    // The literal host names, plus the shared range check. The IPv4 and IPv6
    // ranges live in `url-validator.ts` -- asserted there -- so what has to be
    // present here is that render-page consults it for every subresource host
    // rather than trusting the name.
    expect(src).toMatch(/"ip6-loopback"/)
    expect(src).toMatch(/"localhost"/)
    expect(src).toMatch(/BLOCK_HOSTS/)
    expect(src).toMatch(/isPrivateIp\s*\(\s*address\s*\)/)
    expect(src).toMatch(/isPrivateIp\s*\(\s*host\s*\)/)
  })

  it("preview-html.ts still strips the target's own CSP meta tag", () => {
    const src = code("src/lib/preview-html.ts")

    // A target that ships its own `Content-Security-Policy` could otherwise widen
    // the policy the sandbox is running under. Asserted on the *use* of the
    // pattern, not its declaration: an unused `CSP_META` strips nothing.
    expect(src).toMatch(/http-equiv/)
    expect(src).toMatch(/content-security-policy/)
    expect(src).toMatch(/\.\s*replace\s*\(\s*CSP_META\s*,/)
  })

  it("preview-html.ts still strips the target's <base>", () => {
    const src = code("src/lib/preview-html.ts")

    // A `<base href>` pointing at the origin would resolve the rewritten
    // relative URLs against the target instead of the proxy.
    expect(src).toMatch(/\.\s*replace\s*\(\s*\/\s*<\s*base/)
  })

  it("url-validator.ts still refuses the ranges it exists for", () => {
    const src = code("src/lib/url-validator.ts")

    // Written as the numeric comparisons the module actually uses, so a comment
    // quoting an address cannot stand in for the check.
    // Link-local, which is where the cloud metadata endpoint lives.
    expect(src).toMatch(/a\s*===\s*169\s*&&\s*b\s*===\s*254/)
    // IPv4 private, loopback and carrier-grade NAT.
    expect(src).toMatch(/a\s*===\s*10\b/)
    expect(src).toMatch(/a\s*===\s*127\b/)
    expect(src).toMatch(/a\s*===\s*192\s*&&\s*b\s*===\s*168/)
    expect(src).toMatch(/a\s*===\s*100\s*&&\s*b\s*>=\s*64\s*&&\s*b\s*<=\s*127/)
    // IPv6 loopback and unspecified.
    expect(src).toMatch(/"::1"/)
    // IPv6 link-local and unique-local.
    expect(src).toMatch(/0xfe80\s*&&\s*first\s*<=\s*0xfebf/)
    expect(src).toMatch(/0xfc00\s*&&\s*first\s*<=\s*0xfdff/)
  })

  it("fetch-html.ts pins the connection to the resolved address", () => {
    const src = code("src/lib/fetch-html.ts")

    // `hostname: ip` rather than `hostname: url.hostname`. Asserted negatively
    // so it survives a rename of the local variable, and it covers both call
    // sites -- the asset fetch and the HTML fetch -- which a count would also do
    // but reads worse.
    expect(src).toMatch(/hostname\s*:\s*ip/)
    expect(src).not.toMatch(/hostname\s*:\s*url\s*\.\s*hostname/)
  })

  it("the preview route keeps its sandbox CSP", () => {
    const src = source("src/routes/api/scrape.preview.ts")

    // The policy literal, read from the raw source rather than the token stream:
    // a scanner splits the string's spaces into separate tokens. It is matched as
    // one literal for a second reason -- the file's comments discuss
    // `allow-same-origin` in order to explain why it must not be there, and a
    // whole-file `not.toContain` would fail on that explanation.
    const csp = src.match(/"sandbox allow-scripts;[^"]*"/)?.[0]
    expect(csp, "the preview CSP literal is missing").toBeDefined()
    expect(csp).toContain("base-uri 'none'")
    expect(csp).toContain("form-action 'none'")
    // `allow-same-origin` would give the untrusted document the parent's origin,
    // and the sandbox would stop being a boundary at all.
    expect(csp).not.toContain("allow-same-origin")
  })

  it("the sandbox CSP is still scoped to the preview path, not applied globally", () => {
    const src = code("src/security-headers.ts")

    // `sandbox` on a normal page blocks its own scripts, so hydration dies. The
    // selection has to be by path, and it has to be an exact comparison: a
    // prefix match would also cover `/api/scrape/preview-evil`.
    expect(src).toMatch(/PREVIEW_ROUTE_PATH/)
    expect(src).toMatch(/pathname\s*===\s*PREVIEW_ROUTE_PATH/)
    expect(src).not.toMatch(/pathname\s*\.\s*startsWith\s*\(\s*PREVIEW_ROUTE_PATH/)
  })

  it("the asset proxy keeps its null-origin CORS header", () => {
    const src = code("src/routes/api/scrape.asset.ts")

    // The sandboxed `srcDoc` frame has origin `null`, and a cross-origin font
    // fetch is CORS-mode even through a same-path proxy. Without this the
    // preview renders unstyled and nothing in the console explains it.
    expect(src).toMatch(/Access-Control-Allow-Origin\s*"?\s*:\s*"?\*/)
  })

  it("the asset proxy keeps rewriting css urls", () => {
    const src = code("src/routes/api/scrape.asset.ts")

    // A stylesheet that skipped inlining still points `url()`s at the source
    // origin, and the frame's CSP blocks a direct fetch of those.
    expect(src).toMatch(/isCss\s*\?\s*rewriteCssUrls/)
  })

  it("the payment claim stays scoped to a pending transaction", () => {
    const src = code("src/queries/entitlements.ts")

    // Without the `status = 'pending'` predicate the UPDATE matches a row that is
    // already paid, so a replayed webhook credits the same purchase twice. The
    // expression is in the WHERE clause rather than an `if`, which is what makes
    // the row lock the serialisation point.
    expect(src).toMatch(/eq\s*\(\s*paymentTransactions\s*\.\s*status\s*,\s*"pending"\s*\)/)
  })

  it("the payment order id is still unique, so a claim has one row to win", () => {
    const src = code("src/db/schema.ts")

    // The unique constraint is what makes the order id a stable key for the
    // Midtrans callback. The atomicity of the claim rests on it as much as on
    // the predicate above. Asserted on `unique(...)` rather than on the name, so
    // a plain index declared under the same name does not pass -- and
    // `src/db/schema.test.ts` checks the same constraint against the live
    // database, which is the stronger guard.
    expect(src).toMatch(/unique\s*\(\s*"payment_transactions_order_id_key"/)
  })

  it("no server function takes a user id from the client", () => {
    // Every ownership filter compares `user_id` against something. If that
    // something could arrive in the payload, the filter would be satisfied by the
    // attacker's own value and would return another user's row. `readOwnedJob` is
    // the only shape allowed to name a user id, and it is a plain function rather
    // than a server function.
    //
    // Two things this had to get right. The match stops at the end of the
    // validator's parameter list -- `[^)]*` runs cannot cross a closing paren, and
    // the parameter list always contains a `{ ... }` type literal -- because an
    // earlier version ran on into the handler body and flagged
    // `readOwnedJob({ jobId, userId })`, which is the plain function and exactly
    // where the id is supposed to appear. And the count is asserted, because a
    // pattern that matches nothing makes the loop below vacuously pass: the first
    // version of this test did precisely that, since the token stream splits `.`
    // from the identifier after it and the pattern was not whitespace-tolerant.
    const files = [
      "src/queries/jobs.ts",
      "src/queries/scrapes.ts",
      "src/queries/entitlements.ts",
    ]

    let total = 0
    for (const path of files) {
      const parameters =
        code(path).match(/\.\s*validator\s*\(\s*[^)]*\{[^}]*\}[^)]*\)/g) ?? []
      total += parameters.length
      for (const parameter of parameters) {
        expect(`${path}: ${parameter}`).not.toMatch(/userId/)
      }
    }

    expect(total).toBeGreaterThan(0)
  })
})
