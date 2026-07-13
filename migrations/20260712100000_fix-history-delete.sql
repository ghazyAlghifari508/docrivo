-- Fix history delete: ON DELETE CASCADE on retry_of FK
-- Root cause: generation_jobs.retry_of FK had NO ACTION — DELETE on
-- a parent job fails with FK violation when a retry row references it.
-- The client's Promise.all silently swallowed the error, clearing UI
-- state while DB rows remained intact.

alter table public.generation_jobs
  drop constraint if exists generation_jobs_retry_of_fkey,
  add constraint generation_jobs_retry_of_fkey
    foreign key (retry_of) references public.generation_jobs(id)
    on delete cascade;

-- Also grant DELETE on generation_jobs to authenticated role so RLS
-- policy can actually fire (FORCE ROW LEVEL SECURITY requires explicit
-- grant even though admin-key paths bypass it).
grant delete on public.generation_jobs to authenticated;
grant delete on public.scrape_artifacts to authenticated;
