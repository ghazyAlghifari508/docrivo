-- Fix RLS ownership policies: enable RLS on scrape_artifacts, replace blanket
-- deny-all policies with proper ownership-based policies so authenticated users
-- can access their own data.
--
-- Root cause: InsForge Advisor flagged scrape_artifacts as publicly accessible
-- (RLS disabled). Other tables had RLS enabled but only blanket deny policies,
-- blocking even authenticated users from accessing their own data.

-- 1. Ensure generation_jobs has user_id column (may have been added in prior migration)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'generation_jobs'
      and column_name = 'user_id'
  ) then
    alter table public.generation_jobs add column user_id uuid references auth.users(id);
    create index on public.generation_jobs (user_id);
  end if;
end $$;

-- 2. Enable RLS on scrape_artifacts (InsForge Advisor critical fix)
alter table public.scrape_artifacts enable row level security;
alter table public.scrape_artifacts force row level security;

-- 3. Drop blanket deny-all policies that block authenticated users
drop policy if exists "deny_public_scrape_artifacts" on public.scrape_artifacts;
drop policy if exists "deny_public_generation_jobs" on public.generation_jobs;
drop policy if exists "deny_public_generated_documents" on public.generated_documents;
drop policy if exists "deny_public_crawled_pages" on public.crawled_pages;
drop policy if exists "deny_public_extracted_assets" on public.extracted_assets;
drop policy if exists "deny_public_design_extractions" on public.design_extractions;
drop policy if exists "deny_public_job_logs" on public.job_logs;
drop policy if exists "deny_public_rate_limits" on public.rate_limits;

-- 4. Create ownership-based policies for direct user-owned tables

-- scrape_artifacts: users can SELECT/INSERT/DELETE their own scrapes
do $$
begin
  create policy "Users can view their own scrapes"
  on public.scrape_artifacts
  for select
  to authenticated
  using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create scrapes"
  on public.scrape_artifacts
  for insert
  to authenticated
  with check (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can delete their own scrapes"
  on public.scrape_artifacts
  for delete
  to authenticated
  using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- generation_jobs: users can SELECT/INSERT/UPDATE/DELETE their own jobs
do $$
begin
  create policy "Users can view their own generation jobs"
  on public.generation_jobs
  for select
  to authenticated
  using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create generation jobs"
  on public.generation_jobs
  for insert
  to authenticated
  with check (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can update their own generation jobs"
  on public.generation_jobs
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can delete their own generation jobs"
  on public.generation_jobs
  for delete
  to authenticated
  using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- 5. Create policies for job-owned tables (indirect ownership via generation_jobs FK)

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
        and generation_jobs.user_id = auth.uid()
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
        and generation_jobs.user_id = auth.uid()
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
        and generation_jobs.user_id = auth.uid()
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
        and generation_jobs.user_id = auth.uid()
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
        and generation_jobs.user_id = auth.uid()
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
        and generation_jobs.user_id = auth.uid()
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
        and generation_jobs.user_id = auth.uid()
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
        and generation_jobs.user_id = auth.uid()
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
        and generation_jobs.user_id = auth.uid()
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
        and generation_jobs.user_id = auth.uid()
    )
  );
exception when duplicate_object then null;
end $$;

-- rate_limits: keep deny-all policy for now (internal table, not user-facing)
do $$
begin
  create policy "deny_public_rate_limits" on public.rate_limits
    for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null;
end $$;
