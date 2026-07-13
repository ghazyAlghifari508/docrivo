-- Server-only RPC: fetch a user's entitlement (plan + used counters).
-- SECURITY DEFINER so the admin-key PostgREST role bypasses RLS on
-- user_entitlements (the table's deny-all policy is enforced for anon/auth;
-- the app's server-only route handlers still read rows via this function).

create or replace function public.get_user_entitlement(p_user uuid)
returns table (
  user_id        uuid,
  plan           text,
  designmd_used  int,
  scrape_used    int
)
language sql
security definer
set search_path = public
as $$
  select user_id, plan, designmd_used, scrape_used
  from public.user_entitlements
  where user_id = p_user;
$$;

revoke execute on function public.get_user_entitlement(uuid) from public;
revoke execute on function public.get_user_entitlement(uuid) from anon;
revoke execute on function public.get_user_entitlement(uuid) from authenticated;

-- Server-only RPC: fetch all reference plans (single source of truth for quotas).
-- SECURITY DEFINER bypasses the deny-all RLS on plans so admin-key route
-- handlers can list plans without a permissive select policy for public.

create or replace function public.list_plans()
returns setof public.plans
language sql
security definer
set search_path = public
as $$
  select * from public.plans order by sort_order asc;
$$;

revoke execute on function public.list_plans() from public;
revoke execute on function public.list_plans() from anon;
revoke execute on function public.list_plans() from authenticated;
