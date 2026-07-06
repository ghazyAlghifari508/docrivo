-- Atomic job claim for the polling worker (PRD §17.3 idempotent, no double-processing).
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
