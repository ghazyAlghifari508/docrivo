-- Advisor fixes: block direct PostgREST access; add FK indexes.
-- App uses server-side admin key only, so no public policies needed.

alter table public.generation_jobs enable row level security;
alter table public.generation_jobs force row level security;

alter table public.crawled_pages enable row level security;
alter table public.crawled_pages force row level security;

alter table public.extracted_assets enable row level security;
alter table public.extracted_assets force row level security;

alter table public.design_extractions enable row level security;
alter table public.design_extractions force row level security;

alter table public.generated_documents enable row level security;
alter table public.generated_documents force row level security;

alter table public.job_logs enable row level security;
alter table public.job_logs force row level security;

alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;

create index if not exists idx_generation_jobs_retry_of on public.generation_jobs(retry_of);
create index if not exists idx_extracted_assets_page_id on public.extracted_assets(page_id);
