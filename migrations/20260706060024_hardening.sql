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
