-- Fix 5 InsForge Advisor false-positive "missing-rls-index" warnings.
--
-- The Advisor thinks child tables have `user_id` columns because the RLS
-- policies reference them via EXISTS subqueries on generation_jobs. Actual
-- columns don't exist, so the suggested CREATE INDEX fails with "column
-- does not exist".
--
-- Fix: Add real `user_id` columns + indexes, auto-populate via BEFORE INSERT
-- trigger (reads from parent generation_jobs), then rewrite policies from
-- EXISTS pattern to direct comparison so the Advisor sees indexes match.
--
-- The trigger means zero app-code changes — all insert paths (worker via
-- service role, any future path) get user_id for free.

-- 1. Add user_id columns + indexes to all 5 child tables
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crawled_pages' and column_name = 'user_id'
  ) then
    alter table public.crawled_pages add column user_id uuid references auth.users(id);
    create index idx_crawled_pages_user_id on public.crawled_pages(user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'design_extractions' and column_name = 'user_id'
  ) then
    alter table public.design_extractions add column user_id uuid references auth.users(id);
    create index idx_design_extractions_user_id on public.design_extractions(user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'extracted_assets' and column_name = 'user_id'
  ) then
    alter table public.extracted_assets add column user_id uuid references auth.users(id);
    create index idx_extracted_assets_user_id on public.extracted_assets(user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'generated_documents' and column_name = 'user_id'
  ) then
    alter table public.generated_documents add column user_id uuid references auth.users(id);
    create index idx_generated_documents_user_id on public.generated_documents(user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_logs' and column_name = 'user_id'
  ) then
    alter table public.job_logs add column user_id uuid references auth.users(id);
    create index idx_job_logs_user_id on public.job_logs(user_id);
  end if;
end $$;

-- 2. Trigger function: auto-populate user_id from parent generation_jobs
create or replace function public.sync_user_id_from_job()
returns trigger
language plpgsql
as $$
begin
  new.user_id := (select user_id from public.generation_jobs where id = new.job_id);
  return new;
end;
$$;

-- 3. Attach trigger to all 5 child tables
drop trigger if exists trg_sync_user_id on public.crawled_pages;
create trigger trg_sync_user_id
  before insert on public.crawled_pages
  for each row execute function public.sync_user_id_from_job();

drop trigger if exists trg_sync_user_id on public.design_extractions;
create trigger trg_sync_user_id
  before insert on public.design_extractions
  for each row execute function public.sync_user_id_from_job();

drop trigger if exists trg_sync_user_id on public.extracted_assets;
create trigger trg_sync_user_id
  before insert on public.extracted_assets
  for each row execute function public.sync_user_id_from_job();

drop trigger if exists trg_sync_user_id on public.generated_documents;
create trigger trg_sync_user_id
  before insert on public.generated_documents
  for each row execute function public.sync_user_id_from_job();

drop trigger if exists trg_sync_user_id on public.job_logs;
create trigger trg_sync_user_id
  before insert on public.job_logs
  for each row execute function public.sync_user_id_from_job();

-- 4. Backfill existing rows (safe for empty MVP tables)
update public.crawled_pages cp
  set user_id = (select user_id from public.generation_jobs where id = cp.job_id)
  where cp.user_id is null;

update public.design_extractions de
  set user_id = (select user_id from public.generation_jobs where id = de.job_id)
  where de.user_id is null;

update public.extracted_assets ea
  set user_id = (select user_id from public.generation_jobs where id = ea.job_id)
  where ea.user_id is null;

update public.generated_documents gd
  set user_id = (select user_id from public.generation_jobs where id = gd.job_id)
  where gd.user_id is null;

update public.job_logs jl
  set user_id = (select user_id from public.generation_jobs where id = jl.job_id)
  where jl.user_id is null;

-- 5. Drop old EXISTS-based policies on child tables

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

-- 6. Recreate policies with direct user_id comparison

-- generated_documents
do $$
begin
  create policy "Users can view documents for their own jobs"
  on public.generated_documents for select to authenticated
  using (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create documents for their own jobs"
  on public.generated_documents for insert to authenticated
  with check (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

-- crawled_pages
do $$
begin
  create policy "Users can view pages for their own jobs"
  on public.crawled_pages for select to authenticated
  using (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create pages for their own jobs"
  on public.crawled_pages for insert to authenticated
  with check (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

-- extracted_assets
do $$
begin
  create policy "Users can view assets for their own jobs"
  on public.extracted_assets for select to authenticated
  using (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create assets for their own jobs"
  on public.extracted_assets for insert to authenticated
  with check (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

-- design_extractions
do $$
begin
  create policy "Users can view extractions for their own jobs"
  on public.design_extractions for select to authenticated
  using (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create extractions for their own jobs"
  on public.design_extractions for insert to authenticated
  with check (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

-- job_logs
do $$
begin
  create policy "Users can view logs for their own jobs"
  on public.job_logs for select to authenticated
  using (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Users can create logs for their own jobs"
  on public.job_logs for insert to authenticated
  with check (user_id = (select auth.uid()));
exception when duplicate_object then null;
end $$;
