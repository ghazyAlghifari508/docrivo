# Docrivo Stack Migration — TanStack Start + Drizzle + Better Auth

**Date:** 2026-09-26
**Status:** Approved for planning
**Scope:** Leave InsForge entirely. Self-host the data layer on a local PostgreSQL 17 instance. Rebuild the web tier on TanStack Start.

---

## 1. Context and goals

Docrivo is a reference-website → `DESIGN.md` generator. A user pastes a public URL; a background worker crawls it with Playwright, extracts visual tokens, and an LLM writes a design-system document plus an implementation prompt.

The application today runs on Next.js 16.2.10 against InsForge (a managed Postgres BaaS) for database, auth, and object storage.

### Why migrate

Four stated motivations, all of which this design serves:

1. **Data ownership / anti-lock-in.** Production data lives in someone else's Postgres instance.
2. **ORM ergonomics.** There is no ORM. Data access is a hand-rolled PostgREST HTTP client.
3. **Backend maturity.** InsForge friction and instability.
4. **Cost / instance performance.**

### Non-goals for this migration

- Performance is *not* a primary motivation. See §3 — the framework is not the bottleneck. This migration is justified by ownership, ergonomics, and the elimination of a dual scrape path.
- Production deployment. There is no VPS yet. This spec covers the local-first rebuild only.
- Rewriting product logic. `ai-provider.ts`, `preview-html.ts`, `render-page.ts`, and `url-validator.ts` are pure logic and must not be touched.

### Success criteria

- No `@insforge/sdk`, `insforge`, or `apify` references remain in `src/` or `worker/`.
- All 15 pages and 12 HTTP endpoints reach behavioural parity with the Next.js implementation.
- Google sign-in works end-to-end against local PostgreSQL.
- All 12 existing SQL migrations apply cleanly to an empty database.
- The Apify code path is deleted; Playwright is the only crawler.
- The three known performance defects (F1, F2, F3 in §3) are resolved.

---

## 2. Technology decisions

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **TanStack Start** (RC) | Integrated TanStack Query, server-function middleware, end-to-end type safety. See §2.1. |
| Router | TanStack Router (bundled with Start) | Type-safe paths and search params, validated. |
| Data fetching | **TanStack Query** | Replaces hand-rolled polling, AbortControllers, and cache logic in 3 large components. |
| Runtime | **Node.js 22 LTS** | Playwright officially targets Node. Bun's install-speed win does not justify risk on the core crawler. Deferred, not rejected. |
| Database | **PostgreSQL 17.10** (native Windows service) | Already installed and running. Real Postgres required for `FOR UPDATE SKIP LOCKED`. |
| ORM | **Drizzle ORM** + `postgres-js` | Type-safe, no codegen, thin runtime. |
| Auth | **Better Auth** (v1.6+) with Drizzle adapter | Only self-hosted option that is Drizzle-native and does not re-introduce a BaaS. |
| Auth provider | **Google only** | `emailAndPassword: false`. |
| Validation | **Zod v4** (retained) | Implements Standard Schema, which TanStack Start consumes natively. Existing schemas keep working. |
| Object storage | **Local filesystem** (`var/screenshots/`) | Preserves the existing key layout. S3/MinIO deferred until multi-node. |
| Crawling | **Playwright only** | The Apify branch exists solely because Playwright fails in Vercel lambdas. No Vercel means no Apify. |
| Testing | **Vitest** (retained) | Already configured. |

### 2.1 Why TanStack Start over React Router 7

The decision was made on technical merit, explicitly discounting maturity and documentation quality.

- **Runtime performance is a tie.** All three of Next.js, React Router 7, and TanStack Start can achieve top Lighthouse scores. On a warm long-running process, cold start is irrelevant. Selecting a framework on performance grounds would be a mistake.
- **Start wins on type safety.** Validated search params and validated server-function inputs, end-to-end. React Router 7 requires manual Zod wiring.
- **Start wins on the data layer.** `queryClient.ensureQueryData()` inside a loader gives free SSR prefetch. React Router 7 requires hand-rolled dehydration.
- **Start wins on auth ergonomics.** `createMiddleware().client().server()` lets auth logic be written once and run on both sides. React Router 7 and Next.js duplicate loader/fetcher logic.
- **Start wins on input validation.** Built in via Standard Schema.

Accepted costs: Start is a Release Candidate, its Server Components support is experimental, and its ecosystem is less mature. These were consciously accepted.

### 2.2 Why Better Auth

| Candidate | Rejected because |
|---|---|
| Clerk | Hosted vendor with MAU limits. Re-introduces a BaaS, directly contradicting the anti-lock-in goal. Provides no PostgreSQL. |
| Auth.js v5 | Thin Drizzle adapter, heavy magic, Next-centric. |
| Supabase Auth | A BaaS. Directly contradicts the goal. |
| **Better Auth** | **Selected.** Self-hosted, first-class Drizzle adapter, first-party Google provider, session cookies built in. |

The decisive constraint: the PostgreSQL instance must be self-owned, and no BaaS will give that away with the auth service included. Better Auth fills exactly that gap.

### 2.3 Playwright licensing

Playwright is Apache 2.0, copyright Microsoft and Google. Commercial use is permitted, including building paid products on top of it. There is no royalty obligation and no requirement to open-source Docrivo's own code.

Two obligations: retain the Apache license and NOTICE if redistributing Playwright, and do not use the Playwright name in a way that implies Microsoft endorsement.

Locally this is unambiguous. It remains unambiguous when deployed to a VPS. The separate paid product, Microsoft Playwright Testing on Azure, is not used and not needed.

---

## 3. Investigation findings

These were found while assessing the existing system. They drive part of the work and must not be lost.

### F1 — The worker is single-job-at-a-time with no lease expiry (critical)

`worker/index.ts` runs one job at a time. `claim_next_job()` performs an atomic claim but sets no lease. A single generation can block the queue for up to 180 seconds (the LLM timeout), multiplied across three model fallbacks and two retry attempts. There is no horizontal scaling and no reclaim path for a crashed worker's in-flight job.

This is the largest actual throughput constraint in the system. It is not caused by the framework.

**Remediation (Phase 7):** add `lease_expires_at` to `generation_jobs`; add a reclaim path for expired leases; run N concurrent jobs bounded by available memory.

### F2 — Unbounded data growth (high)

`generated_documents.design_md` is 12,000+ characters per row and `scrape_artifacts.html` / `preview_html` can reach 6 MB. There is no retention job. The `[schedules]` block in `insforge.toml` defines no schedule. The database grows without bound, and query performance degrades over time.

**Remediation (Phase 7):** retention job deleting artifacts and documents past an age threshold.

### F3 — `getUser()` executes on every request (medium)

`site-header.tsx` is an async server component used on every page, including public ones. It calls `getUser()`, producing a network round trip per request.

**Remediation:** structural. Moving session resolution into the `__root.tsx` loader resolves it once per request and lets TanStack Query handle caching. No bespoke patch required.

### F4 — `scrape_artifacts` is never created (correctness, blocking)

Ten tables are created across the 12 migration files. `scrape_artifacts` has **zero** `create table` statements but appears 17 times across 3 migrations — RLS policies, indexes, and grants. It was evidently created out of band between migrations.

Consequence: applying the 12 migrations to an empty database **fails** at `20260710132820_fix-rls-ownership-policies.sql`, which creates policies on a non-existent table.

**Remediation (Phase 0 and 1):** recover the authoritative definition from the live InsForge database, and add a migration that creates the table, positioned before the three migrations that reference it.

### F5 — Dual scrape path is environment-dependent (medium)

`src/app/api/scrape/route.ts` branches on `!process.env.VERCEL`: local uses Playwright, production uses Apify with a raw-HTTP fallback. The comment states the reason — "Playwright fails in Vercel's serverless lambda." Consequently `metadata.capture_mode` differs between environments (`desktop-browser` vs `apify`). This is the subject of `docs/PRD_Scrape_Preview_Attempt_Consistency.md`.

**Remediation:** delete the Apify branch entirely. Playwright becomes the only crawler and the inconsistency disappears.

### F6 — `retry_generation_job` RPC is never called (low)

The function exists in SQL but no TypeScript calls it. Retry is effectively a user re-submit.

**Decision:** leave as-is. Out of scope.

### F7 — README is substantially inaccurate (low, documentation)

The README documents an API surface, an auth method (email/password rather than Google OAuth), a rate-limiting implementation (in-memory rather than a Postgres RPC), and an admin guard (`ADMIN_TOKEN` rather than `ADMIN_EMAILS`) that do not match the code. It also claims all database operations go through `@insforge/sdk`, which is false.

**Remediation (Phase 6):** rewrite alongside the stack change, since the API surface changes anyway.

### F8 — `screenshot_mobile_url` is never written (low)

The column exists on `crawled_pages` and is never populated. `extracted_assets.storage_url` is likewise never populated; asset download and mirroring was never implemented despite PRD AC-8.

**Decision:** leave as-is. Pre-existing gap, unrelated to this migration.

---

## 4. Architecture

### 4.1 Component topology

Two processes, one database. This separation is unchanged from today.

```
┌─ WEB — TanStack Start, port 3000 ───────────────────────────┐
│                                                             │
│  Client ──createServerFn──▶ createGeneration()              │
│                             ├─ auth.api.getSession()        │
│                             ├─ hitRateLimit()      drizzle   │
│                             ├─ consumeQuota()      drizzle   │
│                             └─ insert generation_jobs        │
│                                    status = 'queued'        │
│                                                             │
│  Client ◀──useQuery(refetchInterval)──┐                      │
│    ▲                                │                      │
│    └──── jobQueryOptions(id) ───────┘                      │
│                                                             │
│  __root.tsx loader: session + queryClient (once per request)│
└──────────────────────────────┬──────────────────────────────┘
                               │  FOR UPDATE SKIP LOCKED
┌─ WORKER — tsx, separate process ┼──────────────────────────┐
│  claimNextJob() ◀──────────────┘                           │
│    ├─ Playwright crawl (max_pages, default 5)               │
│    ├─ screenshot → var/screenshots/{jobId}/{n}.png          │
│    ├─ page.evaluate(extractPage) → jsonb                    │
│    ├─ setStatus('generating') + 60s heartbeat              │
│    └─ completeDesign() → LLM                                │
│                    → design_extractions                     │
│                    → generated_documents                    │
│                           status = 'completed'              │
└─────────────────────────────────────────────────────────────┘
```

The worker remains a separate process. Running Chromium inside the web server process would mean an out-of-memory condition in the crawler takes down the web app, and the two have different lifecycles — an adaptive-backoff polling loop versus a request/response server. `scripts/dev.js` already spawns both processes on Windows; that pattern is retained.

### 4.2 Data access change

`src/lib/insforge-core.ts` (141 lines) is a hand-rolled PostgREST client: `fetch` calls to `/api/database/records/{table}` with a 10-second timeout, plus a `timedFetch` wrapper that converts `AbortSignal.timeout` `DOMException`s into plain `Error` strings. That normalizer existed solely to work around Next.js error handling.

All of it is deleted. Drizzle issues the same operations as ordinary SQL in under a millisecond, and no error-shape translation is needed.

The 10 RPC functions remain, called through Drizzle's `sql` template rather than HTTP. Eight are data-plane functions — `hit_rate_limit`, `claim_next_job`, `retry_generation_job`, `sync_user_id_from_job`, `consume_quota`, `refund_quota`, `get_user_entitlement`, `list_plans` — and two further entitlement functions are defined in the server-only migration. None are reimplemented; all are carried over as-is.

### 4.3 Polling replacement

`generation-result.tsx` (435 lines) currently implements manual polling: a 2.5-second interval, a hand-managed `AbortController`, a three-sample sliding window in a `useRef` to estimate ETA, and manual cleanup plus manual terminal-state detection.

Replaced by TanStack Query:

```ts
export const jobQueryOptions = (id: string) => ({
  queryKey: ['job', id],
  queryFn: () => getJob({ data: { id } }),
  refetchInterval: (q) => {
    const s = q.state.data?.status
    return s === 'completed' || s === 'failed' ? false : 2500
  },
})
```

Removed: the `AbortController`, the sliding-window ETA `useRef`, the polling effect and its cleanup, and the manual stop condition. `refetchInterval` accepts a function of query state, so polling halts automatically on a terminal status.

Additionally, cross-tab refetch is obtained for free. Today a second tab showing `/history` displays stale job status.

The same pattern applies to `history-list.tsx` (227 lines) and `scrape-detail.tsx` (211 lines).

### 4.4 Server functions versus HTTP routes

Server functions are JSON-RPC. Three endpoints cannot use them because their responses are not JSON, and must remain HTTP server routes:

| Route | Reason it stays HTTP |
|---|---|
| `/api/scrape/preview` | Returns HTML and requires its own `sandbox` CSP. |
| `/api/scrape/asset` | Proxies binary assets and requires `Access-Control-Allow-Origin: *` because the sandboxed `srcDoc` iframe has origin `null`. |
| `/api/generations/[id]/download` | File download with `Content-Disposition`. |

The remaining 9 endpoints become server functions, grouped by domain in `src/lib/queries/`.

### 4.5 Directory structure

```
src/
  routes/                        ← replaces src/app/
    __root.tsx                   root loader: session, queryClient, fonts, lang="id"
    index.tsx  about.tsx  faq.tsx  bantuan.tsx
 login.tsx  maintenance.tsx  pricing.tsx
    profile.tsx  setting.tsx  template.tsx  admin.tsx
    history.tsx
    generations.$id.tsx
    history_.scrapes.$id.tsx
    api/scrape.preview.ts
    api/scrape.asset.ts
    api/generations.$id.download.ts
  components/                    ← 17 components, code moved unchanged
  lib/
    db/schema.ts                 ← 11 pgTable definitions + 4 Better Auth tables
    db/index.ts                  ← drizzle client
    auth/server.ts               ← betterAuth instance
    auth/client.ts               ← authClient
    queries/
      jobs.ts  scrapes.ts  entitlements.ts  plans.ts  profile.ts
    ai-provider.ts               ← UNCHANGED (285 lines)
    preview-html.ts              ← UNCHANGED
    render-page.ts               ← UNCHANGED
    url-validator.ts             ← UNCHANGED
worker/index.ts                  ← stays at repo root, separate from the web app
migrations/                      ← 12 existing SQL files + 1 new (scrape_artifacts)
var/screenshots/                 ← local storage root, gitignored
```

The 17 components move without modification. All 15 pages are mechanically converted: JSX is preserved, and `getUser()` calls become loader dependencies or server-function calls.

---

## 5. Data layer

### 5.1 Local PostgreSQL

Verified present and healthy:

- PostgreSQL **17.10**, service `postgresql-x64-17`, status Running, start type Automatic
- Listening on port 5432
- `psql` at `C:\Program Files\PostgreSQL\17\bin\psql.exe`
- Extensions available: `pgcrypto`, `pg_trgm`, `uuid-ossp`, `vector`
- `gen_random_uuid()` is used 7 times across the migrations. No `CREATE EXTENSION` is required — it is built in from PostgreSQL 13 onward.

Existing databases: `clipperbintang`, `kopikita`, `kopikita_test`, `novaplan`, `padelkuy`, `restomen`, `zona_ai`, `postgres`.

The established convention is one database plus one non-superuser role per project (`kopikita`, `novaplan`, `padelkuy`, `zona`). Docrivo follows it: create role `docrivo` and database `docrivo`.

### 5.2 Authentication configuration

`pg_hba.conf` currently specifies `trust` for all local connections, with no password required for any role including the `postgres` superuser. Consequence: any process on the machine can connect as superuser and drop all eight databases.

On a single-user development machine this is low urgency, but the instance holds six unrelated projects. Two decisions follow:

1. The application connects as the non-superuser role `docrivo`, never as `postgres`. This follows the existing convention and enforces least privilege — the migration tool and the application cannot accidentally drop the other project databases.
2. Tightening `pg_hba.conf` to `scram-sha-256` is out of scope for this migration and is recorded as a follow-up.

### 5.3 Migration bridge

The 12 existing migration files are plain PostgreSQL and are adopted unchanged as the baseline history. Drizzle Kit generates all subsequent migrations from that point forward.

**This requires explicit handling.** Drizzle Kit derives a baseline by inspecting the target database. Pointed at an empty database it would conclude that all 11 tables are missing and generate a `CREATE TABLE` migration for each, colliding with the adopted history. Two constraints prevent this:

- The new `scrape_artifacts` migration is authored as a hand-written `.sql` file, not a Drizzle Kit generation, and is placed in the applied-baseline sequence manually.
- The `drizzle.config.ts` migrations directory and journal are configured so that Drizzle Kit's `generate` command produces only *incremental* migrations against the adopted baseline, and `migrate` never attempts to re-apply the 12 historical files.

One migration is inserted ahead of the three that reference `scrape_artifacts`:

```
20260706041528_init-designmd.sql
...
+  <new>  create-scrape-artifacts.sql          ← INSERTED HERE
...
20260710132820_fix-rls-ownership-policies.sql  ← first reference
20260710133821_optimize-rls-policy-performance.sql
20260712100000_fix-history-delete.sql
```

The authoritative column set is recovered from the live InsForge database during Phase 0, not guessed. `migrations/` currently contains no DDL for this table, so any reconstruction from the codebase alone would be speculative.

### 5.4 Row Level Security decision

`auth.uid()` is an InsForge-provided function and does not exist in stock PostgreSQL. All RLS policies must be rewritten or dropped.

**Decision: drop RLS, rely on application-layer ownership checks.**

Grounds: `src/lib/dal.ts` already performs per-route ownership verification (`row.user_id !== user.id` yields 404), and every API route re-checks `getUser()`. That is the actual enforcement point, and it is thorough. RLS was defence in depth, not the primary gate.

This decision is safe only while the database is reachable exclusively from the server. It must be revisited if the database is ever exposed directly to a browser client.

`FORCE ROW LEVEL SECURITY` clauses are removed along with the policies, since they reference `auth.uid()`.

---

## 6. Authentication

### 6.1 Configuration

```ts
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectURI: `${process.env.APP_URL}/api/auth/callback/google`,
    },
  },
  emailAndPassword: { enabled: false },
})
```

`npx auth generate --adapter drizzle` produces the four tables Better Auth requires: `user`, `session`, `account`, `verification`. These are added to `src/lib/db/schema.ts` alongside the 11 application tables.

Requirements: one OAuth client in Google Cloud Console, and a `BETTER_AUTH_SECRET` in `.env.local` (already gitignored).

### 6.2 What is replaced

| Removed | Replaced by |
|---|---|
| `src/proxy.ts` | Start router middleware. Its local JWT `exp` pre-check existed to avoid a 30-second `updateSession` round trip against an unresponsive InsForge instance. That latency source does not exist once the session is validated against a local database, so the pre-check is deleted rather than ported. |
| `src/lib/auth-actions.ts` | `authClient.signIn.social({ provider: "google" })` |
| `src/lib/insforge-server.ts` | `src/lib/auth/server.ts` |
| `src/app/api/auth/callback/route.ts` | Handled by Better Auth's `/api/auth/*` routes |
| `src/app/api/auth/refresh/route.ts` | Handled by Better Auth's rotating session cookie |
| `createServerClient`, `CookieStore`, `updateSession` | Deleted |

The `safeNext()` open-redirect guard in the OAuth callback must be preserved — Better Auth's default redirect handling does not include it. Redirect targets are validated against an allowlist of internal paths.

The `ADMIN_EMAILS` allowlist in `dal.ts` is retained unchanged.

### 6.3 Server-function middleware

Session resolution is declared once and applies to both client and server execution:

```ts
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => next())
  .server(async ({ next }) => {
    const session = await auth.api.getSession({ headers: requestHeaders })
    if (!session) throw redirect({ to: "/login" })
    return next({ context: { user: session.user } })
  })
```

Every route that requires authentication declares it. This replaces the three-layer defence currently spread across `src/proxy.ts`, `src/lib/dal.ts`, and per-route handler checks. The per-route ownership check in the DAL is retained — the middleware establishes *who* the user is, the DAL establishes *what* they may access.

---

## 7. Storage

Screenshots move from the InsForge `screenshots` bucket to the local filesystem, preserving the existing key layout `${job_id}/${pageIndex + 1}.png` under `var/screenshots/`.

Served through a Start server route that performs an ownership check against `crawled_pages` before returning the file, preserving current access semantics.

`src/lib/insforge-core.ts:uploadScreenshot` (the `upload-strategy` direct/presigned branching) is deleted. It becomes a filesystem write.

S3, MinIO, and R2 are deferred. They become necessary only when the worker runs on a different host from the web app — which is a production-deployment concern, not a local-first one.

---

## 8. Error handling

### 8.1 Current state

The Next.js application has no `error.tsx`, no `not-found.tsx`, and no `loading.tsx`. Error UX is whatever the framework default provides. The `timedFetch` error normalizer in `insforge-core.ts` exists to work around Next's error-shape handling and is deleted along with that module.

### 8.2 Error taxonomy

Preserved from the existing implementation, with intentional decisions recorded:

| Condition | Response | Rationale |
|---|---|---|
| Unauthenticated, page route | Redirect to `/login?next=…` | Existing behaviour. |
| Unauthenticated, server function | 401 | Existing behaviour. |
| Resource not owned by user | **404** | Deliberately *not* 403. A 403 confirms the resource exists, leaking information about other users' job IDs. |
| Quota exhausted | Rejection with upgrade prompt | Credits are a paid feature. |
| Rate limit exceeded | 429 | Backed by the `hit_rate_limit` RPC. |
| Job execution failure | Terminal `failed` status with `error_code` and `error_message`, visible in history | Not a thrown error. A failed job is a recorded outcome the user can read, not a crash. |
| LLM failure | Worker retries up to 2 attempts, then `failJob` | Existing behaviour in `ai-provider.ts`. |
| Crawl failure | `failJob` with a specific `error_code` | Existing behaviour. |

Every `failJob` also writes a `job_logs` row. This is retained.

### 8.3 Route error boundaries

Start's `errorComponent` provides per-route boundaries, replacing the missing `error.tsx` files. This is a net improvement over the current state and is scoped to the routes that actually need it: `/generations/$id`, `/history`, `/profile`, `/setting`, `/admin`, and `/pricing` (which depends on a Midtrans `order_id` search param).

### 8.4 Preserved security behaviour

The following are deliberate and must survive the port:

- Two-layer SSRF defence in `render-page.ts` — DNS resolution and IP pinning before connect, plus a `context.route` filter inside the browser. `render-page.ts` is unmodified.
- CSP headers from `next.config.ts`, including the stricter override for `/api/scrape/preview`.
- Per-user payment claim via an atomic `status = 'pending'`-scoped UPDATE, preventing double credit reset.
- Request body size caps (5 MB HTML, 15 MB assets), HTTP method allowlisting, and redirect-hop re-validation (max 3).

---

## 9. Testing strategy

### 9.1 Retained

The 5 existing Vitest suites cover pure logic and require no changes:

`ai-provider` · `fetch-html` · `preview-html` · `render-page` · `url-validator`

`ai-provider.test.ts` mocks the `openai` module and asserts the repair and validation loop. That mocking strategy is unaffected by the framework change.

### 9.2 New coverage

Ordered by risk:

**Drizzle query layer — integration tests against a real database.**
Mocked unit tests do not catch SQL errors: wrong column names, incorrect join semantics, broken `SKIP LOCKED` behaviour. These run against a real local test database. The `kopikita_test` database establishes the `_test` suffix convention; Docrivo follows it with `docrivo_test`.

**`claimNextJob` concurrency — the highest-value new test.**
Asserts that N concurrent claims return N distinct jobs, that no job is claimed twice, and that an expired lease is reclaimed. This is the regression guard for F1, the most serious defect in the system.

**Server function authorisation.**
For each server function that reads user-scoped data, assert that a second user receives 404, not 403 and not data. This preserves the deliberate 404 decision (§8.2) as an executable invariant rather than a comment.

**Better Auth session lifecycle.**
Sign-in, session persistence across requests, sign-out, and rejection of an unauthenticated request to a protected route.

**Quota and rate-limit accounting.**
`consumeQuota` decrements exactly once per job, `refundQuota` restores on failure, and the balance cannot go negative under concurrent requests.

**Ownership on the three retained HTTP routes.**
`/api/scrape/preview`, `/api/scrape/asset`, and the download route are not server functions, so they need explicit route-level tests.

### 9.3 Out of scope

No Playwright end-to-end suite. The `playwright` package is a production dependency used for crawling, not a test harness, and `@playwright/test` is not installed. Adding an E2E layer is a separate concern.

---

## 10. Migration plan

The existing production deployment on Vercel and InsForge continues serving real users throughout Phases 1 through 5. Work happens in a local sidecar. This gives zero downtime and a clean rollback: if a phase fails, nothing is lost.

Development proceeds against a seeded dataset (`--row-limit 100`), not production data. Production data is imported only at Phase 8, after parity is proven, which keeps cutover retryable.

### Phase 0 — Data safety (irreversible if skipped)

All production data lives in the InsForge project, not in the repository. If the migration proceeds and the InsForge project is lost, the data is permanently gone.

```bash
npx -y @insforge/cli db export --include-functions -o backup-full.sql
npx -y @insforge/cli backups create --name pre-migration
```

Verify before proceeding:
- Row counts per table match production
- All 10 RPC functions are present in the export
- **The `scrape_artifacts` definition is extracted** — this is the authoritative source for the F4 fix
- `insforge storage list-objects screenshots` is inventoried, since object storage is *not* included in a database export

Done when: row counts reconciled, `scrape_artifacts` DDL captured, storage inventory recorded.

### Phase 1 — Database

Create role `docrivo` and database `docrivo` (plus `docrivo_test`). Write the `scrape_artifacts` migration from the Phase 0 definition and insert it ahead of the three migrations that reference it. Apply all migrations to the empty database. Write Drizzle schema definitions for the 11 tables and configure `drizzle.config.ts` against the local instance.

Done when: `drizzle-kit migrate` completes against a clean database, and the resulting schema matches the InsForge export.

### Phase 2 — Authentication

Configure Better Auth with the Drizzle adapter and the Google provider. Generate its four tables into the schema. Port the `ADMIN_EMAILS` check and the `safeNext()` open-redirect guard. Verify sign-in, session persistence, and sign-out.

Done when: Google sign-in works end to end on `localhost`.

### Phase 3 — Skeleton and pages

Create the TanStack Start project structure **alongside** the existing Next.js application, so both remain runnable during the migration. The end state is replacement: `src/app/` is deleted in Phase 6, leaving `src/routes/` as the only application tree. Port all 15 pages. Move the 17 components without modification. Preserve `lang="id"`, fonts, and the Tailwind v4 setup including the `@theme` block in `globals.css`.

Done when: every route renders correctly with styling and i18n intact, verified in both trees.

### Phase 4 — Server functions

Replace the 12 REST endpoints. Nine become server functions grouped by domain; three remain HTTP routes (§4.4). Port the ownership checks unchanged. Delete `insforge-core.ts`.

Done when: all endpoints are at behavioural parity.

### Phase 5 — Data layer

Adopt TanStack Query for job polling, history, and scrape artifacts. Collapse `generation-result.tsx`, `history-list.tsx`, and `scrape-detail.tsx` onto `useQuery`.

Done when: no component manages an `AbortController` or a manual polling interval.

### Phase 6 — InsForge removal

Delete the Apify branch and the `!process.env.VERCEL` conditional. Delete the InsForge OAuth callback and refresh routes, `src/proxy.ts`, and all remaining InsForge SDK imports. Replace the filesystem write for screenshots. Rewrite the README to match reality (F7).

Done when: `rg "insforge|apify"` returns nothing in `src/` and `worker/`.

### Phase 7 — Performance defects

Address F1 (lease expiry, reclaim path, bounded concurrency), F2 (retention job), and F3 (already structural via the root loader — verify only).

**Deliberately last.** These defects exist independently of the framework. Fixing them during the migration would merge two sources of failure, so any breakage would be ambiguous between migration defect and pre-existing bug. Migrating first, proving parity, then optimising keeps each change isolated and independently reversible.

Done when: the queue processes concurrent jobs, expired leases are reclaimed, and old artifacts are pruned.

### Phase 8 — Data import and cutover

Import production data from the Phase 0 export into the local `docrivo` database. Reconcile row counts table by table. Import historical screenshots from InsForge storage, or consciously accept their loss.

This cutover is **to the local setup only**. It is not a production deployment — no VPS exists, so the Vercel and InsForge production deployment remains in place and authoritative until a separate hosting decision is made.

Done when: the local application runs against the local database with production data intact and row counts reconciled.

---

## 11. Explicitly out of scope

Recorded so these are not re-litigated:

- **Docker.** The user has none. Native Windows PostgreSQL service instead.
- **Bun.** Deferred. Playwright officially targets Node; revisit only if install and startup time becomes a measured problem.
- **VPS provisioning and deployment.** No VPS exists yet.
- **MinIO / S3 / R2.** Deferred until the worker and web app run on different hosts.
- **Redis / BullMQ.** The job queue is already a PostgreSQL table with atomic claiming. A second queueing system would be redundant.
- **Turborepo monorepo.** One application.
- **Reverse proxy (Nginx/Caddy).** The Start server is sufficient for local-first.
- **Reimplementing `auth.uid()` as a GUC-based RLS helper.** Superseded by the decision to drop RLS (§5.4).
- **Fixing F6, F8.** Pre-existing gaps unrelated to the stack migration.

---

## 12. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Production data lost if InsForge project is discarded | Critical | Phase 0 export with row-count verification is a hard gate. No further work starts until it passes. |
| `scrape_artifacts` definition reconstructed wrongly from the codebase | High | Definition is recovered from the live database, never guessed from usage sites. |
| TanStack Start RC introduces breaking changes | Medium | Pinned version. Framework surface is confined to `routes/`, `__root.tsx`, and `lib/queries/`; `ai-provider.ts`, `preview-html.ts`, `render-page.ts`, and `url-validator.ts` are insulated. |
| Loss of RLS weakens access control | Medium | Application-layer ownership checks are already the primary gate and are tested explicitly (§9.2). Revisit if the database is ever client-exposed. |
| Migration and performance fixes conflate, making failures ambiguous | Medium | Performance work is isolated in Phase 7, after parity is proven. |
| Chromium memory pressure on the local machine | Medium | The previous production target was a 512 MB Fly microVM, which is why the worker reuses a single browser context and carries memory-tuning comments. On the local machine the headroom is larger but unmeasured. Concurrency in Phase 7 is bounded by measured available memory, not a fixed guess. |
| Deleting the Apify path removes a production fallback | Low | The fallback existed because Playwright fails in Vercel lambdas. There is no Vercel in the target architecture. |
| `trust` auth in `pg_hba.conf` exposes all eight databases | Low | Application uses the non-superuser `docrivo` role. Tightening to `scram-sha-256` recorded as a follow-up (§5.2). |

---

## 13. Open items for the implementation plan

These require decisions or external input before implementation begins:

1. **Retention thresholds (F2).** The age at which `generated_documents` and `scrape_artifacts` rows are deleted, and whether deletion is hard or soft. Needs a product decision.
2. **Worker concurrency limit (F1).** Depends on measured local memory headroom with Chromium resident.
3. **Google OAuth credentials.** Requires a Google Cloud Console client ID and secret, plus a redirect URI decision for the final host.
4. **`BETTER_AUTH_SECRET` generation** and `.env.local` variable inventory for the new stack.
5. **Historical screenshot disposition at cutover.** Import from InsForge storage, or accept the loss of historical `screenshot_desktop_url` targets.
6. **Source tree layout.** Whether the migration happens in place, or in a parallel directory that replaces the repository once parity is proven. In-place is assumed by Phases 3 through 6; the decision affects only how the final swap is performed.
