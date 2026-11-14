-- Pink PDF Plus membership foundation
-- Run in Supabase SQL Editor. Review before applying to production.

create table if not exists public.membership_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paypal_subscription_id text unique,
  paypal_plan_id text not null,
  tier text not null check (tier in ('plus','pro')),
  status text not null default 'pending'
    check (status in ('pending','active','suspended','cancelled','expired','past_due')),
  payer_email text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists membership_subscriptions_user_id_idx
  on public.membership_subscriptions(user_id);
create index if not exists membership_subscriptions_status_idx
  on public.membership_subscriptions(status);

create table if not exists public.paypal_webhook_events (
  id uuid primary key default gen_random_uuid(),
  paypal_event_id text not null unique,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.membership_subscriptions enable row level security;
alter table public.paypal_webhook_events enable row level security;

drop policy if exists "Users can read their own subscriptions"
  on public.membership_subscriptions;
create policy "Users can read their own subscriptions"
  on public.membership_subscriptions
  for select to authenticated
  using (auth.uid() = user_id);

-- No client insert/update/delete policies are intentionally provided.
-- Only trusted Netlify Functions using the Supabase service role may mutate subscriptions.
-- Webhook event ledger is server-only: no client policies.
