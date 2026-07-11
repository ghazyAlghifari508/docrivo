-- Payment gateway + lifetime quota entitlements (Midtrans sandbox).
--
-- Model: lifetime one-time purchase. Buying a plan sets the user's plan and
-- resets usage counters to 0. Quota is enforced in app-code via the
-- consume_quota() RPC (all DB access uses the server-only admin key, so there
-- is no direct client->DB path; RLS is defense-in-depth only).
--
-- plans           : reference table, single source of quota + price per plan
-- user_entitlements: one row per user (plan + used counters)
-- payment_transactions: Midtrans order tracking (poll-verified, no webhook)

-- 1. plans (reference). null quota = unlimited.
create table if not exists public.plans (
  plan               text primary key,
  label              text not null,
  designmd_quota     int,
  scrape_quota       int,
  templates_unlocked boolean not null default false,
  price_idr          int not null default 0,
  sort_order         int not null default 0
);

insert into public.plans (plan, label, designmd_quota, scrape_quota, templates_unlocked, price_idr, sort_order)
values
  ('free',   'Free',   1, 1, false, 0,      0),
  ('starter','Starter',3, 3, false, 25000,  1),
  ('pro',    'Pro',    6, 6, false, 50000,  2),
  ('proplus','Pro+',   null, null, true, 100000, 3)
on conflict (plan) do update set
  label = excluded.label,
  designmd_quota = excluded.designmd_quota,
  scrape_quota = excluded.scrape_quota,
  templates_unlocked = excluded.templates_unlocked,
  price_idr = excluded.price_idr,
  sort_order = excluded.sort_order;

-- 2. user_entitlements: one row per user.
create table if not exists public.user_entitlements (
  user_id        uuid primary key references auth.users(id),
  plan           text not null default 'free' references public.plans(plan),
  designmd_used  int not null default 0,
  scrape_used    int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_user_entitlements_plan on public.user_entitlements(plan);

-- 3. payment_transactions: Midtrans order tracking.
create table if not exists public.payment_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  order_id      text not null unique,
  plan          text not null references public.plans(plan),
  gross_amount  int not null,
  status        text not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_payment_transactions_user_id on public.payment_transactions(user_id);
create index if not exists idx_payment_transactions_plan on public.payment_transactions(plan);

-- 4. RLS. These tables are server-only (admin key via route handlers). Direct
--    client access is intentionally denied to avoid self-upgrade/payment spoofing.
alter table public.plans enable row level security;
alter table public.plans force row level security;
alter table public.user_entitlements enable row level security;
alter table public.user_entitlements force row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_transactions force row level security;

do $$
begin
  create policy "Deny direct plan access"
  on public.plans for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Deny direct entitlement access"
  on public.user_entitlements for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "Deny direct payment transaction access"
  on public.payment_transactions for all to anon, authenticated using (false) with check (false);
exception when duplicate_object then null;
end $$;

-- 5. consume_quota: atomically reserve one unit of quota for a user+kind.
--    Returns jsonb { allowed, plan, used, quota, remaining }.
--    quota null => unlimited (allowed, no increment).
create or replace function public.consume_quota(p_user uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ent   public.user_entitlements;
  q     int;
  used  int;
begin
  if p_kind not in ('designmd', 'scrape') then
    raise exception 'invalid quota kind: %', p_kind;
  end if;

  -- Ensure a row exists, then lock it.
  insert into public.user_entitlements (user_id)
  values (p_user)
  on conflict (user_id) do nothing;

  select * into ent from public.user_entitlements
  where user_id = p_user for update;

  if p_kind = 'designmd' then
    select designmd_quota into q from public.plans where plan = ent.plan for update;
    used := ent.designmd_used;
  else
    select scrape_quota into q from public.plans where plan = ent.plan for update;
    used := ent.scrape_used;
  end if;

  -- Unlimited plan: allow without incrementing.
  if q is null then
    return jsonb_build_object('allowed', true, 'plan', ent.plan,
      'used', used, 'quota', null, 'remaining', null);
  end if;

  if used >= q then
    return jsonb_build_object('allowed', false, 'plan', ent.plan,
      'used', used, 'quota', q, 'remaining', 0);
  end if;

  if p_kind = 'designmd' then
    update public.user_entitlements
      set designmd_used = designmd_used + 1, updated_at = now()
      where user_id = p_user;
  else
    update public.user_entitlements
      set scrape_used = scrape_used + 1, updated_at = now()
      where user_id = p_user;
  end if;

  return jsonb_build_object('allowed', true, 'plan', ent.plan,
    'used', used + 1, 'quota', q, 'remaining', q - used - 1);
end;
$$;

-- 6. refund_quota: give back one unit (used on synchronous scrape failure).
create or replace function public.refund_quota(p_user uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'designmd' then
    update public.user_entitlements
      set designmd_used = greatest(0, designmd_used - 1), updated_at = now()
      where user_id = p_user;
  elsif p_kind = 'scrape' then
    update public.user_entitlements
      set scrape_used = greatest(0, scrape_used - 1), updated_at = now()
      where user_id = p_user;
  end if;
end;
$$;
