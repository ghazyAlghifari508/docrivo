# Graph Report - docrivo  (2026-07-11)

## Corpus Check
- 86 files · ~47,508 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 255 nodes · 419 edges · 15 communities detected
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 49 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]

## God Nodes (most connected - your core abstractions)
1. `rateLimit()` - 15 edges
2. `SiteFooter()` - 14 edges
3. `AppError` - 12 edges
4. `validateUrl()` - 12 edges
5. `crawl()` - 12 edges
6. `requireUser()` - 11 edges
7. `scrapeHtml()` - 11 edges
8. `rewritePreviewAssets()` - 10 edges
9. `isPrivateIp()` - 8 edges
10. `processJob()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Meaningful retry behavior` --references--> `Deterministic retry label`  [INFERRED]
  docs/PRD_Scrape_Preview_Attempt_Consistency.md → src/components/html-scraper.tsx
- `Supabase desktop validation` --references--> `Desktop capture metadata`  [INFERRED]
  docs/PRD_Scrape_Preview_Attempt_Consistency.md → src/components/html-scraper.tsx
- `POST()` --calls--> `validateUrl()`  [INFERRED]
  src\app\api\generations\route.ts → src\lib\url-validator.ts
- `POST()` --calls--> `rateLimit()`  [INFERRED]
  src\app\api\payments\create\route.ts → src\lib\rate-limit.ts
- `POST()` --calls--> `rateLimit()`  [INFERRED]
  src\app\api\payments\verify\route.ts → src\lib\rate-limit.ts

## Hyperedges (group relationships)
- **Scrape preview attempt flow** — component_html_scraper, api_scrape_route, lib_scrape_html, lib_render_page, lib_rewrite_preview_assets, component_scrape_metadata [EXTRACTED 1.00]
- **Same-origin asset proxy flow** — api_scrape_asset_route, lib_rewrite_css_urls, concept_ssrf_safe_proxy, lib_rewrite_preview_assets [EXTRACTED 1.00]
- **Public default SVG assets** — public_next_svg, public_vercel_svg, public_window_svg [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (20): ScrapeDetail(), SiteFooter(), TemplateLock(), Topographic(), reduceMotion(), TypingHeadline(), appUrl(), safeNext() (+12 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (22): submit(), sync(), showJob(), submit(), clearHistory(), getActiveJobId(), getActiveScrapeId(), getHistory() (+14 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (14): GET(), POST(), apifyScrape(), getApifyToken(), AppError, fetchAsset(), fetchHtml(), consumeQuota() (+6 more)

### Community 3 - "Community 3"
Cohesion: 0.15
Nodes (13): inlineStyles(), scrapeHtml(), stylesheetHrefs(), withBaseHref(), rewriteInlineStyleUrls(), rewritePreviewAssets(), runtimeShim(), scriptValue() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.25
Nodes (16): claimNextJob(), crawl(), errorDetails(), extractPage(), failJob(), inferLayoutPatterns(), isPersistenceError(), log() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (14): client(), complete(), completeDesign(), countBullets(), countHeadings(), countPrompts(), countTableRows(), designIssues() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (9): PaymentVerifier(), POST(), appUrl(), authHeader(), createSnapTransaction(), getTransactionStatus(), serverKey(), getEntitlement() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.27
Nodes (10): getBrowser(), guardContext(), isBlockedRequestUrl(), renderPage(), isPrivateIp(), isPrivateIPv4(), isPrivateIPv6(), normalizeUrl() (+2 more)

### Community 8 - "Community 8"
Cohesion: 0.16
Nodes (14): POST /api/scrape route, HtmlScraper component, ScrapeMetadata component, Desktop capture metadata, Deterministic retry label, Attempt metadata visibility, Meaningful retry behavior, Single captured scrape artifact (+6 more)

### Community 9 - "Community 9"
Cohesion: 0.6
Nodes (3): DELETE(), GET(), getOwnedScrape()

### Community 10 - "Community 10"
Cohesion: 0.7
Nodes (4): apiKey(), baseUrl(), request(), url()

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (2): proxy(), starts()

### Community 13 - "Community 13"
Cohesion: 1.0
Nodes (2): GET(), safeNext()

### Community 14 - "Community 14"
Cohesion: 0.67
Nodes (3): GET /api/scrape/asset route, SSRF-safe same-origin asset proxy, rewriteCssUrls

### Community 15 - "Community 15"
Cohesion: 0.67
Nodes (3): Next.js logo SVG, Vercel logo SVG, Browser window icon SVG

## Knowledge Gaps
- **8 isolated node(s):** `Single captured scrape artifact`, `rewritePreviewAssets`, `rewriteCssUrls`, `renderPage desktop browser capture`, `Client-side scrape/generation history` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 12`** (3 nodes): `proxy()`, `starts()`, `proxy.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (3 nodes): `GET()`, `safeNext()`, `route.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SiteFooter()` connect `Community 0` to `Community 6`?**
  _High betweenness centrality (0.249) - this node is a cross-community bridge._
- **Why does `getEntitlement()` connect `Community 6` to `Community 0`, `Community 2`?**
  _High betweenness centrality (0.233) - this node is a cross-community bridge._
- **Why does `rateLimit()` connect `Community 2` to `Community 3`, `Community 6`?**
  _High betweenness centrality (0.192) - this node is a cross-community bridge._
- **Are the 7 inferred relationships involving `rateLimit()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`rateLimit()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `validateUrl()` (e.g. with `POST()` and `fetchAsset()`) actually correct?**
  _`validateUrl()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `crawl()` (e.g. with `validateUrl()` and `guardContext()`) actually correct?**
  _`crawl()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Single captured scrape artifact`, `rewritePreviewAssets`, `rewriteCssUrls` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._