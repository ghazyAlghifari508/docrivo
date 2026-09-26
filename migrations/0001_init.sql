-- 0001_init.sql -- cleaned migration baseline, part 1 of 8.
--
-- Derived from, in order:
--   20260706041528_init-designmd.sql   (6 tables + their indexes)
--   20260706060024_hardening.sql       (rate_limits + hit_rate_limit)
--   20260706070500_rls-and-fk-indexes.sql  (indexes only; its RLS half dropped)
--
-- The originals are preserved in git history. See migrations/RULES.md for the
-- full transformation. SQL below is verbatim except where a comment marks a
-- deliberate edit.
--
-- Historical header from 20260706041528_init-designmd.sql, kept for context:
--   DesignMD Generator schema (PRD 11). MVP: guest sessions, no users table.
--   ponytail: users/auth deferred to Phase 2; job carries session_id text instead.
--   Accessed server-only via InsForge admin key (Next.js route handlers + worker),
--   so no RLS policies for MVP -- no direct client->DB path exists.

create table public.generation_jobs (
  id                uuid primary key default gen_random_uuid(),
  session_id        text,
  source_url        text not null,
  normalized_domain text not null,
  status            text not null default 'queued',
  progress          int  not null default 0,
  max_pages         int  not null default 5,
  output_language   text not null default 'id',
  error_code        text,
  error_message     text,
  retry_of          uuid references public.generation_jobs(id),
  pages_analyzed    int  not null default 0,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on public.generation_jobs (session_id, created_at desc);
create index on public.generation_jobs (status);

create table public.crawled_pages (
  id                     uuid primary key default gen_random_uuid(),
  job_id                 uuid not null references public.generation_jobs(id) on delete cascade,
  url                    text not null,
  title                  text,
  status_code            int,
  screenshot_desktop_url text,
  screenshot_mobile_url  text,
  created_at             timestamptz not null default now()
);
create index on public.crawled_pages (job_id);

create table public.extracted_assets (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.generation_jobs(id) on delete cascade,
  page_id     uuid references public.crawled_pages(id) on delete set null,
  asset_type  text not null,
  source_url  text not null,
  storage_url text,
  filename    text,
  size_bytes  int,
  mime_type   text,
  status      text not null default 'found',
  created_at  timestamptz not null default now()
);
create index on public.extracted_assets (job_id);

create table public.design_extractions (
  id               uuid primary key default gen_random_uuid(),
  job_id           uuid not null references public.generation_jobs(id) on delete cascade,
  colors           jsonb,
  typography       jsonb,
  layout_patterns  jsonb,
  components       jsonb,
  metadata         jsonb,
  confidence_score real,
  created_at       timestamptz not null default now()
);
create index on public.design_extractions (job_id);

create table public.generated_documents (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references public.generation_jobs(id) on delete cascade,
  design_md             text,
  implementation_prompt text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index on public.generated_documents (job_id);

create table public.job_logs (
  id         uuid primary key default gen_random_uuid(),
  job_id     uuid not null references public.generation_jobs(id) on delete cascade,
  level      text not null default 'info',
  event      text,
  message    text,
  context    jsonb,
  created_at timestamptz not null default now()
);
create index on public.job_logs (job_id, created_at);

-- Hardening: DB-backed rate limit + stale job recovery.

create table if not exists public.rate_limits (
  key text primary key,
  count int not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create or replace function public.hit_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
as $$
declare
  current_count int;
begin
  insert into public.rate_limits(key, count, reset_at, updated_at)
  values (p_key, 1, now() + make_interval(secs => p_window_seconds), now())
  on conflict (key) do update
    set count = case
      when public.rate_limits.reset_at <= now() then 1
      else public.rate_limits.count + 1
    end,
    reset_at = case
      when public.rate_limits.reset_at <= now() then now() + make_interval(secs => p_window_seconds)
      else public.rate_limits.reset_at
    end,
    updated_at = now()
  returning count into current_count;

  return current_count <= p_limit;
end;
$$;

-- claim_next_job v1 and v2 both live in 0002_claim_next_job.sql, in that order,
-- so the version that ends up applied is the same one production ran. The
-- hardened v2 (with stale-job recovery) is NOT defined here.

-- Carried over from 20260706070500_rls-and-fk-indexes.sql: that file's
-- `alter table ... enable|force row level security` half is dropped (see
-- RULES.md), but these two indexes are plain Postgres and are kept verbatim.
create index if not exists idx_generation_jobs_retry_of on public.generation_jobs(retry_of);
create index if not exists idx_extracted_assets_page_id on public.extracted_assets(page_id);
