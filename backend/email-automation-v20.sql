-- Réussite Concours BF — Automatisation e-mail v20
-- À exécuter une seule fois dans Supabase > SQL Editor.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists email text;
create index if not exists profiles_email_idx on public.profiles(email);
alter table public.profiles add column if not exists marketing_email_opt_in boolean not null default true;
alter table public.profiles add column if not exists marketing_email_opt_in_at timestamptz;
alter table public.profiles add column if not exists marketing_email_unsubscribed_at timestamptz;
alter table public.profiles alter column marketing_email_opt_in set default true;
update public.profiles
set marketing_email_opt_in = true,
    marketing_email_opt_in_at = coalesce(marketing_email_opt_in_at, created_at, now())
where email is not null and btrim(email) <> '' and marketing_email_unsubscribed_at is null;
drop index if exists public.profiles_marketing_email_idx;
create index profiles_marketing_email_idx on public.profiles(id)
  where marketing_email_unsubscribed_at is null and email is not null and btrim(email) <> '';

create table if not exists public.email_notification_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  email text not null,
  event_type text not null,
  event_key text unique not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists email_notification_events_profile_idx on public.email_notification_events(profile_id);
create index if not exists email_notification_events_type_idx on public.email_notification_events(event_type);

create table if not exists public.pin_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists pin_reset_tokens_email_created_idx on public.pin_reset_tokens(email, created_at desc);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'promotion',
  subject text not null,
  text_body text not null,
  html_body text,
  cta_label text,
  cta_url text,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  cursor_profile_id uuid,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists email_campaigns_status_created_idx on public.email_campaigns(status, created_at);

create table if not exists public.email_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(campaign_id, profile_id)
);
create index if not exists email_campaign_deliveries_campaign_idx on public.email_campaign_deliveries(campaign_id, status);

alter table public.email_notification_events enable row level security;
alter table public.pin_reset_tokens enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_deliveries enable row level security;

-- Pas de politique publique : seuls les appels serveur avec la clé de service
-- lisent ou modifient ces tables sensibles.
