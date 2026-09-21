-- FasoPrépa — schéma Supabase/PostgreSQL recommandé
-- À exécuter dans Supabase SQL Editor si vous passez en production.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  display_name text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  phone text not null references public.profiles(phone) on delete cascade,
  status text not null check (status in ('free','premium','expired','cancelled')) default 'free',
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  provider text,
  tx_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_phone_idx on public.subscriptions(phone);
create index if not exists subscriptions_expires_idx on public.subscriptions(expires_at);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  tx_ref text unique not null,
  provider text not null,
  amount integer not null,
  currency text not null default 'XOF',
  status text not null default 'INITIATED',
  raw jsonb,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  phone text not null references public.profiles(phone) on delete cascade,
  xp integer not null default 0,
  quiz_done integer not null default 0,
  correct integer not null default 0,
  answered integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  cat_stats jsonb not null default '{}'::jsonb,
  streak integer not null default 0,
  last_day date,
  updated_at timestamptz not null default now(),
  unique(phone)
);
