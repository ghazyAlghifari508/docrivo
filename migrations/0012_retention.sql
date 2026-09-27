-- 0012_retention.sql -- the indexes the retention pass reads through.
--
-- Task 7.2. NOT `0010_retention.sql`, which is what the brief names: `0010` is
-- already taken by `0010_function_revoke.sql` (Task 1.3), and two files with the
-- same number in one applied directory is a history that cannot be replayed in
-- order. `0011` is taken too, so this is the next free number after the baseline
-- plus its two later files.
--
-- ## What this migration does *not* do
--
-- It does not create a table, a function, or a trigger. Retention is two
-- parameterised `DELETE`s in `worker/retention.ts`, and the thresholds it uses
-- are policy that has to be readable and changeable without a migration. The
-- paid-output floor in particular lives in that module as a named constant, not
-- here as a `CHECK`, because the thing being protected is not a row invariant --
-- it is the *number* a future edit is allowed to pass to the delete.
--
-- ## Why the indexes are needed at all
--
-- Both deletes are `where created_at < <instant>`, with no other predicate. The
-- planner has to choose between a sequential scan and every index on the table:
--
--   * `scrape_artifacts` has `idx_scrape_artifacts_user_id (user_id, created_at
--     desc)`. A retention pass has no user, so the leading column is useless and
--     the index cannot be used at all.
--   * `generated_documents` has `generated_documents_job_id_idx` and
--     `idx_generated_documents_user_id`, neither of which starts with
--     `created_at`.
--
-- Neither is wrong -- they serve the per-user listing queries, which is what they
-- were built for. They are simply not indexes for this query, so a pass over
-- `scrape_artifacts` (up to ~6MB of HTML per row) seq-scans the whole table on
-- every run. That is the cost of pruning, paid hourly, against the largest table
-- in the schema.
--
-- Plain, not partial. A partial index would need a predicate that holds for the
-- rows worth keeping and excludes the rows about to go -- and the cutoff is a
-- parameter, so any such predicate is either a constant that goes stale or a
-- function call the planner must evaluate per row, which is the sequential scan
-- with extra steps.

create index if not exists scrape_artifacts_created_at_idx
  on public.scrape_artifacts (created_at);

create index if not exists generated_documents_created_at_idx
  on public.generated_documents (created_at);

comment on index public.scrape_artifacts_created_at_idx is
  'Supports the retention pass: delete where created_at < cutoff, with no user predicate.';

comment on index public.generated_documents_created_at_idx is
  'Supports the retention pass: delete where created_at < cutoff, with no user predicate.';
