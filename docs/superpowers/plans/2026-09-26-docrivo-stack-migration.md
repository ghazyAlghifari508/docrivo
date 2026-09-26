# Docrivo Stack Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Docrivo on TanStack Start + Drizzle + Better Auth against a local PostgreSQL 17 instance, with zero trace of Next.js, InsForge, or Apify in the finished branch.

**Architecture:** Two processes, one database. A TanStack Start web tier where session resolution happens once in the root loader and all data access is Drizzle server functions, plus a standalone worker process that claims jobs atomically via `FOR UPDATE SKIP LOCKED` and runs Playwright crawls and LLM generation. Screenshots go to the local filesystem. The stack is built by stripping Next.js first, then constructing the new application on the stripped base.

**Tech Stack:** TanStack Start 1.168.58 · TanStack Router 1.170.39 · TanStack Query 5.104.0 · Drizzle ORM 0.45.3 + drizzle-kit 0.31.11 + postgres 3.4.9 · Better Auth 1.7.6 · React 19.3.0 · Vite 8.3.1 · Tailwind CSS 4.3.3 · Zod 4.6.5 · Playwright 1.63.0 · Vitest 5.0.2 · TypeScript 5.9.3 · Node 24.20.0 · PostgreSQL 17.10

**Spec:** `docs/superpowers/specs/2026-09-26-docrivo-stack-migration-design.md`

---

## Global Constraints

These apply to every task. Do not deviate without amending the spec first.

- **Branch:** all work happens on `feat/tanstack-start-drizzle`. Never commit to `dev`.
- **Zero trace:** no `next`, `insforge`, or `apify` in `package.json`, `node_modules`, config, or source by the end of Task 6.2. During Phases 0 through 3, `next` is still a direct dependency by design — Task 3.1 is what removes it. Nothing in Phases 0 to 3 may *add* a Next reference. See the verification block in Task 3.1.
- **Exact pins for TanStack:** `@tanstack/react-start@1.168.58`, `@tanstack/react-router@1.170.39`, `@tanstack/react-query@5.104.0`, `@tanstack/router-plugin@1.168.40`. No caret ranges — Start exact-pins its own internals and caret ranges cause version skew.
- **TypeScript is 5.9.3, not 7.x.** npm `latest` is 7.0.2 (native Go compiler). 5.9.3 is deliberate: TanStack Router's type inference is load-bearing for this stack's value proposition. See spec §2.4.
- **`@types/node` is `^24`,** matching the local Node 24 runtime. Vitest 5 peer requires `^22 || >=24`; `^20` does not satisfy it.
- **Google is the only auth provider.** `emailAndPassword: { enabled: false }`. No email/password, no other social provider.
- **Better Auth user table is named `users` and its id is a UUID.** `user` is reserved in PostgreSQL; UUIDs keep the existing `user_id uuid` columns unchanged across 8 tables and 8 RPC functions.
- **No RLS.** All policies, `FORCE ROW LEVEL SAFETY`, and grants to `anon`/`authenticated` are stripped. Ownership is enforced in the application layer and must be tested.
- **Ownership failures return 404, never 403.** A 403 confirms the resource exists and leaks other users' job IDs.
- **Preserve the SSRF defences in `render-page.ts` unmodified.** Two layers: DNS resolution with IP pinning before connect, and a `context.route` filter inside the browser.
- **Preserve CSP headers,** including the stricter `sandbox` override for the preview route.
- **Preserve the atomic payment claim** — a `status = 'pending'`-scoped UPDATE preventing double credit reset.
- **The worker stays a separate process.** Never merge it into the web server.
- **Do not use `next/headers` or any `next/*` import.** In TanStack Start, read headers from the request object.
- **Connection string shape:** `postgres://docrivo@localhost:5432/docrivo` for dev, `.../docrivo_test` for tests. The literal values live in `.env.local`, which is gitignored. Anywhere this plan shows a connection string, the password is a placeholder — never copy a placeholder into a real config.

---

## File Structure

### Created

```
drizzle.config.ts                     Drizzle Kit config; local Postgres, schema path, out dir
docker-compose.yml                    NOT created -- user has no Docker
src/db/
  index.ts                            Drizzle client factory. Exports `db`
  schema.ts                           11 application pgTable definitions
  schema-auth.ts                      4 Better Auth tables (users, sessions, accounts, verifications)
src/auth/
  server.ts                           betterAuth() instance
  client.ts                           authClient for browser use
  middleware.ts                       createMiddleware: session resolution, server side
  admin.ts                            ADMIN_EMAILS allowlist check
  redirect.ts                         safeNext() open-redirect guard
src/queries/
  jobs.ts                             createGeneration, getJob, listJobs, deleteJob, claimNextJob
  scrapes.ts                          createScrape, getScrape, listScrapes, deleteScrape
  entitlements.ts                     consumeQuota, refundQuota, getEntitlement
  plans.ts                            listPlans
  profile.ts                          updateProfile
  rate-limit.ts                       hitRateLimit
src/routes/
  __root.tsx                          Root loader: queryClient, session, fonts, lang="id"
  index.tsx  about.tsx  faq.tsx  bantuan.tsx  login.tsx
  maintenance.tsx  pricing.tsx  profile.tsx  setting.tsx
  template.tsx  admin.tsx  history.tsx
  generations.$id.tsx  history_.scrapes.$id.tsx
  api/scrape.preview.ts
  api/scrape.asset.ts
  api/generations.$id.download.ts
src/lib/queries/                      TanStack Query option factories
  job.ts  scrape.ts  plans.ts
src/storage/
  screenshots.ts                      Filesystem read/write, key layout preserved
scripts/                              Legacy scrape scripts; audited in Task 3.1
var/screenshots/                      Screenshot root, gitignored
migrations/                           Cleaned baseline (replaces the 13 InsForge-era files)
```

### Modified

```
package.json                          Full dependency replacement
tsconfig.json                         Paths, JSX, bundler resolution for Vite
vite.config.ts                        TanStack Start plugin + Tailwind
eslint.config.js                      Next config removed
src/lib/ai-provider.ts                UNCHANGED
src/lib/preview-html.ts               UNCHANGED
src/lib/render-page.ts                UNCHANGED
src/lib/fetch-html.ts                 UNCHANGED
src/lib/url-validator.ts              UNCHANGED
worker/index.ts                       PostgREST client swapped for Drizzle
scripts/dev.js                        Spawns web + worker; Next flags removed
```

### Deleted

```
src/app/**                            15 pages, 12 route handlers, layout
src/components/**                     17 components -- re-added fresh after the strip
src/proxy.ts                          Next 16 proxy convention
next.config.ts                        Security headers move to the Start server
insforge.toml                         InsForge project config
scripts/scrape-batch.ts               Untracked scratch script -- confirm then delete
scripts/scrape-direct.ts              Untracked scratch script -- confirm then delete
scripts/scrape-html-perfect.ts        Untracked scratch script -- confirm then delete
server-only                           Next-only import guard
```

---

## Phase 0 — Data safety

The single irreversible phase. Nothing else starts until it passes.

### Task 0.1: Recover and verify the production data from the local backup

The InsForge project is **paused**: `projects get` reports `Status: paused`, every
data-plane call returns `503 OSS request failed`, and `backups list` reports
`No backups found`. Bringing it online requires a paid Pro upgrade, so no live
export is possible.

The user already holds a full database dump at
`C:\Users\alghi\Downloads\20260721_021743.sql.gz` (1,731,529 bytes
uncompressed, 11,109 lines, PostgreSQL text format). This task adopts that file
as the input in place of a live export. **No cloud operation is performed and
no project is restored.**

The dump is a whole-instance backup, so it contains InsForge platform schemas
alongside the application schema. Those platform schemas are discarded, not
migrated — see spec §5.3 and Task 1.2.

**Files:**
- Create: `backup/pre-migration-full.sql` (gitignored)
- Create: `backup/scrape-artifacts-ddl.sql` (gitignored)
- Create: `backup/row-counts-before.json` (gitignored)
- Create: `backup/identity-reference.json` (gitignored)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `C:\Users\alghi\Downloads\20260721_021743.sql.gz`
- Produces: `backup/pre-migration-full.sql` — the schema and data baseline consumed by Task 8.1; `backup/scrape-artifacts-ddl.sql` — the `scrape_artifacts` definition consumed by Task 1.2; `backup/row-counts-before.json` — the reconciliation baseline consumed by Task 8.1; `backup/identity-reference.json` — the pre-migration user records consumed by Task 8.1 Step 2

- [ ] **Step 1: Ensure `backup/` is gitignored**

Add to `.gitignore` if not already present:

```
backup/
var/
```

Verify:

```bash
git check-ignore -v backup/pre-migration-full.sql
```

Expected: prints a matching `.gitignore` rule. The dump contains production user
emails and payment records and must never be committed.

- [ ] **Step 2: Decompress the dump**

Python 3.14 is at `C:\Python314\python.exe`. `gzip`, `7z` and WSL are unavailable.

```bash
python -c "import gzip,shutil,pathlib; src=pathlib.Path(r'C:\Users\alghi\Downloads\20260721_021743.sql.gz'); dst=pathlib.Path('backup/pre-migration-full.sql'); dst.parent.mkdir(parents=True,exist_ok=True); shutil.copyfileobj(gzip.open(src,'rb'), dst.open('wb'))"
```

- [ ] **Step 3: Verify the decompressed file is complete**

```bash
(Get-Item backup/pre-migration-full.sql).Length
```

Expected: `1731529` bytes. A different size means the transfer or decompression
is truncated — stop and report.

- [ ] **Step 4: Count the application schema objects**

```bash
python -c "import re,pathlib; t=pathlib.Path('backup/pre-migration-full.sql').read_text(encoding='utf-8',errors='replace'); print('tables  :', len({m.lower() for m in re.findall(r'CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)',t,re.I)})); print('funcs   :', len(set(re.findall(r'CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)',t,re.I)))); print('policies:', len(re.findall(r'CREATE POLICY',t,re.I)))"
```

Expected: **11** distinct `public.*` tables, **11** distinct `public.*` functions,
and 21 policies. The 11 functions are `claim_next_job`, `consume_quota`,
`get_user_entitlement`, `hit_rate_limit`, `list_plans`, `refund_quota`,
`retry_generation_job`, `sync_user_id_from_job` plus three more; report the full
list. The policy count is 21 because later migrations recreated policies, so
some appear more than once. A table count other than 11 means a table is missing
from the dump — report it rather than proceeding.

- [ ] **Step 5: Record exact row counts per table**

`pg_stat_user_tables.n_live_tup` is an estimate and is not acceptable as a
reconciliation baseline. Count the `COPY` blocks directly. In this dump format a
data block starts at `COPY <table> (<columns>) FROM stdin;` and ends at a line
containing exactly `\.`:

```python
import json, re, pathlib

text = pathlib.Path("backup/pre-migration-full.sql").read_text(encoding="utf-8", errors="replace")

TABLES = ["generation_jobs","crawled_pages","extracted_assets","design_extractions",
          "generated_documents","job_logs","rate_limits","scrape_artifacts",
          "plans","user_entitlements","payment_transactions"]

def count_rows(table):
    m = re.search(r"^COPY " + re.escape(table) + r"\s*\([^)]*\)\s*FROM stdin;\s*\n(.*?)^\\\.\s*$",
                  text, re.M | re.S)
    if not m:
        return None
    body = m.group(1)
    return len([l for l in body.split("\n") if l.strip()]) if body.strip() else 0

counts = {t: count_rows("public." + t) for t in TABLES}
counts["_total"] = sum(v for v in counts.values() if isinstance(v, int))
pathlib.Path("backup/row-counts-before.json").write_text(json.dumps(counts, indent=2))
print(json.dumps(counts, indent=2))
```

Expected values, verified against the dump on 2026-09-26:

| Table | Rows |
|---|---|
| `generation_jobs` | 50 |
| `crawled_pages` | 118 |
| `extracted_assets` | 1820 |
| `design_extractions` | 23 |
| `generated_documents` | 22 |
| `job_logs` | 113 |
| `rate_limits` | 36 |
| `scrape_artifacts` | 0 |
| `plans` | 4 |
| `user_entitlements` | 2 |
| `payment_transactions` | 3 |
| **total** | **2191** |

A `null` value means the table has no `COPY` block at all, which is different
from a table with zero rows. Report the distinction.

- [ ] **Step 6: Extract the `scrape_artifacts` definition**

This is the authoritative source for spec finding F4. The table is referenced 17
times across 3 migration files and has zero `CREATE TABLE` statements in the
repository. It exists in the dump because the live database had it.

```python
import pathlib, re

text = pathlib.Path("backup/pre-migration-full.sql").read_text(encoding="utf-8", errors="replace")
out = ["-- Recovered from backup/pre-migration-full.sql on 2026-09-26.",
       "-- Source: C:\\Users\\alghi\\Downloads\\20260721_021743.sql.gz",
       "-- The repository's migrations reference this table on 18 lines across 3 files",
"-- and never",
       "-- create it (spec finding F4). Extracted, not reconstructed.", ""]

m = re.search(r"CREATE TABLE public\.scrape_artifacts\s*\([^;]*\);", text, re.I | re.S)
out.append(m.group(0) if m else "-- CREATE TABLE NOT FOUND")

for pat in (r"CREATE INDEX[^;]*scrape_artifacts[^;]*;",
            r"ALTER TABLE ONLY public\.scrape_artifacts\s+ADD CONSTRAINT[^;]*;"):
    out += ["", *[h for h in re.findall(pat, text, re.I | re.S)]]

out += ["", "-- Intentionally NOT carried forward (see spec 5.3 / 5.4):",
        "--   FORCE ROW LEVEL SECURITY, and all 9 CREATE POLICY statements.",
        "--   The FOREIGN KEY to auth.users(id) is DROPPED, not re-pointed; it is",
        "--   re-added in migration 0011_user_fks.sql after Better Auth creates",
        "--   public.users, because the baseline must apply to an empty database.", ""]

pathlib.Path("backup/scrape-artifacts-ddl.sql").write_text("\n".join(out), encoding="utf-8")
print("\n".join(out))
```

Expected table body, verified against the dump:

```sql
CREATE TABLE public.scrape_artifacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_url text NOT NULL,
    status integer DEFAULT 200 NOT NULL,
    html text NOT NULL,
    preview_html text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
```

Note `status` is `integer`, not `text`, and `user_id` is `NOT NULL`. Both matter
for the Drizzle schema in Task 1.4. The extracted constraints are
`scrape_artifacts_pkey PRIMARY KEY (id)` and
`scrape_artifacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE`,
plus index `idx_scrape_artifacts_user_id ON public.scrape_artifacts USING btree (user_id, created_at DESC)`.

- [ ] **Step 7: Record the pre-migration identity set**

```python
import json, re, pathlib

text = pathlib.Path("backup/pre-migration-full.sql").read_text(encoding="utf-8", errors="replace")
m = re.search(r"^COPY auth\.users\s*\(([^)]*)\)\s*FROM stdin;\s*\n(.*?)^\\\.\s*$", text, re.M | re.S)
cols = m.group(1).split(",") if m else []
rows = [l.split("\t") for l in m.group(2).split("\n") if l.strip()] if m else []

out = {
    "count": len(rows),
    "columns": [c.strip() for c in cols],
    "users": [
        {"id": r[cols.index("id")].strip(),
         "email_domain": r[cols.index("email")].strip().split("@")[-1],
         "created_at": r[cols.index("created_at")].strip()}
        for r in rows if "id" in cols and "email" in cols
    ],
}
pathlib.Path("backup/identity-reference.json").write_text(json.dumps(out, indent=2))
print(json.dumps(out, indent=2))
```

Store only the email **domain**, never the local part. This file exists to let
Task 8.1 re-link the two pre-migration users to their new Better Auth ids; a
full email address is not needed for that and does not belong in a file that a
human might paste into an issue.

Expected: `count` is **2**.

- [ ] **Step 8: Confirm the screenshot question is settled**

```python
import re, pathlib
text = pathlib.Path("backup/pre-migration-full.sql").read_text(encoding="utf-8", errors="replace")
m = re.search(r"^COPY storage\.objects\s*\([^)]*\)", text, re.M | re.S)
print("columns:", " ".join(m.group(0).split()) if m else "none")
```

Expected columns: `bucket, key, size, mime_type, uploaded_at, uploaded_by,
uploaded_via, s3_access_key_id, etag` — **no `bytea` or content column**, so
screenshot bytes were never in the SQL dump. Combine with a row count of **0**
to conclude there are no screenshots to import.

`storage.objects` holding zero rows is the finding that settles Task 8.1
Step 4: there is no screenshot history to preserve and no `screenshot_desktop_url`
value that can resolve. Record the conclusion in `backup/row-counts-before.json`
under a `screenshots` key so Task 8.1 reads the decision rather than re-deriving
it.

- [ ] **Step 9: Verify the platform schemas that will be discarded**

```python
import re, pathlib
text = pathlib.Path("backup/pre-migration-full.sql").read_text(encoding="utf-8", errors="replace")
print(sorted({m for m in re.findall(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)\.", text)}))
```

Expected: `auth`, `compute`, `deployments`, `email`, `functions`, `memory`,
`payments`, `realtime`, `schedules`, `storage`, `system`. These are InsForge
platform schemas and are **not** migrated. Only the `public` schema's 11
application tables carry forward.

`auth.uid()` is defined in the dump as
`SELECT nullif(auth.jwt() ->> 'sub', '')::uuid`, and depends on `auth.jwt()`.
This is why spec §5.4 drops RLS rather than reimplementing `auth.uid()` locally
— it would require reimplementing JWT verification too.

- [ ] **Step 10: Commit the gitignore change only**

```bash
git add .gitignore
git commit -m "chore: gitignore backup dumps and local screenshot storage"
```

Do not commit anything under `backup/`. Do not run any InsForge command — the
project is paused and this task deliberately avoids touching it.

**Done when:** `backup/pre-migration-full.sql` is 1,731,529 bytes; 11 `public.*`
tables and 11 `public.*` functions are confirmed; `backup/row-counts-before.json`
holds the 11 counts totalling 2191; `backup/scrape-artifacts-ddl.sql` holds the
extracted `create table` with its primary key, foreign key and index; `backup/identity-reference.json` records 2 users with email domains only; the screenshot question is recorded as settled with zero objects; and the gitignore change is committed with nothing else staged.

### Task 0.2: Install the target dependency set

**Files:**
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: the verified version matrix (spec §2.4)
- Produces: the full dependency set every later phase needs — consumed by all of Phases 1 through 8

This task runs before Phase 1 because Phases 1 and 2 both execute `vitest` and import `drizzle-orm`. Installing inside Phase 3 would leave those phases unable to run.

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install --save-exact react@19.3.0 react-dom@19.3.0 \
  @tanstack/react-start@1.168.58 @tanstack/react-router@1.170.39 @tanstack/react-query@5.104.0 \
  drizzle-orm@0.45.3 postgres@3.4.9 better-auth@1.7.6 zod@4.6.5 playwright@1.63.0

npm install --save-dev --save-exact \
  @tanstack/router-plugin@1.168.40 vite@8.3.1 @vitejs/plugin-react \
  tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 \
  drizzle-kit@0.31.11 vitest@5.0.2 typescript@5.9.3 tsx@4.23.15 \
  "@types/node@^24" "@types/react@^19" "@types/react-dom@^19"
```

`drizzle-orm` and `postgres` are runtime dependencies here, not dev — the worker process uses both in production.

- [ ] **Step 2: Verify no caret range landed on a TanStack package**

```bash
Select-String -Path package.json -Pattern '"@tanstack/[^"]*": "\^'
```

Expected: no output. Start exact-pins its own internals, and a caret range causes npm to hoist a Router that does not match.

- [ ] **Step 3: Verify the installed versions match the matrix**

```bash
npm ls @tanstack/react-start @tanstack/react-router @tanstack/react-query drizzle-orm drizzle-kit better-auth postgres react vite vitest typescript @types/node --depth=0
```

Expected: every version matches the table in spec §2.4 exactly. `@types/node` must resolve to 24.x — Vitest 5 dropped `^20` support and the project previously pinned `^20.19.43`.

- [ ] **Step 4: Confirm TypeScript is 5.9.3, not 7.x**

```bash
npx tsc --version
```

Expected: `Version 5.9.3`. npm `latest` for TypeScript is 7.0.2; the deviation is deliberate and recorded in spec §2.4.

- [ ] **Step 5: Confirm no Next.js was pulled in transitively**

```bash
npm ls next next-rsc eslint-config-next 2>&1
```

Expected: `next` is not yet removed — it is still a direct dependency at this point, since the strip happens in Task 3.1. What matters here is that nothing *new* added it. Verify with:

```bash
npm explain next
```

Expected: only the single direct entry from the existing `package.json`. Any transitive path indicates a new package pulling Next in, which violates the zero-trace constraint.

- [ ] **Step 6: Verify Vitest runs**

```bash
npx vitest run
```

Expected: the 5 preserved pure-logic suites PASS on Vitest 5. A failure here means a version incompatibility that must be resolved before any further work.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install TanStack Start, Drizzle, Better Auth, and Vite at pinned versions"
```

**Done when:** every version in spec §2.4 is installed and matches; no caret on a TanStack package; `npx tsc --version` reports 5.9.3; the 5 preserved suites pass on Vitest 5.

---

## Phase 1 — Database

### Task 1.1: Create the local role and databases

**Files:**
- Modify: `scripts/dev.js` (no -- this task is SQL only)
- Create: none

**Interfaces:**
- Consumes: the running `postgresql-x64-17` service on port 5432
- Produces: role `docrivo`, databases `docrivo` and `docrivo_test` — consumed by every later task

- [ ] **Step 1: Create the role**

Choose a local-only development password and keep it in one variable for this
task. It is a throwaway credential for a loopback connection on a machine with
`trust` auth, but it must not be written into any tracked file.

```bash
$PW = "<pick-a-dev-password>"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d postgres -w -c "create role docrivo login password '$PW'"
```

Record `$PW` in `.env.local` in Step 5 and nowhere else. It is needed in Task
1.1 only; every later task reads it back out of `.env.local`.

Expected: `CREATE ROLE`. The role is deliberately **not** a superuser and has no `CREATEDB`, matching the convention used by the `kopikita`, `novaplan`, `padelkuy`, and `zona` roles on this instance.

- [ ] **Step 2: Create both databases owned by that role**

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d postgres -w -c "create database docrivo owner docrivo"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d postgres -w -c "create database docrivo_test owner docrivo"
```

- [ ] **Step 3: Verify the role can connect to its own database**

Each task runs in its own session, so a shell variable set in Task 1.1 is not in
scope here or in any later task. Read the password back out of `.env.local`, which
is the single source of truth for it:

```bash
$env:PGPASSWORD = ((Get-Content .env.local -Raw) -match 'DATABASE_URL=postgres://docrivo:([^@]+)@') ? $Matches[1] : $null
if (-not $env:PGPASSWORD) { throw "could not read the password from DATABASE_URL in .env.local" }
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -t -A -c "select current_user, current_database();"
```

Expected: `docrivo|docrivo`. Clear the variable afterwards with `Remove-Item Env:\PGPASSWORD`.

**This does not verify the password.** `pg_hba.conf` is `trust` for local
connections, so a connection succeeds whether or not the password is correct. To
verify the password actually stored, read the SCRAM verifier and recompute it:

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d postgres -w -t -A -c "select rolpassword from pg_authid where rolname='docrivo';"
```

The value is a SCRAM-SHA-256 verifier of the form
`SCRAM-SHA-256$<iterations>:<salt-b64>$<storedkey-b64>:<serverkey-b64>`. Deriving
it from `$PW` means: PBKDF2-HMAC-SHA256 over the password using the stored salt
and iteration count to get a Client Key, then HMAC-SHA256 of that with the stored
key to get the Stored Key, then base64 and compare against the stored value.
`True` means the password matches.

If `rolpassword` is null the role has no password set, and `ALTER ROLE docrivo
PASSWORD` is required before any future switch to `scram-sha-256`.

- [ ] **Step 4: Record what the `docrivo` role can and cannot reach**

PostgreSQL grants `CONNECT` to `PUBLIC` on every database by default, so a role
with no explicit grant on a database can still connect to it. The expectation
here is therefore **not** "permission denied". The correct finding is that the
instance is permissive by default, and the honest report is that measurement.

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d postgres -w -t -A -c "select datname, coalesce(datacl::text,'<default: CONNECT to PUBLIC>') from pg_database where not datistemplate order by 1;"
```

Expected: every row either shows an ACL granting `PUBLIC` connect, or the
`<default: CONNECT to PUBLIC>` marker. Then measure the actual reach:

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d kopikita -w -t -A -c "select count(*) from pg_tables where schemaname='public';"
```

Expected: a non-zero table count. That count is **catalog metadata only** --
table and column names. It does not mean row data is reachable. Establish the
actual reach separately:

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d kopikita -w -t -A -F'|' -c "select 'SELECT='||has_table_privilege('docrivo', t, 'SELECT')||' INSERT='||has_table_privilege('docrivo', t, 'INSERT')||' UPDATE='||has_table_privilege('docrivo', t, 'UPDATE')||' DELETE='||has_table_privilege('docrivo', t, 'DELETE') from (select tablename as t from pg_tables where schemaname='public' order by tablename limit 3) s;"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d kopikita -w -t -A -c "select has_database_privilege('docrivo','kopikita','CREATE');"
```

Expected, verified on this instance: all privileges `false`, and `CREATE` `false`.
The `docrivo` role can therefore **connect and enumerate table names, but cannot
read, write, or create anything**. Report this as a finding; do not attempt to
fix it.

**Why this is recorded rather than fixed:** the root cause is
`pg_hba.conf` set to `trust` for all local connections, which predates this
migration and applies to the whole instance. While `trust` is in effect,
revoking `CONNECT` from `PUBLIC` changes nothing — authentication, not the
ACL, is the gate, so any local process can already connect as any role. The
real fix is switching `pg_hba.conf` to `scram-sha-256` and setting passwords on
all seven project roles, which touches the user's other six projects and is out
of scope for this migration. See spec §5.2.

**Why this does not block Task 1.2:** PostgreSQL has no cross-database query
mechanism. There is no `dblink` and no cross-database join, so a migration
executed against the `docrivo` database cannot read or write any other
database's data without an explicit connection change. Drizzle Kit targets
exactly one database, named in the connection string. The over-reach is a real
instance-hardening finding, not a migration-integrity risk.

- [ ] **Step 5: Write the connection string to `.env.local`**

Append to `.env.local`:

```
DATABASE_URL=postgres://docrivo:<same-password>@localhost:5432/docrivo
DATABASE_URL_TEST=postgres://docrivo:<same-password>@localhost:5432/docrivo_test
```

- [ ] **Step 6: Commit nothing**

Credentials live only in the gitignored `.env.local`. There is no tracked file to commit in this task.

**Done when:** role `docrivo` exists as a non-superuser with no CREATEDB, both databases exist and are owned by it, the role's privilege reach on the pre-existing project databases is measured and recorded (catalog metadata only, no row access), the password is set and verified against the stored SCRAM verifier, and `.env.local` carries a working `DATABASE_URL` and `DATABASE_URL_TEST`.

### Task 1.2: Derive the cleaned migration baseline

**Files:**
- Create: `migrations/0001_init.sql` (from `20260706041528_init-designmd.sql` and `20260706060024_hardening.sql`)
- Create: `migrations/0002_claim_next_job.sql` (from `20260706042135_claim-next-job.sql`)
- Create: `migrations/0003_atomic_retry.sql` (from `20260706062520_atomic-retry.sql`)
- Create: `migrations/0004_scrape_artifacts.sql` (from `backup/scrape-artifacts-ddl.sql`)
- Create: `migrations/0005_entitlements_and_payments.sql` (from `20260710150000_entitlements-and-payments.sql`)
- Create: `migrations/0006_user_id_columns.sql` (from `20260710140400_add-user-id-to-child-tables.sql`, RLS stripped)
- Create: `migrations/0007_rpc_hardening.sql` (from `20260710153000` and `20260710154500`, role grants stripped)
- Create: `migrations/0008_history_delete.sql` (from `20260712100000_fix-history-delete.sql`, grants stripped)
- Delete: the 13 original `migrations/2026*.sql` files
- Create: `migrations/RULES.md` — what was removed and why

**Interfaces:**
- Consumes: the 13 original migration files, `backup/scrape-artifacts-ddl.sql`
- Produces: an ordered `migrations/0001..0008.sql` baseline applying cleanly to an empty database, with `migrations/RULES.md` documenting the transformation

- [ ] **Step 1: Write the transformation rules document before touching SQL**

`migrations/RULES.md`:

```markdown
# Cleaned migration baseline

Derived from the 13 InsForge-era migration files. The originals remain in git
history. This baseline exists because those files depend on InsForge
infrastructure that a stock PostgreSQL instance does not provide.

## Removed

- All `create policy` / `drop policy` statements, and all
  `alter table ... force row level security`. They reference `auth.uid()`.
- All `grant` / `revoke` targeting `anon` or `authenticated`. Neither role
  exists outside InsForge, so each statement errored.
- The 3 RLS-only migrations, whose entire content was policies.

## Deferred

- **Deferred:** the two foreign keys referencing `auth.users(id)` --
  `generation_jobs_user_id_fkey` and `scrape_artifacts_user_id_fkey` -- are
  dropped from the baseline and re-added in migration `0011_user_fks.sql`,
  which Task 2.1 creates after Better Auth has made `public.users` exist.

  They cannot be re-pointed at `public.users(id)` inside the baseline, because
  the baseline's contract is that it applies cleanly to an *empty* database and
  `public.users` does not exist until Task 2.1. Referencing a not-yet-created
  table would fail at Task 1.3.

  The columns themselves (`generation_jobs.user_id`, `scrape_artifacts.user_id`,
  and the rest) are kept in the baseline; only the constraints are deferred.

## Preserved verbatim

- All 11 `create table` statements.
- All index definitions.
- All 8 function definitions -- verified against the dump: claim_next_job, consume_quota, get_user_entitlement, hit_rate_limit, list_plans, refund_quota, retry_generation_job, sync_user_id_from_job --
  including `claim_next_job` and `hit_rate_limit`,
  `consume_quota`, `refund_quota`, `get_user_entitlement`, `list_plans`.
- `revoke execute on function ... from public` -- the `public` pseudo-role
  does exist in stock PostgreSQL and these grants are still meaningful.

## Added

- `0004_scrape_artifacts.sql`, recovered from the live InsForge database.
  The originals reference this table on 18 lines across 3 files and never create it.
```

- [ ] **Step 2: Create 0001 by concatenating the schema migrations**

```bash
Get-Content migrations/20260706041528_init-designmd.sql, migrations/20260706060024_hardening.sql | Set-Content migrations/0001_init.sql
```

These two contain only `create table`, `create index`, and function definitions. No RLS. They pass through unchanged apart from the header comment, which is updated to note the new baseline.

- [ ] **Step 3: Create 0002 and 0003**

```bash
Copy-Item migrations/20260706042135_claim-next-job.sql migrations/0002_claim_next_job.sql
Copy-Item migrations/20260706062520_atomic-retry.sql migrations/0003_atomic_retry.sql
```

Both define functions. Pass through unchanged.

- [ ] **Step 4: Create 0004 from the recovered DDL**

```bash
Copy-Item backup/scrape-artifacts-ddl.sql migrations/0004_scrape_artifacts.sql
```

Prepend a comment:

```sql
-- Recovered from the live InsForge database during Phase 0.
-- The InsForge-era migrations referenced this table on 18 lines across 3 files
-- and never created it (spec finding F4). Placing it at 0004 puts it ahead of
-- the migrations that depend on it.
```

- [ ] **Step 5: Create 0005 and 0006, stripping RLS from 0006**

`0005` is a straight copy of `20260710150000_entitlements-and-payments.sql` — it creates `plans`, `user_entitlements`, `payment_transactions` and their functions.

`0006` comes from `20260710140400_add-user-id-to-child-tables.sql`. That file's 10 `auth.uid()` uses are all inside policy bodies. Strip every `create policy` / `drop policy` / `force row level security` statement, keep every `alter table ... add column user_id uuid` and every `create index`. Then **drop** any `references auth.users(id)` constraint rather than re-pointing
it. Those two foreign keys are re-added in migration `0011_user_fks.sql`, which
Task 2.1 creates once Better Auth has made `public.users` exist. Re-pointing
them here would reference a table that does not yet exist and would fail when
Task 1.3 applies the baseline to an empty database.

Verify none remain:

```bash
Select-String -Path migrations/000*.sql -Pattern "auth\.uid\(\)|auth\.users|\banon\b|\bauthenticated\b" -CaseSensitive:$false
```

Expected: **no output.** Any hit means a statement survived the strip.

- [ ] **Step 6: Create 0007 and 0008, stripping role grants**

From `20260710153000_harden-entitlement-advisor-findings.sql` and `20260710154500_server-only-entitlement-rpcs.sql`: keep the `revoke execute on function ... from public` lines, drop every line ending `from anon;` or `from authenticated;`.

From `20260712100000_fix-history-delete.sql`: drop `grant delete ... to authenticated;`. Keep any trigger or function definitions it contains.

Re-run the Step 5 verification.

- [ ] **Step 7: Delete the originals**

```bash
Remove-Item migrations/2026*.sql
```

- [ ] **Step 8: Commit**

```bash
git add migrations/
git commit -m "refactor(db): derive cleaned migration baseline without InsForge auth dependencies"
```

**Done when:** `migrations/` holds exactly 8 ordered files plus `RULES.md`; the Step 5 grep returns nothing; `scrape_artifacts` appears before any file referencing it.

### Task 1.3: Apply the baseline and reconcile against the export

**Files:**
- Create: `backup/schema-reconcile.txt` (gitignored)

**Interfaces:**
- Consumes: the `migrations/0001..0008.sql` baseline, `backup/pre-migration-full.sql`
- Produces: a verified local schema, and confidence that the baseline is faithful

- [ ] **Step 1: Apply to the empty development database**

```bash
$env:PGPASSWORD=$PW
foreach ($f in (Get-ChildItem migrations -Filter "0*.sql" | Sort-Object Name)) {
  Write-Output "applying $($f.Name)"
  & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -v ON_ERROR_STOP=1 -f $f.FullName
  if ($LASTEXITCODE -ne 0) { Write-Output "FAILED: $($f.Name)"; exit 1 }
}
```

Expected: all 8 files apply with no `ERROR`. `ON_ERROR_STOP=1` makes the first failure fatal rather than letting later files run against a broken schema.

- [ ] **Step 2: Confirm 11 tables exist**

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -t -A -c "select count(*) from pg_tables where schemaname='public';"
```

Expected: `11`.

- [ ] **Step 3: Confirm 8 functions exist**

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -t -A -c "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"
```

Expected: `8`. Verified against the backup dump, whose `public.*` function set is
`claim_next_job`, `consume_quota`, `get_user_entitlement`, `hit_rate_limit`,
`list_plans`, `refund_quota`, `retry_generation_job`, `sync_user_id_from_job` --
the identical set the repository's migrations define. A count other than 8 means
a function was lost or added; report it rather than adjusting the baseline.

- [ ] **Step 4: Confirm no RLS policies leaked through**

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -t -A -c "select count(*) from pg_policies where schemaname='public';"
```

Expected: `0`. The RLS decision in spec §5.4 is "drop RLS" — a non-zero count means a policy survived the strip.

- [ ] **Step 5: Reconcile columns against the export**

Compare the local `information_schema` output for all 11 tables against the column list in `backup/pre-migration-full.sql`. Write the result to `backup/schema-reconcile.txt`.

Any column present in one and absent in the other is a baseline defect. Fix the migration, drop and recreate `docrivo`, and re-run this task.

- [ ] **Step 6: Verify `claim_next_job` really does use SKIP LOCKED**

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -t -A -c "select prosrc from pg_proc where proname='claim_next_job';"
```

Expected: the body contains `for update skip locked`. Without it, concurrent workers will double-claim jobs and Task 7.1's work is built on sand.

- [ ] **Step 7: Apply the same baseline to `docrivo_test`**

```bash
foreach ($f in (Get-ChildItem migrations -Filter "0*.sql" | Sort-Object Name)) {
  & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo_test -w -v ON_ERROR_STOP=1 -f $f.FullName
  if ($LASTEXITCODE -ne 0) { Write-Output "FAILED: $($f.Name)"; exit 1 }
}
```

Expected: clean apply. Tests need the same schema as development.

- [ ] **Step 8: Commit nothing**

Schema state lives in the database, not the repository. The migration files were committed in Task 1.2.

**Done when:** 11 tables and 8 functions in both databases, 0 policies, columns reconciled against the export, and `claim_next_job` confirmed to use `SKIP LOCKED`.

### Task 1.4: Write the Drizzle schema and client

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/db/index.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/schema-auth.ts`
- Create: `src/db/schema.test.ts`

**Interfaces:**
- Consumes: the applied local schema
- Produces: `db` — the Drizzle client, imported by every later task; `schema` — all table definitions, consumed by `drizzleAdapter` in Task 2.1

- [ ] **Step 1: Write the failing test**

`src/db/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { db } from "./index"
import { sql } from "drizzle-orm"

const EXPECTED_TABLES = [
  "generation_jobs", "crawled_pages", "extracted_assets",
  "design_extractions", "generated_documents", "job_logs",
  "rate_limits", "scrape_artifacts", "plans",
  "user_entitlements", "payment_transactions",
]

describe("local schema", () => {
  it("has every application table", async () => {
    const rows = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables
          where table_schema = 'public' and table_type = 'BASE TABLE'`,
    )
    const found = rows.map((r) => r.table_name)
    for (const t of EXPECTED_TABLES) expect(found).toContain(t)
  })

  it("resolves generation_jobs.user_id as a uuid column", async () => {
    const rows = await db.execute<{ data_type: string }>(
      sql`select data_type from information_schema.columns
          where table_name = 'generation_jobs' and column_name = 'user_id'`,
    )
    expect(rows[0]?.data_type).toBe("uuid")
  })
})
```

- [ ] **Step 2: Create the test database helper and run it to verify it fails**

`src/db/index.ts` stub:

```ts
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL or DATABASE_URL_TEST is required")

export const sql = postgres(url, { max: 5 })
export const db = drizzle(sql, { schema: {} })
```

Run:

```bash
npx vitest run src/db/schema.test.ts
```

Expected: FAIL. `generation_jobs` is absent from the empty schema object and the test database connection is not yet pointed at.

- [ ] **Step 3: Write `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://docrivo:<password>@localhost:5432/docrivo",
  },
})
```

- [ ] **Step 4: Write the application schema**

`src/db/schema.ts` defines all 11 tables. Every `uuid` primary key uses `.default(sql\`gen_random_uuid()\`)` to match the baseline. `generationJobs` is the largest — it carries `userId` as `uuid` with no foreign key to `users`, since `users` is created in Task 2.1:

```ts
import { sql } from "drizzle-orm"
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const generationJobs = pgTable("generation_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id"),
  sessionId: text("session_id"),
  sourceUrl: text("source_url").notNull(),
  normalizedDomain: text("normalized_domain").notNull(),
  status: text("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  maxPages: integer("max_pages").notNull().default(5),
  outputLanguage: text("output_language").notNull().default("id"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  retryOf: uuid("retry_of"),
  pagesAnalyzed: integer("pages_analyzed").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("generation_jobs_session_id_created_at_idx").on(t.sessionId, t.createdAt.desc()),
  index("generation_jobs_status_idx").on(t.status),
])
```

The remaining 10 tables follow the same shape, matching the column names verified in Task 1.3 Step 5. `scrapeArtifacts` carries `html` and `previewHtml` as `text` — they reach 6 MB and `text` has no length ceiling, unlike `varchar`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/db/schema.test.ts
```

Expected: PASS, both tests.

- [ ] **Step 6: Write `src/db/schema-auth.ts`**

Left for Task 2.1, which generates it with `npx auth generate`. It is listed in the file structure so the location is known; it is not created in this task.

- [ ] **Step 7: Commit**

```bash
git add drizzle.config.ts src/db/
git commit -m "feat(db): add Drizzle schema and client for local PostgreSQL"
```

**Done when:** `src/db/schema.test.ts` passes, the client connects, and `drizzle-kit generate` produces an empty diff.

---

## Phase 2 — Authentication

### Task 2.1: Configure Better Auth with Google and UUID ids

**Files:**
- Create: `src/auth/server.ts`
- Create: `src/auth/client.ts`
- Create: `src/db/schema-auth.ts` (generated)
- Modify: `src/db/index.ts` — pass the auth schema to Drizzle
- Modify: `package.json` — add `better-auth@1.7.6`

**Interfaces:**
- Consumes: `db` and `schema` from Task 1.4
- Produces: `auth` — the Better Auth server instance, consumed by Task 2.2; `authClient` — the browser client, consumed by Task 3.3

- [ ] **Step 1: Install Better Auth at the exact version**

```bash
npm install better-auth@1.7.6
```

- [ ] **Step 2: Generate the auth schema**

```bash
npx auth generate --adapter drizzle --output src/db/schema-auth.ts
```

Expected: 4 table definitions — `user`, `session`, `account`, `verification`. Read the generated file to confirm the exact column names before Step 4; do not assume them.

- [ ] **Step 3: Confirm the install pulled no Next.js**

```bash
npm ls next 2>&1
```

Expected: empty, or "not a dependency". `next` is an **optional** peer of Better Auth, so npm must not install it. If it appears, something added it explicitly — find and remove it.

- [ ] **Step 4: Write the auth instance**

`src/auth/server.ts`:

```ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "~/db"
import * as schema from "~/db/schema-auth"

export const auth = betterAuth({
  appName: "Docrivo",
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.APP_URL ?? "http://localhost:3000",

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),

  // Google is the only provider. Email/password is disabled outright.
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectURI: `${process.env.APP_URL ?? "http://localhost:3000"}/api/auth/callback/google`,
    },
  },

  user: {
    // `user` is reserved in PostgreSQL; `users` avoids quoting at every reference.
    modelName: "users",
  },

  advanced: {
    database: {
      // UUIDs keep the existing `user_id uuid` columns across 8 tables and
      // 8 RPC functions unchanged. The default is a text id (spec section 5.3).
      generateId: () => crypto.randomUUID(),
    },
  },
})
```

- [ ] **Step 5: Write the browser client**

`src/auth/client.ts`:

```ts
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient()

export const { signIn, signOut, useSession } = authClient
```

- [ ] **Step 6: Pass the auth schema to the Drizzle client**

`src/db/index.ts`:

```ts
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as appSchema from "./schema"
import * as authSchema from "./schema-auth"

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL or DATABASE_URL_TEST is required")

export const sql = postgres(url, { max: 5 })
export const db = drizzle(sql, { schema: { ...appSchema, ...authSchema } })
```

- [ ] **Step 7: Apply the 4 auth tables**

```bash
npx auth migrate
```

Expected: 4 tables created. Verify:

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -t -A -c "select table_name from information_schema.tables where table_schema='public' and table_name in ('users','session','account','verification') order by 1;"
```

- [ ] **Step 8: Confirm `users.id` is a uuid**

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -t -A -c "select data_type from information_schema.columns where table_name='users' and column_name='id';"
```

Expected: `uuid`. If it is `text`, `generateId` was not applied and every `user_id uuid` foreign-key relationship will break.

- [ ] **Step 9: Re-add the nine deferred user foreign keys**

Task 1.2 dropped **nine** `references auth.users(id)` foreign keys, because
`public.users` did not exist when the baseline was written. Now it does. Eight of
the nine were inline column constraints; only `scrape_artifacts` had a named
constraint. All nine are recreated here.

Create `migrations/0011_user_fks.sql`:

```sql
-- Re-adds the nine foreign keys that the cleaned baseline (Task 1.2) had to
-- drop, because public.users did not exist when the baseline was written.
-- public.users is Better Auth's user table, created in this task. See spec 5.3.
--
-- Six were `alter table ... add column user_id uuid references auth.users(id)`.
alter table public.generation_jobs
  add constraint generation_jobs_user_id_fkey
  foreign key (user_id) references public.users(id);

alter table public.crawled_pages
  add constraint crawled_pages_user_id_fkey
  foreign key (user_id) references public.users(id);

alter table public.design_extractions
  add constraint design_extractions_user_id_fkey
  foreign key (user_id) references public.users(id);

alter table public.extracted_assets
  add constraint extracted_assets_user_id_fkey
  foreign key (user_id) references public.users(id);

alter table public.generated_documents
  add constraint generated_documents_user_id_fkey
  foreign key (user_id) references public.users(id);

alter table public.job_logs
  add constraint job_logs_user_id_fkey
  foreign key (user_id) references public.users(id);

-- Two were inline in their `create table`, not named constraints.
alter table public.user_entitlements
  add constraint user_entitlements_user_id_fkey
  foreign key (user_id) references public.users(id);

alter table public.payment_transactions
  add constraint payment_transactions_user_id_fkey
  foreign key (user_id) references public.users(id);

-- One was a named constraint on the table recovered from the production dump.
-- This is the ONLY one of the nine that had ON DELETE CASCADE, and the only one
-- that must keep it.
alter table public.scrape_artifacts
  add constraint scrape_artifacts_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;
```

`ON DELETE CASCADE` belongs on `scrape_artifacts` alone. The other eight had no
cascade clause in the originals, and adding one would silently change delete
behaviour for jobs, documents, entitlements and payment records. Do not
generalise it.

Apply and verify all nine:

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -v ON_ERROR_STOP=1 -f migrations/0011_user_fks.sql
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -t -A -c "select count(*) from pg_constraint where contype='f' and confrelid = 'public.users'::regclass;"
```

Expected: `9`. A lower count means a constraint was missed, and a missed one
fails silently, so check the number rather than assuming the file applied.


- [ ] **Step 10: Generate the secret and add env vars**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Append to `.env.local`:

```
BETTER_AUTH_SECRET=<paste>
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
```

- [ ] **Step 11: Add the Google OAuth client**

In Google Cloud Console, create an OAuth 2.0 Client ID of type "Web application" with authorised redirect URI `http://localhost:3000/api/auth/callback/google`.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json src/auth/ src/db/
git commit -m "feat(auth): add Better Auth with Google-only sign-in and UUID user ids"
```

**Done when:** `users`, `session`, `account`, `verification` exist; `users.id` is `uuid`; `npm ls next` is empty; no credentials are tracked.

### Task 2.2: Add the session middleware and the admin check

**Files:**
- Create: `src/auth/middleware.ts`
- Create: `src/auth/admin.ts`
- Create: `src/auth/middleware.test.ts`

**Interfaces:**
- Consumes: `auth` from Task 2.1
- Produces: `authMiddleware` — session context provider, consumed by every route in Task 3.3; `requireAdmin` — consumed by the `/admin` route

- [ ] **Step 1: Write the failing test**

`src/auth/middleware.test.ts`:

```ts
import { describe, expect, it } from "vitest"

describe("session middleware", () => {
  it("exposes a session resolver that rejects an unauthenticated request", async () => {
    const { resolveSession } = await import("./middleware")
    const session = await resolveSession(new Headers())
    expect(session).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/auth/middleware.test.ts
```

Expected: FAIL — `resolveSession` is not exported.

- [ ] **Step 3: Write the middleware**

`src/auth/middleware.ts`:

```ts
import { createMiddleware } from "@tanstack/react-start"
import { auth } from "./server"

export async function resolveSession(requestHeaders: Headers) {
  return auth.api.getSession({ headers: requestHeaders })
}

export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => next())
  .server(async ({ next, request }) => {
    const session = await resolveSession(request.headers)
    if (!session) throw new Error("UNAUTHENTICATED")
    return next({ context: { user: session.user } })
  })
```

`UNAUTHENTICATED` is thrown rather than a redirect so the same middleware serves both page routes and server functions. Page routes translate it to a redirect; server functions return 401. See Task 4.1 Step 4.

- [ ] **Step 4: Write the admin check**

`src/auth/admin.ts`:

```ts
import { adminAllowlist } from "./allowlist"

export function isAdminEmail(email: string): boolean {
  return adminAllowlist().includes(email.toLowerCase())
}
```

`src/auth/allowlist.ts`:

```ts
export function adminAllowlist(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/auth/middleware.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add `ADMIN_EMAILS` to `.env.local`**

Carry the value forward from the existing `.env.local`. Do not commit it.

- [ ] **Step 7: Commit**

```bash
git add src/auth/
git commit -m "feat(auth): add session middleware and admin email allowlist"
```

**Done when:** the middleware test passes, an unauthenticated request resolves to `null`, and `ADMIN_EMAILS` is read from the environment.

### Task 2.3: Port the open-redirect guard

**Files:**
- Create: `src/auth/redirect.ts`
- Create: `src/auth/redirect.test.ts`
- Reference (deleted in Task 3.1): `src/app/api/auth/callback/route.ts` — the `safeNext()` implementation

**Interfaces:**
- Consumes: the `safeNext` logic from the InsForge-era OAuth callback
- Produces: `safeNext(target)` — consumed by the `/login` route in Task 3.3

- [ ] **Step 1: Read the original implementation before deleting it**

```bash
Select-String -Path src/app/api/auth/callback/route.ts -Pattern "safeNext" -Context 0,20
```

The original rejects targets beginning with `//` to block protocol-relative open redirects. Copy that behaviour exactly.

- [ ] **Step 2: Write the failing test**

`src/auth/redirect.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { safeNext } from "./redirect"

describe("safeNext", () => {
  it("allows an internal path", () => {
    expect(safeNext("/history")).toBe("/history")
  })
  it("rejects a protocol-relative URL", () => {
    expect(safeNext("//evil.example.com")).toBeNull()
  })
  it("rejects an absolute URL", () => {
    expect(safeNext("https://evil.example.com")).toBeNull()
  })
  it("rejects a backslash-prefixed URL", () => {
    expect(safeNext("/\\evil.example.com")).toBeNull()
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run src/auth/redirect.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

`src/auth/redirect.ts`:

```ts
const INTERNAL = /^\/(?![/\\])/

export function safeNext(target: string | null | undefined): string | null {
  if (!target) return null
  if (!INTERNAL.test(target)) return null
  return target
}
```

- [ ] **Step 5: Run it to verify it passes**

```bash
npx vitest run src/auth/redirect.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/auth/redirect.ts src/auth/redirect.test.ts
git commit -m "feat(auth): port open-redirect guard for post-login navigation"
```

**Done when:** all 4 cases pass. The backslash case matters because some browsers normalise `/\` to `//`.

---

## Phase 3 — Strip and build

### Task 3.1: Strip the Next.js application

**Files:**
- Delete: `src/app/**`, `src/components/**`, `src/proxy.ts`, `next.config.ts`, `insforge.toml`, `server-only`
- Delete (after confirming they are scratch): `scripts/scrape-batch.ts`, `scripts/scrape-direct.ts`, `scripts/scrape-html-perfect.ts`
- Modify: `eslint.config.js`, `package.json`, `.gitignore`
- Create: `var/.gitkeep`

**Interfaces:**
- Consumes: the existing Next.js application
- Produces: a stripped base with no Next.js trace; `src/lib/{ai-provider,preview-html,render-page,fetch-html,url-validator}.ts` and their 5 tests preserved, consumed by Tasks 3.2 through 4.4

- [ ] **Step 1: Confirm the three untracked scrape scripts are scratch**

```bash
Get-Content scripts/scrape-batch.ts, scripts/scrape-direct.ts, scripts/scrape-html-perfect.ts | Select-Object -First 40
```

They are untracked and were not part of the committed application. If any contains logic not reproduced elsewhere, move it into `scripts/` under a tracked name before deleting.

- [ ] **Step 2: Capture the security headers before deleting the config**

```bash
Get-Content next.config.ts
```

Record the `headers()` array verbatim. These move to the Start server config in Task 3.2 and must not be lost — the CSP and the stricter preview override are deliberate security controls (spec §8.4).

- [ ] **Step 3: Audit `server-only` usage in the preserved files**

```bash
Select-String -Path src/lib/*.ts -Pattern 'from "server-only"'
```

For each hit, remove the import. The guard exists only to make Next throw when server code reaches the client bundle; it has no meaning outside Next, and keeping the dependency would violate the zero-trace constraint.

- [ ] **Step 4: Verify the preserved set is complete**

```bash
Get-ChildItem src/lib -Filter *.ts | Select-Object -ExpandProperty Name
```

Expected to include `ai-provider.ts`, `preview-html.ts`, `render-page.ts`, `fetch-html.ts`, `url-validator.ts` and their `.test.ts` siblings. Anything else in `src/lib` that references InsForge is deleted, not preserved.

- [ ] **Step 5: Delete the Next.js tree**

```bash
Remove-Item -Recurse -Force src/app, src/components
Remove-Item -Force src/proxy.ts, next.config.ts, insforge.toml
Remove-Item -Force scripts/scrape-batch.ts, scripts/scrape-direct.ts, scripts/scrape-html-perfect.ts
npm uninstall server-only
```

- [ ] **Step 6: Remove Next from `package.json`**

```bash
npm uninstall next eslint-config-next
```

- [ ] **Step 7: Rewrite the ESLint config without Next**

Delete any `extends: ["next/core-web-vitals"]` reference. Keep the flat-config format.

- [ ] **Step 8: Run the zero-trace verification**

```bash
npm ls next next-rsc eslint-config-next 2>&1
Select-String -Path src/**/*.ts,worker/**/*.ts -Pattern "next/|next\.config|from ['\"]next" -ErrorAction SilentlyContinue
Test-Path .next
```

Expected: no `next` package, no source matches, `.next` absent (delete it if present — `Remove-Item -Recurse -Force .next`).

- [ ] **Step 9: Confirm the preserved tests still pass**

```bash
npx vitest run
```

Expected: the 5 pure-logic suites PASS. They never touched Next, so a failure here means a preserved file was damaged during the strip.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: strip Next.js application, preserving pure-logic modules"
```

**Done when:** all three zero-trace checks are clean, the 5 preserved suites pass, and no InsForge-referencing module survives.

### Task 3.2: Scaffold the TanStack Start project

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `eslint.config.js` (rewrite)
- Create: `src/routes/__root.tsx`
- Create: `src/styles/globals.css` (moved from the deleted `src/app/globals.css`)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the stripped base from Task 3.1
- Produces: a running TanStack Start app on port 3000; the Vite, tsconfig, and Tailwind wiring every later task depends on

- [ ] **Step 1: Configure the scripts**

`package.json` scripts:

```json
{
  "dev": "node scripts/dev.js",
  "dev:web": "vite dev",
  "build": "vite build",
  "start": "node .output/server/index.mjs",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "worker": "tsx watch worker/index.ts"
}
```

All dependencies were installed in Task 0.2. This task wires configuration only.

- [ ] **Step 2: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite"
import viteReact from "@vitejs/plugin-react"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  server: { port: 3000 },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})
```

- [ ] **Step 2a: Resolve the `vitest.config.ts` module-format deprecation**

Vite 8 emits a deprecation warning for this file today and will hard-break when
`configLoader` defaults to `native`:

> The `vitest.config.ts` file is loaded as CommonJS while it uses ESM syntax.

`package.json` has no `"type": "module"`, so a `.ts` config is treated as CJS.
This must be resolved here, because Task 3.2 is the task that establishes the
project's module format. Left unaddressed it surfaces as a confusing failure in
a later task with no obvious cause.

Two acceptable resolutions — pick one:

```bash
# Option A: mark the package as ESM, which is correct for a Vite project
```

Add to `package.json`:

```json
"type": "module"
```

Then confirm every config and script still loads, including `scripts/dev.js`
(which is CommonJS and would need its `.js` extension changed to `.cjs`, or its
body converted).

```bash
# Option B: rename the config to an explicit ESM extension, leaving package.json alone
```

```bash
git mv vitest.config.ts vitest.config.mts
```

Verify the warning is gone and the suite still passes:

```bash
npx vitest run
```

Expected: 5 test files, 23 tests passing, and **no** `configLoader` or
module-format warning in the output. If the warning persists under either
option, resolve it before continuing — do not carry it forward.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["DOM", "DOM.Iterable", "ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "types": ["node", "vite/client"],
    "baseUrl": ".",
    "paths": { "~/*": ["./src/*"] }
  },
  "include": ["src", "worker", "scripts", "drizzle.config.ts", "vite.config.ts"]
}
```

`moduleResolution: "bundler"` is required by TanStack Start's generated route types. The `~/*` alias is what makes `~/db` imports resolve.

- [ ] **Step 4: Move the global stylesheet**

Recover `globals.css` from git, since Task 3.1 deleted it:

```bash
git show HEAD~1:src/app/globals.css > src/styles/globals.css
```

Preserve the `@theme` block exactly — it mirrors the generated design documents. Remove only Next-specific imports if any appear. Replace `@tailwindcss/postcss` usage with the `@import "tailwindcss";` directive that `@tailwindcss/vite` expects.

- [ ] **Step 5: Write the root route**

`src/routes/__root.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  HeadContent, Outlet, createRootRoute, Scripts,
} from "@tanstack/react-router"
import { useState, type ReactNode } from "react"
import globalCss from "~/styles/globals.css?url"

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Docrivo" },
    ],
    links: [{ rel: "stylesheet", href: globalCss }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={queryClient}>
      <html lang="id">
        <head>
          <HeadContent />
        </head>
        <body>
          {children}
          <Scripts />
        </body>
      </html>
    </QueryClientProvider>
  )
}
```

Use `useState` for the `QueryClient`, not a module-level constant — a module-level client is shared across requests on the server and leaks one user's cache into another's response.

- [ ] **Step 6: Write a placeholder index route**

`src/routes/index.tsx`:

```tsx
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: () => <main>Docrivo</main>,
})
```

- [ ] **Step 7: Verify the app boots**

```bash
npm run dev
```

Expected: the server starts on port 3000 and `http://localhost:3000` renders. `lang="id"` must be present on `<html>`.

- [ ] **Step 8: Run the type check**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 9: Re-run the zero-trace checks**

The Task 3.1 Step 8 commands, plus a build-output variant:

```bash
Test-Path .output
Test-Path .next
```

Expected: `.next` absent.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold TanStack Start with Vite, Tailwind v4, and TanStack Query"
```

**Done when:** `npm run dev` serves on 3000, `npm run typecheck` is clean, the 5 preserved tests pass, and no Next trace remains.

### Task 3.3: Port the routes and components

**Files:**
- Create: 15 route files under `src/routes/`
- Create: 17 components under `src/components/`
- Create: `src/routes/login.tsx`
- Test: `src/components/__tests__/ownership.test.ts`

**Interfaces:**
- Consumes: `authMiddleware` and `safeNext` from Tasks 2.2 and 2.3; the 17 components from git history at `HEAD~1:src/components/`
- Produces: the full route map and component set

- [ ] **Step 1: Recover the components from git**

```bash
New-Item -ItemType Directory -Force src/components
git show HEAD~1:src/components/site-header.tsx > src/components/site-header.tsx
```

Repeat for all 17. They are framework-agnostic React and move unmodified.

- [ ] **Step 2: Recover each page's JSX from git**

For each of the 15 pages, read the original to extract its JSX, then rebuild it as a Start route. Example for `/faq`:

```bash
git show HEAD~1:src/app/faq/page.tsx
```

```tsx
// src/routes/faq.tsx
import { createFileRoute } from "@tanstack/react-router"
import { FaqGroups } from "~/components/faq-groups"

export const Route = createFileRoute("/faq")({
  component: FaqPage,
})

function FaqPage() {
  return (
    <main>
      <SiteHeader />
      <FaqGroups />
      <SiteFooter />
    </main>
  )
}
```

- [ ] **Step 3: Map the full route table**

| Path | File | Auth |
|---|---|---|
| `/` | `index.tsx` | optional |
| `/about` | `about.tsx` | public |
| `/tentang` | `tentang.tsx` | public |
| `/faq` | `faq.tsx` | public |
| `/bantuan` | `bantuan.tsx` | public |
| `/maintenance` | `maintenance.tsx` | public |
| `/pricing` | `pricing.tsx` | public |
| `/login` | `login.tsx` | redirects if authed |
| `/profile` | `profile.tsx` | required |
| `/setting` | `setting.tsx` | required |
| `/template` | `template.tsx` | required |
| `/admin` | `admin.tsx` | required + admin |
| `/history` | `history.tsx` | required |
| `/generations/$id` | `generations.$id.tsx` | required |
| `/history/scrapes/$id` | `history_.scrapes.$id.tsx` | required |

`history_.scrapes.$id.tsx` uses the trailing-underscore convention so the URL contains `/history/scrapes/` without nesting under the `/history` layout.

- [ ] **Step 4: Write the login route**

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router"
import { authClient } from "~/auth/client"
import { safeNext } from "~/auth/redirect"

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    next: safeNext(typeof s.next === "string" ? s.next : null) ?? "/",
  }),
  component: LoginPage,
})

function LoginPage() {
  const { next } = Route.useSearch()

  async function signInWithGoogle() {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: next,
    })
  }

  return (
    <main>
      <h1>Masuk ke Docrivo</h1>
      <button type="button" onClick={signInWithGoogle}>
        Lanjutkan dengan Google
      </button>
    </main>
  )
}
```

`safeNext` runs inside `validateSearch`, so a malicious `?next=` is discarded before it reaches the callback URL. This is the defence the InsForge-era `safeNext()` provided.

- [ ] **Step 5: Write the ownership test**

`src/components/__tests__/ownership.test.ts`:

```ts
import { describe, expect, it } from "vitest"

describe("ownership enforcement", () => {
  it("returns 404 rather than 403 for a resource owned by another user", async () => {
    const { getOwnedJob } = await import("~/queries/jobs")
    const other = { id: "00000000-0000-0000-0000-000000000001" }
    await expect(
      getOwnedJob({ data: { jobId: "does-not-exist", userId: other.id } }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
```

This is a placeholder assertion pending Task 4.1, which implements `getOwnedJob`. It is expected to fail here and pass after Task 4.1. Do not commit a passing variant of this file before `getOwnedJob` exists.

- [ ] **Step 6: Verify every route renders**

Start the dev server and load all 15 paths.

Expected: each renders, `lang="id"` is set, Tailwind styles apply, and the 5 preserved tests still pass.

- [ ] **Step 7: Type check and commit**

```bash
npm run typecheck
npx vitest run
git add -A
git commit -m "feat: port all 15 routes and 17 components to TanStack Start"
```

**Done when:** all 15 routes render, the type check is clean, and `getOwnedJob` is the only outstanding item in the ownership test.

---

## Phase 4 — Server functions

### Task 4.1: Job server functions

**Files:**
- Create: `src/queries/jobs.ts`
- Create: `src/queries/rate-limit.ts`
- Create: `src/queries/jobs.test.ts`

**Interfaces:**
- Consumes: `db` and `schema` from Task 1.4; `authMiddleware` from Task 2.2
- Produces: `createGeneration`, `getJob`, `getOwnedJob`, `listJobs`, `deleteJob`, `claimNextJob`, `hitRateLimit` — consumed by Tasks 3.3, 5.1, 7.1 and `worker/index.ts`

- [ ] **Step 1: Write the failing test**

`src/queries/jobs.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { db, sql } from "~/db"
import { createGeneration, getOwnedJob, claimNextJob } from "./jobs"

const USER_A = "00000000-0000-0000-0000-00000000000a"
const USER_B = "00000000-0000-0000-0000-00000000000b"

beforeEach(async () => {
  await db.execute(sql`truncate generation_jobs restart identity cascade`)
})

describe("createGeneration", () => {
  it("inserts a queued job owned by the user", async () => {
    const job = await createGeneration({
      userId: USER_A,
      sourceUrl: "https://example.com",
      normalizedDomain: "example.com",
    })
    expect(job.status).toBe("queued")
    expect(job.userId).toBe(USER_A)
  })
})

describe("getOwnedJob", () => {
  it("returns the job to its owner", async () => {
    const job = await createGeneration({
      userId: USER_A, sourceUrl: "https://example.com", normalizedDomain: "example.com",
    })
    const found = await getOwnedJob({ jobId: job.id, userId: USER_A })
    expect(found.id).toBe(job.id)
  })

  it("returns 404, not 403, for another user's job", async () => {
    const job = await createGeneration({
      userId: USER_A, sourceUrl: "https://example.com", normalizedDomain: "example.com",
    })
    await expect(getOwnedJob({ jobId: job.id, userId: USER_B })).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe("claimNextJob", () => {
  it("never hands the same job to two claims", async () => {
    await createGeneration({ userId: USER_A, sourceUrl: "https://a.com", normalizedDomain: "a.com" })
    await createGeneration({ userId: USER_A, sourceUrl: "https://b.com", normalizedDomain: "b.com" })

    const [first, second] = await Promise.all([claimNextJob(), claimNextJob()])
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first?.id).not.toBe(second?.id)
  })

  it("returns null when the queue is empty", async () => {
    expect(await claimNextJob()).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/queries/jobs.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/queries/rate-limit.ts`**

```ts
import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import { db } from "~/db"

export const hitRateLimit = createServerFn({ method: "GET" })
  .inputValidator((input: { key: string; limit: number; windowSeconds: number }) => input)
  .handler(async ({ data }) => {
    const rows = await db.execute<{ allowed: boolean }>(
      sql`select public.hit_rate_limit(${data.key}, ${data.limit}, ${data.windowSeconds}::int) as allowed`,
    )
    return rows[0]?.allowed ?? true
  })
```

Call the existing RPC through Drizzle's `sql` template. Do not reimplement rate limiting in application code — the Postgres function is the source of truth and is already correct.

- [ ] **Step 4: Write `src/queries/jobs.ts`**

```ts
import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "~/db"
import { generationJobs } from "~/db/schema"

export class OwnershipError extends Error {
  readonly status = 404
  constructor() {
    super("Not found")
  }
}

export const createGeneration = createServerFn({ method: "POST" })
  .inputValidator((i: {
    userId: string; sourceUrl: string; normalizedDomain: string; maxPages?: number
  }) => i)
  .handler(async ({ data }) => {
    const [job] = await db.insert(generationJobs).values({
      userId: data.userId,
      sourceUrl: data.sourceUrl,
      normalizedDomain: data.normalizedDomain,
      maxPages: data.maxPages ?? 5,
    }).returning()
    return job
  })

export const getOwnedJob = createServerFn({ method: "GET" })
  .inputValidator((i: { jobId: string; userId: string }) => i)
  .handler(async ({ data }) => {
    const [job] = await db.select().from(generationJobs)
      .where(and(
        eq(generationJobs.id, data.jobId),
        eq(generationJobs.userId, data.userId),
      ))
    if (!job) throw new OwnershipError()
    return job
  })

export const listJobs = createServerFn({ method: "GET" })
  .inputValidator((i: { userId: string; limit?: number }) => i)
  .handler(async ({ data }) => {
    return db.select().from(generationJobs)
      .where(eq(generationJobs.userId, data.userId))
      .orderBy(desc(generationJobs.createdAt))
      .limit(data.limit ?? 50)
  })

export const deleteJob = createServerFn({ method: "POST" })
  .inputValidator((i: { jobId: string; userId: string }) => i)
  .handler(async ({ data }) => {
    // 404 rather than 403: a 403 confirms the row exists.
    const deleted = await db.delete(generationJobs)
      .where(and(
        eq(generationJobs.id, data.jobId),
        eq(generationJobs.userId, data.userId),
      ))
      .returning({ id: generationJobs.id })
    if (deleted.length === 0) throw new OwnershipError()
    return { ok: true }
  })

export const claimNextJob = createServerFn({ method: "POST" })
  .handler(async () => {
    const rows = await db.execute<{ id: string }>(
      sql`select public.claim_next_job() as id`,
    )
    const id = rows[0]?.id
    if (!id) return null
    const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, id))
    return job ?? null
  })
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/queries/jobs.test.ts
```

Expected: PASS, 5 tests. The concurrency test in particular proves `claim_next_job` is genuinely atomic.

- [ ] **Step 6: Commit**

```bash
git add src/queries/
git commit -m "feat(queries): add job server functions with 404 ownership semantics"
```

**Done when:** all 5 tests pass, including the concurrent-claim test.

### Task 4.2: Scrape server functions and local screenshot storage

**Files:**
- Create: `src/queries/scrapes.ts`
- Create: `src/storage/screenshots.ts`
- Create: `src/storage/screenshots.test.ts`
- Create: `src/queries/scrapes.test.ts`

**Interfaces:**
- Consumes: `db`, `schema`, `OwnershipError` from Task 4.1
- Produces: `createScrape`, `getScrape`, `listScrapes`, `deleteScrape`; `writeScreenshot`, `readScreenshot`, `screenshotKey` — consumed by Task 3.3, `worker/index.ts`, and the two HTTP routes in Task 4.4

- [ ] **Step 1: Write the failing storage test**

`src/storage/screenshots.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest"
import { rm } from "node:fs/promises"
import { readScreenshot, screenshotKey, writeScreenshot } from "./screenshots"

const ROOT = "var/screenshots"

afterEach(async () => { await rm(ROOT, { recursive: true, force: true }) })

describe("screenshot storage", () => {
  it("preserves the legacy key layout", () => {
    expect(screenshotKey("job-1", 0)).toBe("job-1/1.png")
    expect(screenshotKey("job-1", 4)).toBe("job-1/5.png")
  })

  it("round-trips a screenshot", async () => {
    const bytes = Buffer.from("89504e470d0a1a0a", "hex")
    await writeScreenshot("job-1", 0, bytes)
    expect(await readScreenshot("job-1", 0)).toEqual(bytes)
  })

  it("throws for a missing screenshot rather than returning empty bytes", async () => {
    await expect(readScreenshot("nope", 0)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/storage/screenshots.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the storage module**

`src/storage/screenshots.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const ROOT = process.env.SCREENSHOT_DIR ?? "var/screenshots"

// Key layout is unchanged from the InsForge bucket so existing
// crawled_pages.screenshot_desktop_url values keep their shape.
export function screenshotKey(jobId: string, pageIndex: number): string {
  return `${jobId}/${pageIndex + 1}.png`
}

function absolute(key: string): string {
  const resolved = path.resolve(ROOT, key)
  const root = path.resolve(ROOT)
  if (!resolved.startsWith(root + path.sep)) {
    throw new Error("screenshot key escapes storage root")
  }
  return resolved
}

export async function writeScreenshot(
  jobId: string, pageIndex: number, bytes: Buffer,
): Promise<{ key: string; url: string }> {
  const key = screenshotKey(jobId, pageIndex)
  const file = absolute(key)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes)
  return { key, url: `/api/screenshot/${key}` }
}

export async function readScreenshot(jobId: string, pageIndex: number): Promise<Buffer> {
  return readFile(absolute(screenshotKey(jobId, pageIndex)))
}
```

The `startsWith` guard matters: `pageIndex` reaches this module from crawl output, and a traversal there would read arbitrary files.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/storage/screenshots.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Write the scrape server functions**

`src/queries/scrapes.ts` mirrors Task 4.1: `createScrape`, `getScrape`, `listScrapes`, `deleteScrape`, all scoped by `userId`, all throwing `OwnershipError` (404) on mismatch.

Write `src/queries/scrapes.test.ts` with the same four cases as `jobs.test.ts` — owner sees it, other user gets 404, list is scoped, delete rejects cross-user.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/queries/scrapes.test.ts src/storage/screenshots.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/queries/scrapes.ts src/queries/scrapes.test.ts src/storage/
git commit -m "feat(storage): add filesystem screenshot storage and scrape server functions"
```

**Done when:** 7 tests pass across both files, and the key layout matches the InsForge bucket.

### Task 4.3: Entitlement, plan, and profile server functions

**Files:**
- Create: `src/queries/entitlements.ts`
- Create: `src/queries/plans.ts`
- Create: `src/queries/profile.ts`
- Create: `src/queries/entitlements.test.ts`

**Interfaces:**
- Consumes: `db`, `schema` from Task 1.4
- Produces: `consumeQuota`, `refundQuota`, `getEntitlement`, `listPlans`, `updateProfile` — consumed by `worker/index.ts` and the pricing and profile routes

- [ ] **Step 1: Write the failing quota test**

`src/queries/entitlements.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { db, sql } from "~/db"
import { consumeQuota, refundQuota, getEntitlement } from "./entitlements"

const USER = "00000000-0000-0000-0000-00000000000c"

beforeEach(async () => {
  await db.execute(sql`truncate user_entitlements, plans restart identity cascade`)
  await db.execute(sql`
    insert into public.plans (id, name, credits_per_month, price_idr)
    values (gen_random_uuid(), 'free', 3, 0)
  `)
})

describe("quota", () => {
  it("consumes exactly one credit and never goes negative", async () => {
    for (let i = 0; i < 5; i++) {
      await consumeQuota({ userId: USER, jobId: null, amount: 1 }).catch(() => null)
    }
    const e = await getEntitlement({ userId: USER })
    expect(e.remaining).toBeGreaterThanOrEqual(0)
  })

  it("refunds what was consumed", async () => {
    const before = await getEntitlement({ userId: USER })
    await consumeQuota({ userId: USER, jobId: null, amount: 1 })
    const mid = await getEntitlement({ userId: USER })
    expect(mid.remaining).toBe(before.remaining - 1)
    await refundQuota({ userId: USER, jobId: null, amount: 1 })
    expect((await getEntitlement({ userId: USER })).remaining).toBe(before.remaining)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/queries/entitlements.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/queries/entitlements.ts` wraps the existing RPCs:

```ts
import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import { db } from "~/db"

export const consumeQuota = createServerFn({ method: "POST" })
  .inputValidator((i: { userId: string; jobId: string | null; amount: number }) => i)
  .handler(async ({ data }) => {
    const rows = await db.execute<{ ok: boolean; message: string | null }>(
      sql`select public.consume_quota(${data.userId}::uuid, ${data.jobId}::uuid, ${data.amount}::int) as ok, null::text as message`,
    )
    const r = rows[0]
    if (!r?.ok) throw new Error("QUOTA_EXCEEDED")
    return { ok: true }
  })

export const refundQuota = createServerFn({ method: "POST" })
  .inputValidator((i: { userId: string; jobId: string | null; amount: number }) => i)
  .handler(async ({ data }) => {
    await db.execute(
      sql`select public.refund_quota(${data.userId}::uuid, ${data.jobId}::uuid, ${data.amount}::int)`,
    )
    return { ok: true }
  })

export const getEntitlement = createServerFn({ method: "GET" })
  .inputValidator((i: { userId: string }) => i)
  .handler(async ({ data }) => {
    const rows = await db.execute<{ plan_name: string; remaining: number }>(
      sql`select * from public.get_user_entitlement(${data.userId}::uuid)`,
    )
    return rows[0] ?? { plan_name: "free", remaining: 0 }
  })
```

Confirm the real `consume_quota` signature from `migrations/0005` before finalising — the argument list must match the function definition exactly.

- [ ] **Step 4: Write `plans.ts` and `profile.ts`**

`listPlans` calls `public.list_plans()`. `updateProfile` updates the Better Auth `users` row by id, scoped to the session user.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/queries/entitlements.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/queries/entitlements.ts src/queries/plans.ts src/queries/profile.ts src/queries/entitlements.test.ts
git commit -m "feat(queries): add entitlement, plan, and profile server functions"
```

**Done when:** quota is consumed and refunded exactly, and the balance never goes negative.

### Task 4.4: Port the three HTTP routes

**Files:**
- Create: `src/routes/api/scrape.preview.ts`
- Create: `src/routes/api/scrape.asset.ts`
- Create: `src/routes/api/generations.$id.download.ts`
- Create: `src/routes/api/__tests__/http-routes.test.ts`
- Modify: `vite.config.ts` — or the Start server config

**Interfaces:**
- Consumes: `preview-html.ts`, `render-page.ts`, `fetch-html.ts` (preserved, unmodified); `OwnershipError` from Task 4.1
- Produces: three HTTP endpoints that cannot be server functions

- [ ] **Step 1: Write the failing authorisation test**

`src/routes/api/__tests__/http-routes.test.ts`:

```ts
import { describe, expect, it } from "vitest"

describe("HTTP route ownership", () => {
  it("returns 404 for a download owned by another user", async () => {
    const { GET } = await import("../generations.$id.download")
    const res = await GET({
      params: { id: "00000000-0000-0000-0000-0000000000ff" },
      request: new Request("http://localhost/api/x", { headers: userBHeaders() }),
    } as never)
    expect(res.status).toBe(404)
  })
})
```

Define `userBHeaders()` as a helper that mints a session cookie for user B via `auth.api.signInEmail` is not available (email is disabled) — instead insert a session row directly for a test user. Adjust the helper to the schema generated in Task 2.1.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/routes/api/__tests__/http-routes.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Port the preview route**

Recover the original from git and port the handler body unchanged:

```bash
git show HEAD~2:src/app/api/scrape/preview/route.ts
```

The response headers are load-bearing and must be preserved exactly:

```ts
const PREVIEW_CSP = [
  "sandbox allow-scripts",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ")
```

Plus `X-Frame-Options: SAMEORIGIN`. This is the stricter override referenced in spec §8.4.

- [ ] **Step 4: Port the asset proxy route**

Preserve `Access-Control-Allow-Origin: *` — the sandboxed `srcDoc` iframe has origin `null`, so without it every asset request fails. Also preserve `Cache-Control: public, max-age=3600` and the `rewriteCssUrls()` call so non-inlined stylesheets still resolve through the proxy.

- [ ] **Step 5: Port the download route**

Preserve `Content-Disposition: attachment` and the ownership check returning 404.

- [ ] **Step 6: Move the security headers from the deleted `next.config.ts`**

The headers captured in Task 3.1 Step 2 become the Start server config. These were application-wide in Next; in Start they belong in the server entry or a response hook applied to every route.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npx vitest run src/routes/api/__tests__/http-routes.test.ts
npm run typecheck
```

Expected: PASS and clean.

- [ ] **Step 8: Commit**

```bash
git add src/routes/api/ vite.config.ts
git commit -m "feat: port preview, asset proxy, and download routes with preserved CSP"
```

**Done when:** all three routes respond correctly, cross-user access returns 404, and the CSP headers are present in the response.

### Task 4.5: Add route error boundaries and security regression tests

**Files:**
- Modify: `src/routes/generations.$id.tsx`, `src/routes/history.tsx`, `src/routes/profile.tsx`, `src/routes/setting.tsx`, `src/routes/admin.tsx`, `src/routes/pricing.tsx`
- Create: `src/lib/__tests__/security-regression.test.ts`
- Create: `src/lib/__tests__/rate-limit.test.ts`

**Interfaces:**
- Consumes: the routes from Task 3.3, the HTTP routes from Task 4.4, the preserved `preview-html.ts` and `render-page.ts`
- Produces: per-route error boundaries (spec §8.3) and executable regression guards for the four preserved security behaviours (spec §8.4)

The Next.js application had no `error.tsx`, `not-found.tsx`, or `loading.tsx`. This task closes that gap rather than porting an absence forward.

- [ ] **Step 1: Write the failing rate-limit test**

`src/lib/__tests__/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { hitRateLimit } from "~/queries/rate-limit"

describe("rate limiting", () => {
  it("allows requests under the limit and then rejects", async () => {
    const key = `test:${Date.now()}`
    const results: boolean[] = []
    for (let i = 0; i < 5; i++) {
      results.push(await hitRateLimit({ data: { key, limit: 3, windowSeconds: 60 } }))
    }
    expect(results.filter(Boolean).length).toBe(3)
    expect(results.some((r) => !r)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it passes**

```bash
npx vitest run src/lib/__tests__/rate-limit.test.ts
```

Expected: PASS. The Postgres function already exists; this test proves the server-function wrapper passes arguments through correctly rather than silently defaulting.

- [ ] **Step 3: Write the security regression test**

`src/lib/__tests__/security-regression.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

describe("preserved security controls", () => {
  it("render-page.ts still pins DNS and filters inside the browser", () => {
    const src = readFileSync("src/lib/render-page.ts", "utf8")
    expect(src).toContain("context.route")
    expect(src).toMatch(/WebSocket|SharedWorker/)
    expect(src).toMatch(/169\.254|loopback|private/i)
  })

  it("preview-html.ts still strips the target's own CSP and base", () => {
    const src = readFileSync("src/lib/preview-html.ts", "utf8")
    expect(src).toMatch(/http-equiv=["']?content-security-policy/i)
    expect(src).toMatch(/<base/i)
  })

  it("the preview route keeps its sandbox CSP", () => {
    const src = readFileSync("src/routes/api/scrape.preview.ts", "utf8")
    expect(src).toContain("sandbox allow-scripts")
    expect(src).toContain("base-uri 'none'")
    expect(src).toContain("form-action 'none'")
  })

  it("the asset proxy keeps its null-origin CORS header", () => {
    const src = readFileSync("src/routes/api/scrape.asset.ts", "utf8")
    expect(src).toContain("Access-Control-Allow-Origin")
  })

  it("the payment claim stays scoped to a pending transaction", () => {
    const src = readFileSync("src/queries/entitlements.ts", "utf8")
    expect(src).toMatch(/status\s*=\s*'pending'/)
  })
})
```

The payment assertion may need to target a different file depending on where the Midtrans verification logic lands. Point it at whichever module performs the claim; the invariant is that the UPDATE is scoped to `status = 'pending'` so a replayed webhook cannot credit twice.

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/lib/__tests__/security-regression.test.ts
```

Expected: PASS. `render-page.ts`, `preview-html.ts`, and `fetch-html.ts` are preserved unmodified per spec §2, so these assertions confirm the strip did not damage them. If one fails, that file was edited during the migration — restore it.

- [ ] **Step 5: Add per-route error boundaries**

The Next.js application had no `error.tsx`. Add `errorComponent` to the six routes that can realistically fail — a missing job id, a failed Midtrans lookup, a database timeout:

```tsx
// src/components/route-error.tsx
import { createErrorComponent } from "@tanstack/react-router"

export const RouteError = createErrorComponent({
  error: ({ error }) => (
    <main>
      <h1>Terjadi kesalahan</h1>
      <p>{error.message}</p>
    </main>
  ),
  notFound: () => (
    <main>
      <h1>Tidak ditemukan</h1>
    </main>
  ),
})
```

Wire it into `generations.$id.tsx`, `history.tsx`, `profile.tsx`, `setting.tsx`, `admin.tsx`, and `pricing.tsx`. `/pricing` matters specifically because it depends on a Midtrans `order_id` search param that may be absent.

- [ ] **Step 6: Add a not-found route**

```tsx
// src/routes/__not-found.tsx
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/__not-found")({
  component: () => (
    <main>
      <h1>404 — Halaman tidak ditemukan</h1>
    </main>
  ),
})
```

- [ ] **Step 7: Verify the full suite and type check**

```bash
npx vitest run
npm run typecheck
```

Expected: green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add route error boundaries and security regression tests"
```

**Done when:** the six routes have error boundaries, a not-found route exists, and both new suites pass. The four preserved security controls are now guarded by executable assertions rather than by comment.

---

## Phase 5 — Data layer

### Task 5.1: Add TanStack Query option factories

**Files:**
- Create: `src/lib/queries/job.ts`
- Create: `src/lib/queries/scrape.ts`
- Create: `src/lib/queries/plans.ts`
- Create: `src/lib/queries/job.test.ts`

**Interfaces:**
- Consumes: the server functions from Tasks 4.1 through 4.3
- Produces: `jobQueryOptions`, `scrapeQueryOptions`, `plansQueryOptions` — consumed by Task 5.2 and the routes in Task 3.3

- [ ] **Step 1: Write the failing test**

`src/lib/queries/job.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { jobQueryOptions } from "./job"

describe("jobQueryOptions", () => {
  it("polls while the job is in flight", () => {
    const opts = jobQueryOptions("job-1")
    const interval = opts.refetchInterval as (q: { state: { data: { status: string } } }) => number | false
    expect(interval({ state: { data: { status: "queued" } } })).toBe(2500)
    expect(interval({ state: { data: { status: "generating" } } })).toBe(2500)
  })

  it("stops polling on a terminal status", () => {
    const opts = jobQueryOptions("job-1")
    const interval = opts.refetchInterval as (q: { state: { data: { status: string } } }) => number | false
    expect(interval({ state: { data: { status: "completed" } } })).toBe(false)
    expect(interval({ state: { data: { status: "failed" } } })).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/lib/queries/job.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the option factories**

`src/lib/queries/job.ts`:

```ts
import { queryOptions } from "@tanstack/react-query"
import { getOwnedJob } from "~/queries/jobs"

const TERMINAL = new Set(["completed", "failed"])

export function jobQueryOptions(jobId: string, userId: string) {
  return queryOptions({
    queryKey: ["job", jobId],
    queryFn: () => getOwnedJob({ data: { jobId, userId } }),
    refetchInterval: (query) => {
      const status = (query.state.data as { status?: string } | undefined)?.status
      return status && TERMINAL.has(status) ? false : 2500
    },
  })
}
```

The terminal-status check replaces the hand-rolled stop condition in the current `generation-result.tsx`.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/queries/job.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Write the scrape and plan factories**

`scrapeQueryOptions(scrapeId, userId)` and `plansQueryOptions()` follow the same shape. Plans needs no polling.

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/
git commit -m "feat(query): add TanStack Query option factories with terminal-status polling"
```

**Done when:** polling stops automatically on `completed` and `failed`, proven by test.

### Task 5.2: Collapse the polling components

**Files:**
- Modify: `src/components/generation-result.tsx`
- Modify: `src/components/history-list.tsx`
- Modify: `src/components/scrape-detail.tsx`
- Create: `src/components/__tests__/polling.test.tsx`

**Interfaces:**
- Consumes: the query factories from Task 5.1
- Produces: components with no manual polling, no `AbortController`, no effect-driven interval

- [ ] **Step 1: Write the failing test**

`src/components/__tests__/polling.test.tsx`:

```tsx
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const SOURCES = [
  "src/components/generation-result.tsx",
  "src/components/history-list.tsx",
  "src/components/scrape-detail.tsx",
]

describe("polling components", () => {
  it("contain no manual AbortController", () => {
    for (const f of SOURCES) {
      expect(readFileSync(f, "utf8")).not.toContain("AbortController")
    }
  })

  it("contain no manual setInterval", () => {
    for (const f of SOURCES) {
      expect(readFileSync(f, "utf8")).not.toMatch(/setInterval/)
    }
  })
})
```

A source-level assertion is the honest test here. These components' behaviour is "poll until terminal", which the option factories already own; asserting on the component's internals is what actually prevents the hand-rolled pattern from creeping back.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/components/__tests__/polling.test.tsx
```

Expected: FAIL — the components still contain `AbortController` and `setInterval`.

- [ ] **Step 3: Rewrite `generation-result.tsx`**

Replace the polling effect, the `AbortController`, and the three-sample ETA `useRef` with:

```tsx
const { data: job } = useQuery(jobQueryOptions(id, userId))

const progress = job?.progress ?? 0
const stage = deriveStage(job?.status)
```

Keep the copy-to-clipboard, download button, and stage-stepped progress bar. Delete the `const collapsed = false` dead branch.

- [ ] **Step 4: Rewrite `history-list.tsx` and `scrape-detail.tsx`**

Same substitution. `scrape-detail.tsx` keeps its `URL.createObjectURL` Blob-and-iframe rendering for the artifact; only the fetching changes.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/components/__tests__/polling.test.tsx
npx vitest run
npm run typecheck
```

Expected: PASS, all suites green, type check clean.

- [ ] **Step 6: Compare line counts**

```bash
(Get-Content src/components/generation-result.tsx).Count
```

Expected: substantially below 435. Record the figure in the commit body.

- [ ] **Step 7: Commit**

```bash
git add src/components/
git commit -m "refactor(components): replace manual polling with TanStack Query"
```

**Done when:** no component manages an interval or an `AbortController`, and the full suite passes.

---

## Phase 6 — InsForge removal

### Task 6.1: Delete the InsForge and Apify code paths

**Files:**
- Delete: `src/lib/insforge-core.ts`, `src/lib/insforge.ts`, `src/lib/insforge-server.ts`, `src/lib/dal.ts`, `src/lib/rate-limit.ts`, `src/lib/apify.ts`, `src/lib/history.ts`
- Modify: `worker/index.ts`
- Modify: `src/components/home-generator.tsx`
- Modify: `src/lib/ai-provider.ts` if it imports anything InsForge-related
- Create: `worker/db.ts`

**Interfaces:**
- Consumes: `claimNextJob` and the scrape functions from Phase 4
- Produces: a worker that talks to PostgreSQL directly; a codebase with zero InsForge references

- [ ] **Step 1: Inventory every remaining reference**

```bash
Select-String -Path src/**/*.ts,src/**/*.tsx,worker/**/*.ts,scripts/*.js -Pattern "insforge|apify|INSFORGE|APIFY" -CaseSensitive:$false
```

Expected: a finite list. Every hit is either deleted or rewritten in the following steps.

- [ ] **Step 2: Delete the InsForge data-layer modules**

```bash
Remove-Item -Force src/lib/insforge-core.ts, src/lib/insforge.ts, src/lib/insforge-server.ts, src/lib/rate-limit.ts, src/lib/apify.ts
```

`src/lib/dal.ts` is deleted too — its `getUser`/`requireUser`/`requireAdmin`/`getOwnedScrape` logic moves to `src/auth/middleware.ts` and `src/queries/`. Do not delete it until Tasks 4.1 through 4.3 have landed their replacements.

- [ ] **Step 3: Port the worker to Drizzle**

`worker/index.ts` keeps its structure: the infinite loop, `claimNextJob`, `processJob`, the Playwright crawl, the LLM call, the adaptive backoff, and the `GET /health` server on `PORT` 8080.

Every call that went through `insforge-core.ts` becomes a direct Drizzle call or a server-function import. The `timedFetch` error normalizer disappears — it existed only to work around Next's error shape.

The `uploadScreenshot` call becomes:

```ts
import { writeScreenshot } from "../src/storage/screenshots"
const { key, url } = await writeScreenshot(job.id, pageIndex, pngBuffer)
```

- [ ] **Step 4: Delete the Apify branch from the scrape handler**

The old handler branched on `!process.env.VERCEL`. Delete the Apify path, the raw-HTTP fallback, and the `capture_mode` divergence. Playwright becomes the only crawler, which resolves F5 and the environment-dependent behaviour described in `docs/PRD_Scrape_Preview_Attempt_Consistency.md`.

- [ ] **Step 5: Verify no InsForge reference survives**

```bash
Select-String -Path src/**/*.ts,src/**/*.tsx,worker/**/*.ts,scripts/*.js,package.json -Pattern "insforge|apify" -CaseSensitive:$false
npm ls @insforge/sdk apify-client
```

Expected: no source matches, and npm reports neither package.

- [ ] **Step 6: Remove the InsForge env vars from `.env.example`**

Delete `INSFORGE_URL`, `INSFORGE_API_KEY`, and `ADMIN_TOKEN` (already unused). Keep `AI_*`, `MIDTRANS_*`, `WORKER_POLL_MS`, `MAX_PAGES`, `ADMIN_EMAILS`, `APP_URL`. Add `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SCREENSHOT_DIR`.

- [ ] **Step 7: Verify the worker boots against the local database**

```bash
npm run worker
```

Expected: the health endpoint responds and the loop polls without error.

- [ ] **Step 8: Run the full suite and type check**

```bash
npx vitest run
npm run typecheck
```

Expected: green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove InsForge and Apify, port worker to Drizzle"
```

**Done when:** no InsForge or Apify reference exists anywhere, the worker polls the local database, and the suite is green.

### Task 6.2: Update scripts and documentation, then run the zero-trace gate

**Files:**
- Modify: `scripts/dev.js`
- Modify: `README.md`
- Modify: `.env.example`
- Create: `docs/superpowers/plans/2026-09-26-docrivo-stack-migration-design.md` — pointer only

**Interfaces:**
- Consumes: everything from Tasks 1 through 6
- Produces: the verified zero-trace state

- [ ] **Step 1: Rewrite `scripts/dev.js`**

It must still spawn both processes, drop the `next dev --webpack` invocation, and keep the Windows port cleanup that stops stale listeners:

```js
spawn("npx", ["tsx", "watch", "worker/index.ts"], { stdio: "inherit", shell: true })
spawn("npm", ["run", "dev:web"], { stdio: "inherit", shell: true })
```

The `--webpack` flag is deleted along with Next. Its reason — Windows Application Control blocking the native SWC binary — does not apply to Vite.

- [ ] **Step 2: Verify a clean start**

```bash
npm run dev
```

Expected: the worker and the web app both start; `http://localhost:3000` serves.

- [ ] **Step 3: Rewrite the README**

Fix the F7 inaccuracies while documenting the new stack. The current README is wrong about the API surface, the auth method, rate limiting, and the admin guard. Replace the tech-stack section with the versions from spec §2.4, and document the local Postgres setup, the Google OAuth client, and the two-process architecture.

- [ ] **Step 4: Run the full zero-trace gate**

```bash
npm ls next next-rsc eslint-config-next @insforge/sdk apify-client 2>&1
Select-String -Path src/**/*.ts,src/**/*.tsx,worker/**/*.ts,vite.config.ts,drizzle.config.ts,tsconfig.json,package.json -Pattern "next/|next\.config|from ['\"]next|insforge|apify" -CaseSensitive:$false -ErrorAction SilentlyContinue
Test-Path .next
Test-Path next.config.ts
```

Expected: all four checks clean. This is the gate from spec §2.5, run for the second time after the InsForge removal.

- [ ] **Step 5: Run everything**

```bash
npx vitest run
npm run typecheck
npm run lint
npm run build
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: rewrite README for the new stack and pass the zero-trace gate"
```

**Done when:** the four zero-trace checks are clean and every verification command passes.

---

## Phase 7 — Performance defects

### Task 7.1: Add lease expiry and bounded concurrency

**Files:**
- Create: `migrations/0009_job_lease.sql`
- Modify: `migrations/0002_claim_next_job.sql` — the function body
- Modify: `worker/index.ts`
- Create: `worker/lease.test.ts`

**Interfaces:**
- Consumes: `claimNextJob` from Task 4.1
- Produces: `reclaimExpiredJobs`, a concurrency setting, and a worker that processes N jobs in parallel

- [ ] **Step 1: Write the failing test**

`worker/lease.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { db, sql } from "~/db"
import { createGeneration } from "~/queries/jobs"

const USER = "00000000-0000-0000-0000-00000000000d"

beforeEach(async () => {
  await db.execute(sql`truncate generation_jobs restart identity cascade`)
})

describe("job leases", () => {
  it("reclaims a job whose lease expired", async () => {
    const job = await createGeneration({
      userId: USER, sourceUrl: "https://x.com", normalizedDomain: "x.com",
    })
    await db.execute(sql`update generation_jobs set status='running' where id=${job.id}`)
    await db.execute(
      sql`update generation_jobs set lease_expires_at = now() - interval '1 minute' where id=${job.id}`,
    )
    const reclaimed = await db.execute<{ id: string }>(
      sql`select id from public.claim_next_job()`,
    )
    expect(reclaimed[0]?.id).toBe(job.id)
  })

  it("does not reclaim a job whose lease is still valid", async () => {
    const job = await createGeneration({
      userId: USER, sourceUrl: "https://y.com", normalizedDomain: "y.com",
    })
    await db.execute(sql`update generation_jobs set status='running' where id=${job.id}`)
    await db.execute(
      sql`update generation_jobs set lease_expires_at = now() + interval '5 minutes' where id=${job.id}`,
    )
    const claimed = await db.execute<{ id: string }>(
      sql`select id from public.claim_next_job()`,
    )
    expect(claimed[0]?.id).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run worker/lease.test.ts
```

Expected: FAIL — `lease_expires_at` does not exist.

- [ ] **Step 3: Add the migration**

`migrations/0009_job_lease.sql`:

```sql
alter table public.generation_jobs add column if not exists lease_expires_at timestamptz;
create index if not exists generation_jobs_lease_idx
  on public.generation_jobs (lease_expires_at)
  where status = 'running';
```

- [ ] **Step 4: Rewrite `claim_next_job` to honour leases**

The function must treat a `running` job with an expired lease as claimable, and a `running` job with a live lease as not claimable. Read the current body first:

```bash
Select-String -Path migrations/0002_claim_next_job.sql -Pattern "for update" -Context 5,10
```

Preserve the `for update skip locked` semantics verified in Task 1.3 Step 6 — that is what makes concurrent claims safe.

- [ ] **Step 5: Apply and run the test**

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo_test -w -v ON_ERROR_STOP=1 -f migrations/0009_job_lease.sql
npx vitest run worker/lease.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 6: Add bounded concurrency to the worker**

Replace the single-job loop with a bounded pool. The bound comes from an environment variable, not a hardcoded number, because the correct value depends on measured memory headroom with Chromium resident (spec §13 item 2):

```ts
const CONCURRENCY = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 1))
```

Each in-flight job sets `lease_expires_at` to now plus a heartbeat interval, refreshed by the existing `withHeartbeat` mechanism.

- [ ] **Step 7: Run the full suite**

```bash
npx vitest run
```

Expected: green, including the Task 4.1 concurrent-claim test.

- [ ] **Step 8: Commit**

```bash
git add migrations/0009_job_lease.sql migrations/0002_claim_next_job.sql worker/
git commit -m "feat(worker): add job lease expiry and bounded concurrency"
```

**Done when:** an expired lease is reclaimed, a live lease is not, and the worker runs N jobs in parallel.

### Task 7.2: Add the retention job

**Files:**
- Create: `migrations/0010_retention.sql`
- Create: `worker/retention.ts`
- Create: `worker/retention.test.ts`

**Interfaces:**
- Consumes: the local database
- Produces: `runRetention()`, invoked from the worker loop

- [ ] **Step 1: Write the failing test**

`worker/retention.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { db, sql } from "~/db"
import { runRetention } from "./retention"

describe("retention", () => {
  it("deletes artifacts older than the threshold and keeps recent ones", async () => {
    await db.execute(sql`truncate scrape_artifacts cascade`)
    await db.execute(sql`
      insert into public.scrape_artifacts (id, user_id, source_url, html, created_at)
      values (gen_random_uuid(), gen_random_uuid(), 'https://old.com', '<html></html>', now() - interval '40 days'),
             (gen_random_uuid(), gen_random_uuid(), 'https://new.com', '<html></html>', now() - interval '1 day')
    `)
    const removed = await runRetention({ artifactDays: 30, documentDays: 3650 })
    expect(removed.artifacts).toBe(1)
    const remaining = await db.execute<{ source_url: string }>(
      sql`select source_url from public.scrape_artifacts`,
    )
    expect(remaining).toHaveLength(1)
    expect(remaining[0].source_url).toBe("https://new.com")
  })
})
```

Adjust the insert column list to the `scrape_artifacts` definition recovered in Task 0.1 Step 6.

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run worker/retention.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`worker/retention.ts`:

```ts
import { sql } from "drizzle-orm"
import { db } from "~/db"

export async function runRetention(opts: { artifactDays: number; documentDays: number }) {
  const artifacts = await db.execute(sql`
    delete from public.scrape_artifacts
    where created_at < now() - make_interval(days => ${opts.artifactDays})
  `)
  const documents = await db.execute(sql`
    delete from public.generated_documents
    where created_at < now() - make_interval(days => ${opts.documentDays})
  `)
  return {
    artifacts: artifacts.rowCount ?? 0,
    documents: documents.rowCount ?? 0,
  }
}
```

Documents use a deliberately long default. A generated `DESIGN.md` is the user's purchased output; deleting it silently would destroy paid-for work. This threshold is spec §13 item 1 and needs a product decision before the value is lowered.

- [ ] **Step 4: Wire it into the worker loop**

Run once per hour, guarded by a timestamp so a restart does not re-trigger it:

```ts
const RETENTION_INTERVAL_MS = 60 * 60 * 1000
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run worker/retention.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/retention.ts worker/retention.test.ts migrations/0010_retention.sql
git commit -m "feat(worker): add retention job for artifacts and documents"
```

**Done when:** old artifacts are pruned, recent ones are kept, and generated documents are not deleted at a threshold that would destroy paid output.

### Task 7.3: Verify the per-request session cost

**Files:**
- Modify: `src/routes/__root.tsx`
- Create: `src/routes/__root.test.ts`

**Interfaces:**
- Consumes: `resolveSession` from Task 2.2
- Produces: a confirmed resolution of F3

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, it, vi } from "vitest"

describe("root loader session cost", () => {
  it("resolves the session once per request", async () => {
    const spy = vi.fn(async () => null)
    vi.doMock("~/auth/middleware", () => ({ resolveSession: spy }))
    const { Route } = await import("./__root")
    await Route.options.loader?.({ request: new Request("http://localhost/") } as never)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run it to verify the current behaviour**

```bash
npx vitest run src/routes/__root.test.ts
```

Expected: the assertion reveals how many times the session is resolved. If more than once, move the call into the root loader so it runs exactly once and the loader's data is inherited by child routes.

- [ ] **Step 3: Move session resolution into the root loader**

```ts
export const Route = createRootRoute({
  head: () => ({ /* unchanged */ }),
  loader: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions())
    return { session }
  },
  shellComponent: RootDocument,
})
```

Child routes read the session from the parent loader rather than re-resolving it.

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/routes/__root.test.ts
```

Expected: PASS — resolved exactly once.

- [ ] **Step 5: Commit**

```bash
git add src/routes/__root.tsx src/routes/__root.test.ts
git commit -m "perf(auth): resolve session once per request in the root loader"
```

**Done when:** the session is resolved exactly once per request. F3 closed.

---

## Phase 8 — Data import

### Task 8.1: Import production data and reconcile

**Files:**
- Modify: `backup/row-counts-before.json` (gitignored)
- Create: `docs/migration/local-cutover.md` (gitignored)

**Interfaces:**
- Consumes: `backup/pre-migration-full.sql`, `backup/row-counts-before.json`, `backup/identity-reference.json`, `backup/scrape-artifacts-ddl.sql`
- Produces: a local database holding production data, verified row for row

- [ ] **Step 1: Apply the production data to a clean database**

Drop and recreate so the import is not layered on top of test residue:

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d postgres -w -c "drop database if exists docrivo"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -d postgres -w -c "create database docrivo owner docrivo"
```

Apply the baseline, then the dump:

```bash
foreach ($f in (Get-ChildItem migrations -Filter "0*.sql" | Sort-Object Name)) {
  & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -v ON_ERROR_STOP=1 -f $f.FullName
}
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -v ON_ERROR_STOP=1 -f backup/pre-migration-full.sql
```

**This destroys the current `docrivo` database.** It contains only test fixtures at this point. If that is not true, stop and re-verify.

- [ ] **Step 2: Handle the user-id collision**

The dump's `users` reference `auth.users`, which no longer exists, and the Better Auth `users` table has different columns than the InsForge one. The import likely fails on `generation_jobs.user_id`.

Reconcile explicitly rather than forcing it:

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -c "\d public.users"
```

Expect the Better Auth shape. The InsForge user ids do not carry over, so existing rows reference users that no longer exist locally. Decide per table whether to null the orphaned `user_id` or to insert placeholder `users` rows preserving the original ids. Record the decision in `backup/row-counts-before.json` under a `user_id_policy` key and apply it.

This is a genuine consequence of leaving InsForge: **user identities do not migrate.** Google sign-in will issue new ids, so every existing job, scrape, entitlement, and payment record becomes ownerless until reassigned. It is recorded here rather than discovered during the import.

- [ ] **Step 3: Reconcile row counts against the recorded baseline**

```bash
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -t -A -c "select relname, n_live_tup from pg_stat_user_tables where schemaname='public' order by relname"
Get-Content backup/row-counts-before.json
```

The local counts must match `backup/row-counts-before.json`, which Task 0.1
recorded from the dump. The verified baseline is: `generation_jobs` 50,
`crawled_pages` 118, `extracted_assets` 1820, `design_extractions` 23,
`generated_documents` 22, `job_logs` 113, `rate_limits` 36, `scrape_artifacts` 0,
`plans` 4, `user_entitlements` 2, `payment_transactions` 3 — total 2191.

Every table must match, or the difference must be explained in writing. A
`null` in the baseline means the table had no `COPY` block at all, which is
different from a table with zero rows.

- [ ] **Step 4: Confirm the screenshot disposition is already settled**

Do not decide anything here. Task 0.1 settled it: `storage.objects` has zero rows
and no `bytea`/content column, so the dump never contained screenshot bytes, and
`scrape_artifacts` has zero rows. There is no screenshot history to import.

Verify the decision survived into the baseline file and move on:

```bash
(Get-Content backup/row-counts-before.json -Raw | ConvertFrom-Json).screenshots
```

Expected: a value recording that there are no screenshots to migrate. If the key
is missing, add it rather than re-opening the question.

- [ ] **Step 5: Verify the application runs on imported data**

```bash
npm run dev
```

Expected: the app starts. Public pages render. Authenticated pages redirect to login, because no local session exists for the old InsForge users.

- [ ] **Step 6: Reconcile the user set against the identity reference**

```bash
Get-Content backup/identity-reference.json
```

The reference holds 2 pre-migration users, identified by id and email **domain**
only. Confirm each has a corresponding row in the new `users` table, or has
been explicitly recorded as unlinked. A user silently missing from both lists is
a defect.

- [ ] **Step 7: Delete the plaintext production data**

`backup/pre-migration-full.sql` is 1.7 MB and contains user email addresses,
password hashes, payment transaction records, audit-log IP addresses, and
encrypted compute environment blobs in plaintext. It is gitignored, but it is
sitting in a working tree, and the source `.sql.gz` remains in the user's
Downloads folder.

Once the reconciliation above has passed and the data is confirmed imported, the
working copies are redundant:

```bash
Remove-Item -Recurse -Force backup/
Test-Path backup/
```

Expected: `False`. Confirm the row counts were reconciled **before** deleting —
after this step the baseline is gone and cannot be re-derived without the
Downloads file.

Leave the source `C:\Users\alghi\Downloads\20260721_021743.sql.gz` in place; it
is the user's file and removing it is their call, not this task's.

- [ ] **Step 8: Commit nothing**

The database is not in the repository. Record the reconciliation outcome in `docs/migration/local-cutover.md` (gitignored) and, if the reconciliation revealed a schema defect, fix the migration in a follow-up commit.

**Done when:** every table's row count matches `backup/row-counts-before.json`; the user-id policy is recorded under a `user_id_policy` key and applied; the screenshot disposition is confirmed settled rather than re-opened; both pre-migration users are accounted for; and `backup/` has been deleted so no plaintext production data remains in the worktree.

---

## Appendix A — Commands reference

```bash
# zero-trace gate (spec 2.5)
npm ls next next-rsc eslint-config-next @insforge/sdk apify-client
Select-String -Path src/**/*.ts,worker/**/*.ts,package.json -Pattern "next/|insforge|apify" -CaseSensitive:$false
Test-Path .next
Test-Path next.config.ts

# verification
npx vitest run
npm run typecheck
npm run lint
npm run build

# database
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -c "\dt public.*"
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U docrivo -d docrivo -w -c "select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public';"
```

## Appendix B — Commits

One commit per task, in order:

```
chore: gitignore backup dumps and local screenshot storage
chore: install TanStack Start, Drizzle, Better Auth, and Vite at pinned versions
refactor(db): derive cleaned migration baseline without InsForge auth dependencies
feat(db): add Drizzle schema and client for local PostgreSQL
feat(auth): add Better Auth with Google-only sign-in and UUID user ids
feat(auth): add session middleware and admin email allowlist
feat(auth): port open-redirect guard for post-login navigation
refactor: strip Next.js application, preserving pure-logic modules
feat: scaffold TanStack Start with Vite, Tailwind v4, and TanStack Query
feat: port all 15 routes and 17 components to TanStack Start
feat(queries): add job server functions with 404 ownership semantics
feat(storage): add filesystem screenshot storage and scrape server functions
feat(queries): add entitlement, plan, and profile server functions
feat: port preview, asset proxy, and download routes with preserved CSP
feat: add route error boundaries and security regression tests
feat(query): add TanStack Query option factories with terminal-status polling
refactor(components): replace manual polling with TanStack Query
refactor: remove InsForge and Apify, port worker to Drizzle
docs: rewrite README for the new stack and pass the zero-trace gate
feat(worker): add job lease expiry and bounded concurrency
feat(worker): add retention job for artifacts and documents
perf(auth): resolve session once per request in the root loader
```
