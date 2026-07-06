-- DesignMD Generator schema (PRD §11). MVP: anon sessions, no users table.
-- ponytail: users/auth deferred to Phase 2; job carries session_id text instead.
-- Accessed server-only via InsForge admin key (Next.js route handlers + worker),
-- so no RLS policies for MVP — no direct client→DB path exists.

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
  components        jsonb,
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
