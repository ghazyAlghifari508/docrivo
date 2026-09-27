-- 0002_claim_next_job.sql -- cleaned migration baseline, part 2 of 8.
--
-- Derived from:
--   20260706042135_claim-next-job.sql  (claim_next_job v1)
--   20260706060024_hardening.sql       (claim_next_job v2, stale-job recovery)
--
-- Both bodies are carried verbatim and in their original chronological order,
-- so the definition left standing after this file applies is v2 -- the one
-- production ran. Order matters: `create or replace function` means the last
-- definition wins, so putting v1 after v2 here would silently drop the
-- stale-job recovery pass and leave stuck jobs ('crawling', 'capturing',
-- 'extracting', 'generating') never requeued.
--
-- The originals are preserved in git history. See migrations/RULES.md.

-- Atomic job claim for the polling worker (PRD 17.3 idempotent, no double-processing).
create or replace function public.claim_next_job()
returns public.generation_jobs
language plpgsql
as $$
declare
  claimed public.generation_jobs;
begin
  select * into claimed
  from public.generation_jobs
  where status = 'queued'
  order by created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.generation_jobs
     set status = 'crawling',
         progress = 20,
         started_at = now(),
         updated_at = now()
   where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;

-- Hardened replacement: requeues jobs abandoned mid-flight, then claims.
create or replace function public.claim_next_job()
returns public.generation_jobs
language plpgsql
as $$
declare
  claimed public.generation_jobs;
begin
  update public.generation_jobs
     set status = 'queued',
         progress = 0,
         error_code = null,
         error_message = null,
         updated_at = now()
   where status in ('crawling','capturing','extracting','generating')
     and updated_at < now() - interval '10 minutes';

  select * into claimed
  from public.generation_jobs
  where status = 'queued'
  order by created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.generation_jobs
     set status = 'crawling',
         progress = 20,
         started_at = coalesce(started_at, now()),
         updated_at = now()
   where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;
