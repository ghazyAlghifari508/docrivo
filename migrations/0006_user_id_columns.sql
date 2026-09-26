-- 0006_user_id_columns.sql -- cleaned migration baseline, part 6 of 8.
--
-- Derived from 20260710140400_add-user-id-to-child-tables.sql, plus the one
-- DDL statement that migration's file-mapping otherwise dropped: the
-- `generation_jobs.user_id` column and its index, from
-- 20260710132820_fix-rls-ownership-policies.sql.
--
-- The originals are preserved in git history. See migrations/RULES.md.
--
-- Why generation_jobs.user_id is here and not dropped with the rest of that
-- file: it is the only statement in the entire set that creates that column,
-- and `sync_user_id_from_job()` below plus all five backfill statements read
-- it. Its RLS half went away with every other policy; its DDL half is load
-- bearing. It is placed first so the column exists before anything reads it.
--
-- Deliberate edits:
--   * the foreign key to the InsForge auth users table removed from all six
--     add-column statements. Columns keep type and nullability; the 6 FKs are
--     deferred to 0011_user_fks.sql.
--   * original sections 5 and 6 dropped in full (10 `drop policy` + 10
--     `create policy` do-blocks, 10 uses of the InsForge session helper).

-- 1. generation_jobs.user_id (carried from 20260710132820, section 1).
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'generation_jobs'
      and column_name = 'user_id'
  ) then
    alter table public.generation_jobs add column user_id uuid;
    create index on public.generation_jobs (user_id);
  end if;
end $$;

-- 2. Add user_id columns + indexes to all 5 child tables.
--    Original header, kept for context:
--      Fix 5 InsForge Advisor false-positive "missing-rls-index" warnings. The
--      Advisor thinks child tables have `user_id` columns because the RLS
--      policies reference them via EXISTS subqueries on generation_jobs. The
--      trigger means zero app-code changes -- all insert paths (worker via
--      service role, any future path) get user_id for free.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crawled_pages' and column_name = 'user_id'
  ) then
    alter table public.crawled_pages add column user_id uuid;
    create index idx_crawled_pages_user_id on public.crawled_pages(user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'design_extractions' and column_name = 'user_id'
  ) then
    alter table public.design_extractions add column user_id uuid;
    create index idx_design_extractions_user_id on public.design_extractions(user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'extracted_assets' and column_name = 'user_id'
  ) then
    alter table public.extracted_assets add column user_id uuid;
    create index idx_extracted_assets_user_id on public.extracted_assets(user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'generated_documents' and column_name = 'user_id'
  ) then
    alter table public.generated_documents add column user_id uuid;
    create index idx_generated_documents_user_id on public.generated_documents(user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_logs' and column_name = 'user_id'
  ) then
    alter table public.job_logs add column user_id uuid;
    create index idx_job_logs_user_id on public.job_logs(user_id);
  end if;
end $$;

-- 3. Trigger function: auto-populate user_id from parent generation_jobs
create or replace function public.sync_user_id_from_job()
returns trigger
language plpgsql
as $$
begin
  new.user_id := (select user_id from public.generation_jobs where id = new.job_id);
  return new;
end;
$$;

-- 4. Attach trigger to all 5 child tables
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

-- 5. Backfill existing rows (no-op on an empty database; kept so the baseline
--    also backfills correctly if applied to a restored dump).
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
