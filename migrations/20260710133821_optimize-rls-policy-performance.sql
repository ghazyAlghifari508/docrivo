-- Optimize RLS policy performance: wrap auth.uid() in subqueries
--
-- InsForge Advisor flagged 22 performance warnings after previous RLS fix:
-- - 17 warnings: auth.uid() called per-row without subquery wrapper causes 100x+ slowdown
-- - 5 warnings: missing indexes (false positives - child tables don't have user_id)
--
-- Fix: Replace all `auth.uid()` with `(select auth.uid())` so it evaluates once per query
-- instead of once per row.

-- Drop all policies to recreate with optimized versions
drop policy if exists "Users can view their own scrapes" on public.scrape_artifacts;
drop policy if exists "Users can create scrapes" on public.scrape_artifacts;
drop policy if exists "Users can delete their own scrapes" on public.scrape_artifacts;

drop policy if exists "Users can view their own generation jobs" on public.generation_jobs;
drop policy if exists "Users can create generation jobs" on public.generation_jobs;
drop policy if exists "Users can update their own generation jobs" on public.generation_jobs;
drop policy if exists "Users can delete their own generation jobs" on public.generation_jobs;

drop policy if exists "Users can view documents for their own jobs" on public.generated_documents;
drop policy if exists "Users can create documents for their own jobs" on public.generated_documents;

drop policy if exists "Users can view pages for their own jobs" on public.crawled_pages;
drop policy if exists "Users can create pages for their own jobs" on public.crawled_pages;

drop policy if exists "Users can view assets for their own jobs" on public.extracted_assets;
drop policy if exists "Users can create assets for their own jobs" on public.extracted_assets;

drop policy if exists "Users can view extractions for their own jobs" on public.design_extractions;
drop policy if exists "Users can create extractions for their own jobs" on public.design_extractions;

drop policy if exists "Users can view logs for their own jobs" on public.job_logs;
drop policy if exists "Users can create logs for their own jobs" on public.job_logs;

-- Recreate policies with optimized auth.uid() calls wrapped in subqueries

-- scrape_artifacts: users can SELECT/INSERT/DELETE their own scrapes
do $$
begin
  create policy "Users can view their own scrapes"
  on public.scrape_artifacts
  for select
  to authenticated
  using (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create scrapes"
  on public.scrape_artifacts
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can delete their own scrapes"
  on public.scrape_artifacts
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

-- generation_jobs: users can SELECT/INSERT/UPDATE/DELETE their own jobs
do $$
begin
  create policy "Users can view their own generation jobs"
  on public.generation_jobs
  for select
  to authenticated
  using (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create generation jobs"
  on public.generation_jobs
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can update their own generation jobs"
  on public.generation_jobs
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can delete their own generation jobs"
  on public.generation_jobs
  for delete
  to authenticated
  using (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

-- generated_documents: users can access documents for their own jobs
do $$
begin
  create policy "Users can view documents for their own jobs"
  on public.generated_documents
  for select
  to authenticated
  using (
    exists (
      select 1 from public.generation_jobs
      where generation_jobs.id = generated_documents.job_id
        and generation_jobs.user_id = (select auth.uid())
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create documents for their own jobs"
  on public.generated_documents
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.generation_jobs
      where generation_jobs.id = generated_documents.job_id
        and generation_jobs.user_id = (select auth.uid())
    )
  );
exception when duplicate_object then null;
end $$;

-- crawled_pages: users can access pages for their own jobs
do $$
begin
  create policy "Users can view pages for their own jobs"
  on public.crawled_pages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.generation_jobs
      where generation_jobs.id = crawled_pages.job_id
        and generation_jobs.user_id = (select auth.uid())
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create pages for their own jobs"
  on public.crawled_pages
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.generation_jobs
      where generation_jobs.id = crawled_pages.job_id
        and generation_jobs.user_id = (select auth.uid())
    )
  );
exception when duplicate_object then null;
end $$;

-- extracted_assets: users can access assets for their own jobs
do $$
begin
  create policy "Users can view assets for their own jobs"
  on public.extracted_assets
  for select
  to authenticated
  using (
    exists (
      select 1 from public.generation_jobs
      where generation_jobs.id = extracted_assets.job_id
        and generation_jobs.user_id = (select auth.uid())
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create assets for their own jobs"
  on public.extracted_assets
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.generation_jobs
      where generation_jobs.id = extracted_assets.job_id
        and generation_jobs.user_id = (select auth.uid())
    )
  );
exception when duplicate_object then null;
end $$;

-- design_extractions: users can access extractions for their own jobs
do $$
begin
  create policy "Users can view extractions for their own jobs"
  on public.design_extractions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.generation_jobs
      where generation_jobs.id = design_extractions.job_id
        and generation_jobs.user_id = (select auth.uid())
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create extractions for their own jobs"
  on public.design_extractions
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.generation_jobs
      where generation_jobs.id = design_extractions.job_id
        and generation_jobs.user_id = (select auth.uid())
    )
  );
exception when duplicate_object then null;
end $$;

-- job_logs: users can access logs for their own jobs
do $$
begin
  create policy "Users can view logs for their own jobs"
  on public.job_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.generation_jobs
      where generation_jobs.id = job_logs.job_id
        and generation_jobs.user_id = (select auth.uid())
    )
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create logs for their own jobs"
  on public.job_logs
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.generation_jobs
      where generation_jobs.id = job_logs.job_id
        and generation_jobs.user_id = (select auth.uid())
    )
  );
exception when duplicate_object then null;
end $$;
