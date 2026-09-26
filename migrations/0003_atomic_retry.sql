-- 0003_atomic_retry.sql -- cleaned migration baseline, part 3 of 8.
--
-- Derived verbatim from 20260706062520_atomic-retry.sql. Contains no InsForge
-- dependency. The originals are preserved in git history; see
-- migrations/RULES.md.

-- Atomic retry guard: one retry job per failed/cancelled source job.

create unique index if not exists generation_jobs_retry_of_once
on public.generation_jobs (retry_of)
where retry_of is not null;

create or replace function public.retry_generation_job(p_job_id uuid)
returns public.generation_jobs
language plpgsql
as $$
declare
  old_job public.generation_jobs;
  new_job public.generation_jobs;
begin
  select * into old_job
  from public.generation_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'job not found' using errcode = 'P0002';
  end if;

  if old_job.status not in ('failed','cancelled') then
    raise exception 'job not retryable' using errcode = 'P0001';
  end if;

  insert into public.generation_jobs (
    source_url,
    normalized_domain,
    max_pages,
    output_language,
    retry_of
  ) values (
    old_job.source_url,
    old_job.normalized_domain,
    old_job.max_pages,
    old_job.output_language,
    p_job_id
  )
  returning * into new_job;

  return new_job;
end;
$$;
