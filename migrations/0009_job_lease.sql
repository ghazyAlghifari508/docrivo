-- 0009_job_lease.sql -- the lease that says a job is still being worked on.
--
-- Task 7.1. The number is the one the plan reserved: `migrations/RULES.md` says
-- `0009` is deliberately absent from the baseline so this file could have it, and
-- that the 0010/0011 pair was numbered around the gap. It is applied after
-- 0001..0008 and can equally be applied after 0011 -- it touches only
-- `generation_jobs`, and only adds to it.
--
-- ## Why a lease and not `updated_at`
--
-- `claim_next_job()`'s hardened body (0002) already requeues a job whose
-- `updated_at` is more than ten minutes old, and that is what recovered jobs
-- until now. It cannot be the whole answer once more than one job runs at a
-- time, because `updated_at` is written by *progress*: a crawl of a slow site
-- reports a page every few seconds and a crawl of a fast one goes quiet while
-- the model writes. A job that is genuinely working can therefore look abandoned,
-- and a requeue hands the same row to a second worker while the first is still
-- holding a Chromium process open on it. Ten minutes is simultaneously too short
-- to trust and too long to be useful.
--
-- A lease separates the two claims. `lease_expires_at` is written once by the
-- claim and refreshed by the worker's heartbeat, and nothing else touches it, so
-- "is this job still alive" stops depending on how chatty the crawl is. The
-- recovery rule is then: a mid-flight job whose lease has run out was lost.
--
-- The lease is five minutes and the worker refreshes every 60 seconds, so four
-- consecutive heartbeats have to fail before a live job is requeued. The four
-- missed writes are what pay for the four minutes of slack, and the slack is what
-- stops a GC pause or a database hiccup from costing a paid-for generation.
--
-- ## `NULL` is not "expired"
--
-- A mid-flight row with no lease was started by a worker from before this
-- migration, so it has no live owner the function can reason about but it is
-- almost certainly running. Those rows keep the `updated_at` rule the hardened
-- body has always used. The two rules are in the same WHERE clause and therefore
-- cannot disagree about the same row: the lease branch is only consulted when
-- the column is non-null.
--
-- The alternative -- treating NULL as expired -- would make this migration
-- requeue every in-flight job the instant it applied, on a live queue, with no
-- way to tell a running job from a dead one.
--
-- ## What this file does not do
--
-- It does not edit `migrations/0002_claim_next_job.sql`, which the Task 7.1
-- brief asked for. The baseline's contract, stated in `migrations/RULES.md`, is
-- that `0001..0008` apply cleanly to an *empty* database; a body in 0002 that
-- mentions `lease_expires_at` would fail there, because this file is the first
-- that has the column. The lease-aware claim is therefore a third
-- `create or replace` at the bottom of this file, which is the same "last
-- definition wins" arrangement 0002 already uses for its own two bodies.

alter table public.generation_jobs
  add column if not exists lease_expires_at timestamptz;

-- The statuses `claim_next_job()` treats as in-flight. A `queued` job is waiting
-- its turn, not abandoned, and a terminal one is finished. Kept as a function
-- rather than a repeated literal so the index predicate and the reclaim below
-- cannot drift apart, and declared `immutable` because an index predicate
-- requires it.
create or replace function public.midflight_statuses()
returns text[]
language sql
immutable
as $$
  select array['crawling', 'capturing', 'extracting', 'generating'];
$$;

-- Partial, because the reclaim and the heartbeat both ask the same question --
-- "which rows are in flight?" -- and a `queued` row has no lease to speak of.
-- A full index would carry an entry per queued row for a predicate that is never
-- true of them.
--
-- The predicate is the deparsed spelling, `(status = ANY (...))`, rather than an
-- `in` list, because that is what `pg_get_expr` returns and it is what
-- `src/db/schema.test.ts` compares `src/db/schema.ts` against.
create index if not exists generation_jobs_lease_idx
  on public.generation_jobs (lease_expires_at)
  where (status = ANY (public.midflight_statuses()));

comment on column public.generation_jobs.lease_expires_at is
  'When the worker holding this job stopped refreshing it. Null unless status is a mid-flight one; the claim sets it and the heartbeat extends it.';

-- Requeues jobs whose owner stopped renewing the lease, and answers with the
-- rows it touched.
--
-- Split out of `claim_next_job()` so the recovery can also be swept on its own,
-- and so it is testable without a claim -- a claim also needs a queued row, so a
-- test of the recovery through the claim alone cannot tell "the recovery did
-- nothing" from "the recovery worked and the claim then had nothing to hand".
--
-- `p_now` is the instant the expiry is judged against, defaulting to the
-- database clock. It is a parameter rather than a bare `now()` because the rule
-- is a boundary and a boundary cannot be tested by waiting for it: a caller that
-- passes an explicit instant can place a row one millisecond either side of it
-- and see which side is reclaimed. `claim_next_job()` below takes the default, so
-- the claim path is unchanged.
--
-- The parameter is a *widening* of what a caller can do, never a narrowing: a
-- value in the past reclaims less and a value in the future reclaims more, and
-- the latter is a requeue the caller could perform by hand on rows its own
-- privileges already let it update. `revoke ... from public` at the bottom is
-- what keeps it off the browser.
create or replace function public.reclaim_expired_jobs(p_now timestamptz default null)
returns setof public.generation_jobs
language plpgsql
as $$
declare
  horizon timestamptz := coalesce(p_now, now());
begin
  return query
  update public.generation_jobs
     set status = 'queued',
         progress = 0,
         lease_expires_at = null,
         error_code = null,
         error_message = null,
         updated_at = now()
   where status = any (public.midflight_statuses())
     and (
       -- The lease ran out: the owner is gone.
       (lease_expires_at is not null and lease_expires_at < horizon)
       or
       -- No lease at all: a row from before this migration, judged the way the
       -- hardened body has always judged it. Two rules, one WHERE clause, so they
       -- cannot disagree about the same row.
       (lease_expires_at is null and updated_at < horizon - interval '10 minutes')
     )
  returning *;
end;
$$;

-- The claim, with the lease. Third body of `claim_next_job()`; like 0002's two,
-- the last definition applied is the one that stands, and that is the intent.
--
-- `for update skip locked` is unchanged and is still the whole reason two workers
-- can call this at once without both receiving the same row. The lease is set in
-- the same statement as the status change, so there is no window between "this
-- row is taken" and "this row is marked as taken" for a third worker to slip
-- through.
--
-- The zero-argument signature is preserved. The lease duration is the literal
-- rather than a parameter because a defaulted argument on a function that
-- production already calls with none is a signature change, and the reclaim path
-- reads the column rather than the duration anyway -- a caller cannot learn
-- anything from the constant that it could not read off the row.
create or replace function public.claim_next_job()
returns public.generation_jobs
language plpgsql
as $$
declare
  claimed public.generation_jobs;
begin
  perform public.reclaim_expired_jobs();

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
         updated_at = now(),
         lease_expires_at = now() + interval '5 minutes'
   where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;

-- 0010_function_revoke.sql revoked execute on `claim_next_job` from `public`, and
-- a `create or replace` does not change a function's privileges -- they survive
-- the replacement. The two new functions above, however, carry the default
-- `EXECUTE` grant to the `PUBLIC` pseudo-role. They are `SECURITY INVOKER` and
-- take no argument that could scope a read, so the exposure is a requeue done
-- with the caller's own privileges, which the caller could do by hand. Revoked
-- anyway, for the reason 0010 gives for the other three: an RPC in this schema is
-- not something the browser should be able to reach directly.
revoke execute on function public.reclaim_expired_jobs(timestamptz) from public;
revoke execute on function public.midflight_statuses() from public;
