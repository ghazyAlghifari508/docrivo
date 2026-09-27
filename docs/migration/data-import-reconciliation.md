# Data import reconciliation

Task 8.1 loaded the InsForge production data into the local `docrivo` database and
then deleted `backup/`, the directory holding that data in plaintext. This file is
the surviving record of what was imported and how it was verified.

It contains no user email addresses, no user ids, no password material and no
secrets. Counts and structural facts only.

## Why this exists

`backup/pre-migration-full.sql` was a 1.7 MB `pg_dump` in COPY format holding
production email addresses, password hashes, payment transaction records, audit-log
IP addresses and encrypted platform blobs. It was gitignored, but it sat in a
working tree. The row counts it recorded lived in `backup/row-counts-before.json`
next to it, so deleting `backup/` destroyed the evidence along with the data.

The expectation therefore also lives in `scripts/reconcile-import.mjs`, as a
committed constant, and the check is re-runnable:

```bash
npm run reconcile:import
```

It exits non-zero on any failure, so it works as a gate. It reads `DATABASE_URL`,
like the application.

## User-id policy: keep the original ids

Both pre-migration user ids are well-formed 8-4-4-4-12 UUIDs, and Better Auth's
`users.id` is `uuid`. So no remapping and no placeholder users were needed: the
original ids were inserted as-is, and every `user_id uuid` foreign key across the
application tables carries over unchanged.

Column mapping for the two users: `email` → `email`, `created_at` → `created_at`,
`updated_at` → `updated_at`, `name` synthesised from the local part of the email
(the new column is `not null`), `image` left null, and `email_verified` copied from
the old flag.

`email_verified` is load-bearing, not cosmetic. Better Auth's
`accountLinking.requireLocalEmailVerified` defaults to `true`, so a Google sign-in
that matches an existing email is only linked implicitly when the *local* row is
email-verified. Had the flag been imported as `false`, the first sign-in for both
accounts would have been rejected, a new user id issued, and every job,
entitlement and payment for those accounts orphaned. Both rows imported as `true`.

One consequence is that the InsForge `password` column is not carried over. It
held a 2-character non-bcrypt placeholder, identical for both accounts, so no
usable password existed on InsForge either — and the new stack sets
`emailAndPassword.enabled = false` (`src/auth/server.ts:20`), which means there is
no password sign-in path to carry it into. Google is the only provider before and
after the migration. See the README's known-differences section.

## Row counts

Recorded from the dump before import; measured from the database after. The dump
holds one COPY block per table and no INSERT statements, so the "before" column is
exact rather than an estimate. All eleven tables matched on the first attempt.

| Table | Before (production) | After (local) | |
|---|---|---|---|
| `generation_jobs` | 50 | 50 | match |
| `crawled_pages` | 118 | 118 | match |
| `extracted_assets` | 1820 | 1820 | match |
| `design_extractions` | 23 | 23 | match |
| `generated_documents` | 22 | 22 | match |
| `job_logs` | 113 | 113 | match |
| `rate_limits` | 36 | 36 | match |
| `scrape_artifacts` | 0 | 0 | match |
| `plans` | 4 | 4 | match |
| `user_entitlements` | 2 | 2 | match |
| `payment_transactions` | 3 | 3 | match |
| **total** | **2191** | **2191** | match |

Nothing did not reconcile.

`plans` was upserted rather than copied. The four rows already present came from
`migrations/0005_entitlements_and_payments.sql` and are byte-identical to the four
in the dump, so the upsert was a no-op and the count stayed at 4 with no
duplicates.

`scrape_artifacts` is 0 on both sides because the table was empty in production,
not because rows were lost. The dump's `storage.objects` block is likewise empty
and that table has no content column, so there were never any screenshot bytes to
carry either. That disposition was settled in Task 0.1 and confirmed here, not
re-opened.

Many imported rows have a null `user_id` — 44 of the 50 jobs, 100 of the 118
pages, 1490 of the 1820 assets, and so on. These are `\N` in the dump: jobs
created before the app required sign-in. They are preserved faithfully and are not
an import defect, which is why the reference check treats a null owner as legal
and only fails on a non-null owner that resolves to nothing.

## Reference integrity

Counts matching is not an import if the rows are unusable, so every reference path
was checked. Zero dangling rows, across 4310 references:

| Reference | References | Dangling |
|---|---|---|
| `user_id` → `users` (9 tables) | 383 | 0 |
| `job_id` → `generation_jobs` (5 tables) | 2096 | 0 |
| `page_id` → `crawled_pages` | 1820 | 0 |
| `retry_of` → `generation_jobs` | 6 | 0 |
| `plan` → `plans` | 5 | 0 |

Both pre-migration users are present in `users` with distinct emails, both
`email_verified`, both with a name. `account`, `session` and `verification` are
correctly empty: no sessions survive a provider change, and account links are
re-established on first sign-in.

### The `trg_sync_user_id` trigger

`job_logs`, `crawled_pages`, `extracted_assets`, `design_extractions` and
`generated_documents` each carry a `BEFORE INSERT` trigger that overwrites
`user_id` with the parent job's. It fired during the import, so it could have
silently rewritten production values.

It changed nothing. In all 2098 child rows the stored `user_id` was already equal
to the parent job's, and after the import `child.user_id IS DISTINCT FROM
job.user_id` still holds on 0 of 2098 rows.

## Negative controls

A check that has only ever reported success has not been tested. Three deliberate
discrepancies, each caught:

1. **Dangling reference.** Inside a transaction that was rolled back, one
   `user_entitlements` row was replaced with one pointing at a `user_id` that
   matches no user, keeping the row count identical so only the reference check
   could fire. It reported 1 dangling of 2; after rollback, 0 of 2.
2. **Count discrepancy.** One extra `job_logs` row was inserted. The reconciler
   reported `job_logs = 113 -- found 114` and `total = 2191 -- found 2192` and
   exited 1. The row was deleted and the reconciler returned to exit 0.
3. **Un-imported database.** The same script pointed at `docrivo_test`, which was
   never imported, reported 12 failures and exited 1.

Two earlier versions of control 1 were wrong and are recorded because a control
that silently proves nothing is worse than none. The first omitted the
`where user_id is not null` predicate, so it counted the 101 legal null owners as
dangling. The second planted the orphan in `job_logs`, where `trg_sync_user_id`
overwrote the planted value from the parent job. Both reported 0 or an
uninterpretable number instead of the expected 1.

## What could not be carried over

| Source | Rows | Why |
|---|---|---|
| `auth.users.password` | 2 | InsForge's hash format, not Better Auth's, and no usable password existed. No password sign-in path exists in the new stack. |
| `auth.users.profile` | 2 | Held a display name and avatar URL. Not mapped: `name` is synthesised from the email local part and `image` stays null. `accountLinking.updateUserInfoOnLink` defaults to `false`, so Better Auth will not backfill them on first sign-in. |
| `auth.user_providers` | 2 | InsForge's OAuth link table. Better Auth's `account` has a different shape; links are re-created by implicit linking on first Google sign-in. |
| `auth.oauth_configs` | 2 | InsForge-side Google credentials. The new stack reads `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` from `.env.local`. The callback URI changed from InsForge's to `/api/auth/callback/google`, so the Google Cloud Console entry needs updating. |
| `auth.config` | 1 | InsForge auth settings. Better Auth is configured in code (`src/auth/server.ts`). |
| `system.secrets` | 8 | InsForge-encrypted secrets. The new stack reads `.env.local`. |
| `system.audit_logs` | 308 | InsForge platform audit trail with no counterpart table. |
| `system.mcp_usage` | 349 | InsForge MCP usage telemetry. No counterpart. |
| `cron.job_run_details` | 386 | InsForge scheduler history. No counterpart. |
| `deployments.files` | 243 | InsForge deployment artifacts. No counterpart. |
| `email.templates` | 4 | InsForge email templates. The new stack sends no templated email. |
| `compute.services` | 1 | InsForge container service, including an encrypted env blob. The new stack runs as a local process. |
| `storage.objects` | 0 | Empty in production, and the table has no content column, so no screenshot bytes existed. |

Every `public.*` table in the dump was imported. Nothing in the dump was silently
skipped.

## Deletion

`backup/` was deleted only after the counts above reconciled and the reference
check passed. `backup/pre-migration-full.sql` held password hashes, email
addresses, payment records and audit IP addresses in plaintext.

The source `C:\Users\alghi\Downloads\20260721_021743.sql.gz` is the user's own
file and was deliberately left in place; removing it is their call.
