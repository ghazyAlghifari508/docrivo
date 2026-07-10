# Graph Report - docrivo  (2026-07-10)

## Corpus Check
- 58 files · ~36,282 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 186 nodes · 295 edges · 11 communities detected
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.79)
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

## God Nodes (most connected - your core abstractions)
1. `validateUrl()` - 12 edges
2. `crawl()` - 12 edges
3. `AppError` - 11 edges
4. `rateLimit()` - 11 edges
5. `scrapeHtml()` - 10 edges
6. `SiteFooter()` - 9 edges
7. `rewritePreviewAssets()` - 8 edges
8. `isPrivateIp()` - 8 edges
9. `processJob()` - 8 edges
10. `render()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `fetchHtml()` --calls--> `validateUrl()`  [INFERRED]
  src\lib\fetch-html.ts → src\lib\url-validator.ts
- `Meaningful retry behavior` --references--> `Deterministic retry label`  [INFERRED]
  docs/PRD_Scrape_Preview_Attempt_Consistency.md → src/components/html-scraper.tsx
- `Supabase desktop validation` --references--> `Desktop capture metadata`  [INFERRED]
  docs/PRD_Scrape_Preview_Attempt_Consistency.md → src/components/html-scraper.tsx
- `POST()` --calls--> `validateUrl()`  [INFERRED]
  src\app\api\generations\route.ts → src\lib\url-validator.ts
- `POST()` --calls--> `rateLimit()`  [INFERRED]
  src\app\api\generations\[id]\retry\route.ts → src\lib\rate-limit.ts

## Hyperedges (group relationships)
- **Scrape preview attempt flow** — component_html_scraper, api_scrape_route, lib_scrape_html, lib_render_page, lib_rewrite_preview_assets, component_scrape_metadata [EXTRACTED 1.00]
- **Same-origin asset proxy flow** — api_scrape_asset_route, lib_rewrite_css_urls, concept_ssrf_safe_proxy, lib_rewrite_preview_assets [EXTRACTED 1.00]
- **Public default SVG assets** — public_next_svg, public_vercel_svg, public_window_svg [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.12
Nodes (22): submit(), sync(), showJob(), submit(), clearHistory(), getActiveJobId(), getActiveScrapeId(), getHistory() (+14 more)

### Community 1 - "Community 1"
Cohesion: 0.14
Nodes (14): fetchHtml(), inlineStyles(), scrapeHtml(), stylesheetHrefs(), withBaseHref(), rewriteInlineStyleUrls(), rewritePreviewAssets(), runtimeShim() (+6 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (5): ScrapeDetail(), SiteFooter(), Topographic(), reduceMotion(), TypingHeadline()

### Community 3 - "Community 3"
Cohesion: 0.26
Nodes (15): claimNextJob(), crawl(), errorDetails(), extractPage(), failJob(), inferLayoutPatterns(), isPersistenceError(), log() (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.29
Nodes (14): client(), complete(), completeDesign(), countBullets(), countHeadings(), countPrompts(), countTableRows(), designIssues() (+6 more)

### Community 5 - "Community 5"
Cohesion: 0.21
Nodes (8): GET(), POST(), AppError, fetchAsset(), rewriteCssUrls(), rateLimit(), POST(), POST()

### Community 6 - "Community 6"
Cohesion: 0.27
Nodes (10): getBrowser(), guardContext(), isBlockedRequestUrl(), renderPage(), isPrivateIp(), isPrivateIPv4(), isPrivateIPv6(), normalizeUrl() (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.16
Nodes (14): POST /api/scrape route, HtmlScraper component, ScrapeMetadata component, Desktop capture metadata, Deterministic retry label, Attempt metadata visibility, Meaningful retry behavior, Single captured scrape artifact (+6 more)

### Community 8 - "Community 8"
Cohesion: 0.7
Nodes (4): apiKey(), baseUrl(), request(), url()

### Community 9 - "Community 9"
Cohesion: 0.67
Nodes (3): GET /api/scrape/asset route, SSRF-safe same-origin asset proxy, rewriteCssUrls

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (3): Next.js logo SVG, Vercel logo SVG, Browser window icon SVG

## Knowledge Gaps
- **8 isolated node(s):** `Single captured scrape artifact`, `rewritePreviewAssets`, `rewriteCssUrls`, `renderPage desktop browser capture`, `Client-side scrape/generation history` (+3 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppError` connect `Community 5` to `Community 1`, `Community 3`, `Community 4`, `Community 6`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Why does `getScrapeArtifact()` connect `Community 0` to `Community 2`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `validateUrl()` (e.g. with `POST()` and `fetchAsset()`) actually correct?**
  _`validateUrl()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `crawl()` (e.g. with `validateUrl()` and `guardContext()`) actually correct?**
  _`crawl()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `rateLimit()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`rateLimit()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `scrapeHtml()` (e.g. with `POST()` and `render()`) actually correct?**
  _`scrapeHtml()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Single captured scrape artifact`, `rewritePreviewAssets`, `rewriteCssUrls` to the rest of the system?**
  _8 weakly-connected nodes found - possible documentation gaps or missing edges._