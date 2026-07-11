-- Fix InsForge Advisor security findings for entitlement/payment tables.
--
-- The app uses server-only admin-key route handlers for plans, entitlements,
-- payments, and quota RPCs. No direct browser/client DB access is needed.
-- Therefore direct anon/authenticated access is denied, while server code keeps
-- working through the admin key.

-- 1. SECURITY DEFINER RPCs must not be callable by public/anon/authenticated.
revoke execute on function public.consume_quota(uuid, text) from public;
revoke execute on function public.consume_quota(uuid, text) from anon;
revoke execute on function public.consume_quota(uuid, text) from authenticated;

revoke execute on function public.refund_quota(uuid, text) from public;
revoke execute on function public.refund_quota(uuid, text) from anon;
revoke execute on function public.refund_quota(uuid, text) from authenticated;

-- 2. Replace permissive/read-only policies with explicit deny-all policies.
--    This removes the permissive plans SELECT policy and avoids select-only
--    advisor noise on server-managed tables.
drop policy if exists "Anyone authenticated can read plans" on public.plans;
drop policy if exists "Users can view their own entitlement" on public.user_entitlements;
drop policy if exists "Users can view their own transactions" on public.payment_transactions;

drop policy if exists "Deny direct plan access" on public.plans;
drop policy if exists "Deny direct entitlement access" on public.user_entitlements;
drop policy if exists "Deny direct payment transaction access" on public.payment_transactions;

alter table public.plans enable row level security;
alter table public.plans force row level security;
alter table public.user_entitlements enable row level security;
alter table public.user_entitlements force row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_transactions force row level security;

create policy "Deny direct plan access"
  on public.plans for all to anon, authenticated
  using (false) with check (false);

create policy "Deny direct entitlement access"
  on public.user_entitlements for all to anon, authenticated
  using (false) with check (false);

create policy "Deny direct payment transaction access"
  on public.payment_transactions for all to anon, authenticated
  using (false) with check (false);
