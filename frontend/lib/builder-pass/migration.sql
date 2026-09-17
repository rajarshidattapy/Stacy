-- ================================================================
-- Builder Pass – Supabase Migration
-- Run this ONCE in Supabase SQL Editor (http://localhost:8000)
-- ================================================================

create table if not exists public.builder_passes (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null references auth.users(id) on delete cascade,
  razorpay_order_id    text        not null,
  razorpay_payment_id  text,
  razorpay_signature   text,
  amount_paise         integer     not null default 15000,  -- ₹150 in paise
  status               text        not null default 'created',  -- created | paid | failed
  expires_at           timestamptz,
  created_at           timestamptz not null default now()
);

-- Enable RLS
alter table public.builder_passes enable row level security;

-- Users can only read their own passes (for frontend status checks via anon key)
create policy "Users can read own passes"
  on public.builder_passes
  for select
  using (auth.uid() = user_id);

-- Index for fast lookup by user + status + expiry
create index if not exists idx_builder_passes_user_active
  on public.builder_passes (user_id, status, expires_at desc);
