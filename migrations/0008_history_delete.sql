-- 0008_history_delete.sql -- cleaned migration baseline, part 8 of 8.
--
-- Derived from 20260712100000_fix-history-delete.sql. The originals are
-- preserved in git history. See migrations/RULES.md.
--
-- Deliberate edit, in RULES.md's "Removed" section -- 2 statements:
--   * `grant delete ... to <InsForge client role>`, on generation_jobs and on
--     scrape_artifacts. That role does not exist outside InsForge, so both
--     statements errored. Their explanatory comment went with them; it
--     described making an RLS policy fire, and there is no policy here.
--
-- The constraint change below is plain self-referential Postgres and is kept
-- verbatim: it is what makes deleting a job with retries actually delete the
-- retry rows.

-- Fix history delete: ON DELETE CASCADE on retry_of FK
-- Root cause: generation_jobs.retry_of FK had NO ACTION -- DELETE on
-- a parent job fails with FK violation when a retry row references it.
-- The client's Promise.all silently swallowed the error, clearing UI
-- state while DB rows remained intact.

alter table public.generation_jobs
  drop constraint if exists generation_jobs_retry_of_fkey,
  add constraint generation_jobs_retry_of_fkey
    foreign key (retry_of) references public.generation_jobs(id)
    on delete cascade;
