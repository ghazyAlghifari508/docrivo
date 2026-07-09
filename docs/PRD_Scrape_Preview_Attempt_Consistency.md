# Scrape Preview Attempt Consistency

## Problem
Vibecoders and AI coding users use Docrivo to scrape a public reference website, inspect the preview, and download HTML or use the extracted result as design context. Today, repeated scrape attempts for the same URL can look identical even when the user expects a fresh or improved attempt, and the preview/code output may not clearly come from the same captured result. The cost is trust loss: users cannot tell whether Docrivo actually re-scraped, which render conditions were used, or whether a desktop reference such as Supabase was captured correctly.

## Evidence
- User observation: scraping `https://supabase.com/` more than five times produced the same preview, with a hamburger-style navigation instead of the expected desktop navigation.
- User observation: repeated attempts felt indistinguishable, making the scrape retry action feel ineffective.
- Code observation: the current flow has separate scrape and preview paths that can render the same URL independently, creating risk that preview and code are not the exact same captured artifact.
- Code observation: repeated attempts use the same URL and same render conditions, so identical output is expected unless the product intentionally changes attempt strategy or communicates deterministic behavior.

## Users
- **Primary**: Vibecoders and AI coding users who paste a public website URL into Docrivo, inspect the scraped preview, then download HTML or use the output as reference material for AI-assisted UI building.
- **Not for**: Users who need guaranteed pixel-perfect archival capture of third-party websites, full browser session replay, logged-in/private website scraping, or legal copying of source brand assets.

## Hypothesis
We believe **attempt-aware scrape previews with a single shared captured artifact, visible metadata, and meaningful retry behavior** will **restore user trust in preview accuracy and make retries useful** for **vibecoders and AI coding users scraping public design references**.
We'll know we're right when **users can verify which attempt they are viewing, preview and code always match the same capture, and repeated retries either produce a visibly different attempt or clearly explain why the result is deterministic**.

## Success Metrics
| Metric | Target | How measured |
|---|---|---|
| Preview/code consistency | 100% of scrape results show preview and code from the same captured artifact | Runtime verification comparing preview artifact metadata and code artifact metadata |
| Attempt clarity | 100% of completed scrape results show attempt metadata | UI inspection: attempt number, capture time, final URL, viewport, HTML size |
| Retry usefulness | Retry either changes at least one render condition or labels the attempt as deterministic | Product QA checklist across repeated URL attempts |
| Supabase desktop confidence | Supabase scrape attempt exposes whether desktop capture conditions were used | Manual QA on `https://supabase.com/` showing attempt metadata and preview outcome |
| User confusion | TBD — needs validation via user testing | Observe whether users understand why a repeated attempt changed or did not change |

## Scope
**MVP** — A scrape result must be treated as one captured artifact shared by preview, code, and download. Each attempt must expose metadata: attempt number, capture time, final URL, viewport, HTML size, and capture mode. Re-scraping the same URL must either run a meaningfully different attempt strategy or explicitly tell the user that the same deterministic strategy was used.

**Out of scope**
- Persistent server-side scrape history — deferred because the immediate trust issue can be validated without database-backed scrape storage.
- Pixel-perfect browser replay — deferred because the goal is trustworthy reference preview, not archival fidelity.
- Logged-in or private website scraping — excluded for security and scope.
- Full user-selectable browser automation controls — deferred until the MVP proves which metadata and retry strategies users actually need.
- Legal/content-rights enforcement for copied third-party assets — outside this product fix; Docrivo should still avoid encouraging brand copying.

## Delivery Milestones
<!-- Business outcomes, not engineering tasks. /plan turns each into a plan. -->
<!-- Status: pending | in-progress | complete -->

| # | Milestone | Outcome | Status | Plan |
|---|---|---|---|---|
| 1 | Single captured scrape artifact | Users see preview, code, and download from the same scrape result | complete | [.claude/plans/scrape-preview-attempt-consistency.plan.md](../.claude/plans/scrape-preview-attempt-consistency.plan.md) |
| 2 | Attempt metadata visibility | Users can inspect final URL, capture time, viewport, HTML size, and attempt number | complete | — |
| 3 | Meaningful retry behavior | Users understand whether a retry changed capture conditions or repeated a deterministic attempt | complete | — |
| 4 | Supabase desktop validation | Supabase scrape no longer silently appears as an unexplained hamburger/tablet result | complete | — |

## Open Questions
- [ ] What exact viewport(s) should count as “desktop” for Docrivo’s default scrape promise?
- [ ] Should retry automatically rotate strategy, or should the user choose “desktop”, “wide desktop”, “mobile”, or “long wait” modes?
- [ ] Should deterministic retries be allowed if the UI clearly labels them, or should every retry always change at least one render condition?
- [ ] Should scrape attempts persist only in client session/history, or also server-side for future retrieval?
- [ ] What threshold defines “HTML output looks truncated or invalid” for a user-facing warning?

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Wider/alternate viewport still triggers hamburger on specific websites | Medium | High | Show metadata and outcome clearly; treat per-site behavior as observable result, not hidden failure |
| Retry variation produces inconsistent outputs that confuse users | Medium | Medium | Label attempt strategy and changed conditions clearly |
| Single artifact approach reduces live animation fidelity | Medium | Medium | Define MVP around preview/code consistency first; validate animation expectations separately |
| More metadata creates UI clutter | Low | Medium | Keep metadata compact and expandable if needed |
| Users interpret scrape as exact copy permission | Medium | Medium | Keep product copy focused on reference/learning, not brand or asset copying |

---
*Status: DRAFT — requirements only. Implementation planning pending via /plan.*
