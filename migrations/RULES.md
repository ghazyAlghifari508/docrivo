# Cleaned migration baseline

Derived from the 13 InsForge-era migration files. The originals remain in git
history. This baseline exists because those files depend on InsForge
infrastructure that a stock PostgreSQL instance does not provide.

Ordered `0001`..`0008`. Applies cleanly to an empty database. The only
prerequisite is that `public` exists and the applying role may create objects
in it.

## Removed

- All `create policy` / `drop policy` statements, and all
  `alter table ... enable|force row level security`. They reference
  `auth.uid()` or the InsForge roles `anon` / `authenticated`, none of which
  exist outside InsForge.
- All `grant` / `revoke` targeting `anon` or `authenticated` (10 statements).
  Neither role exists outside InsForge, so each statement errored.
- Three migrations dropped in full because every line in them was an RLS
  statement: `20260706072000_explicit-deny-rls-policies.sql`,
  `20260710133821_optimize-rls-policy-performance.sql`, and the policy sections
  of `20260706070500_rls-and-fk-indexes.sql` and
  `20260710132820_fix-rls-ownership-policies.sql`.

Row-level security is not re-created here. It is re-derived against Better Auth
session claims in a later task, once there is a `current_setting`-based
substitute for `auth.uid()` to write policies against.

## Deferred

- **Deferred:** nine foreign keys referencing `auth.users(id)` are dropped from
  the baseline and re-added in migration `0011_user_fks.sql`, which Task 2.1
  creates after Better Auth has made `public.users` exist:

  | Constraint (auto-generated name)                | Column                          |
  | ----------------------------------------------- | ------------------------------- |
  | `generation_jobs_user_id_fkey`                    | `generation_jobs.user_id`       |
  | `crawled_pages_user_id_fkey`                      | `crawled_pages.user_id`         |
  | `design_extractions_user_id_fkey`                 | `design_extractions.user_id`    |
  | `extracted_assets_user_id_fkey`                   | `extracted_assets.user_id`      |
  | `generated_documents_user_id_fkey`                | `generated_documents.user_id`   |
  | `job_logs_user_id_fkey`                           | `job_logs.user_id`              |
  | `user_entitlements_user_id_fkey`                  | `user_entitlements.user_id`     |
  | `payment_transactions_user_id_fkey`               | `payment_transactions.user_id`  |
  | `scrape_artifacts_user_id_fkey`                   | `scrape_artifacts.user_id`      |

  They cannot be re-pointed at `public.users(id)` inside the baseline, because
  the baseline's contract is that it applies cleanly to an *empty* database and
  `public.users` does not exist until Task 2.1. Referencing a not-yet-created
  table would fail at Task 1.3.

  The columns themselves are kept in the baseline, with their original type,
  nullability and constraints (`user_entitlements.user_id` stays `primary
  key`, `payment_transactions.user_id` stays `not null`). Only the foreign-key
  constraints are deferred.

  `scrape_artifacts_user_id_fkey` carried `on delete cascade`. Task 2.1 must
  restore the `on delete cascade` clause, not just the reference.

## Preserved verbatim

- All 11 `create table` statements.
- All index definitions.
- All 8 function definitions -- verified against the dump: claim_next_job,
  consume_quota, get_user_entitlement, hit_rate_limit, list_plans, refund_quota,
  retry_generation_job, sync_user_id_from_job.
  Both historical bodies of `claim_next_job` are carried, in their original
  order, so the last one applied is the same one production ran.
- All triggers (`trg_sync_user_id` on 5 child tables).
- The `generation_jobs_retry_of_fkey` `on delete cascade` fix.
- `revoke execute on function ... from public` (4 statements) -- the `public`
  pseudo-role does exist in stock PostgreSQL, and these revokes are the
  function-level hardening that stops a `SECURITY DEFINER` RPC being callable
  by the default `PUBLIC` grant.

## Added

- `0004_scrape_artifacts.sql`, recovered from the live InsForge database.
  The originals reference this table on 18 lines across 3 files and never create it.
- `generation_jobs.user_id` and its index, carried into `0006`. The only
  statement in the whole set that creates that column lived in
  `20260710132820_fix-rls-ownership-policies.sql`, a file whose stated purpose
  was RLS and which the file mapping otherwise drops. `sync_user_id_from_job()`
  and the `0006` backfill statements both read it, so dropping the column would
  have broken them at runtime rather than at apply time.
