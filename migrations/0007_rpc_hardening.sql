-- 0007_rpc_hardening.sql -- cleaned migration baseline, part 7 of 8.
--
-- Derived from:
--   20260710153000_harden-entitlement-advisor-findings.sql
--   20260710154500_server-only-entitlement-rpcs.sql
--
-- The originals are preserved in git history. See migrations/RULES.md.
--
-- Deliberate edits, all in RULES.md's "Removed" section -- 10 statements:
--   * 8 `revoke execute ... from <InsForge client role>`. Neither role exists
--     outside InsForge, so each statement errored. The matching
--     `from public` revokes are KEPT: `public` is a real pseudo-role in stock
--     PostgreSQL, and revoking the default PUBLIC execute grant is the whole
--     point of these lines.
--   * 6 `drop policy` and 6 `alter table ... enable|force row level security`.
--   * 3 `create policy` do-blocks, all naming the two InsForge client roles.
--
-- What survives is the part that still bites on stock PostgreSQL: the
-- SECURITY DEFINER bodies, and the PUBLIC revoke that stops any role from
-- calling them without an explicit grant.

-- 1. SECURITY DEFINER RPCs must not be callable by any unprivileged role.
revoke execute on function public.consume_quota(uuid, text) from public;

revoke execute on function public.refund_quota(uuid, text) from public;

-- 2. Server-only RPC: fetch a user's entitlement (plan + used counters).
--    SECURITY DEFINER so the server's own role bypasses RLS on
--    user_entitlements; the app's server-only route handlers read rows via
--    this function.
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

-- 3. Server-only RPC: fetch all reference plans (single source of truth for quotas).
--    SECURITY DEFINER bypasses deny-all RLS on plans so server route handlers
--    can list plans without a permissive select policy for public.
create or replace function public.list_plans()
returns setof public.plans
language sql
security definer
set search_path = public
as $$
  select * from public.plans order by sort_order asc;
$$;

revoke execute on function public.list_plans() from public;
