-- Réussite Concours BF — Schéma Supabase v1
-- À coller dans Supabase > SQL Editor > New query > Run
-- Ce script crée les tables principales : comptes, progression, questions, abonnements et paiements.

create extension if not exists pgcrypto;

-- Fonction utilitaire pour mettre updated_at à jour automatiquement
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================
-- 1) Profils candidats
-- =========================
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  first_name text,
  last_name text,
  display_name text,
  avatar_data text,
  pin_hash text,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- Migration douce si la table profiles existait déjà avant l'ajout de la photo de profil.
alter table public.profiles add column if not exists avatar_data text;

create index if not exists profiles_phone_idx on public.profiles(phone);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- =========================
-- 2) Questions / contenus
-- =========================
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  level text,
  question_text text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_answer smallint not null check (correct_answer between 0 and 3),
  explanation text,
  is_premium boolean not null default false,
  is_active boolean not null default true,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists questions_category_idx on public.questions(category);
create index if not exists questions_level_idx on public.questions(level);
create index if not exists questions_active_idx on public.questions(is_active);
create index if not exists questions_premium_idx on public.questions(is_premium);

drop trigger if exists set_questions_updated_at on public.questions;
create trigger set_questions_updated_at
before update on public.questions
for each row execute function public.set_updated_at();

-- =========================
-- 3) Progression candidat
-- =========================
create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  phone text not null,
  xp integer not null default 0,
  quiz_done integer not null default 0,
  correct integer not null default 0,
  answered integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  cat_stats jsonb not null default '{}'::jsonb,
  streak integer not null default 0,
  last_day date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(phone)
);

create index if not exists progress_phone_idx on public.progress(phone);
create index if not exists progress_profile_idx on public.progress(profile_id);

drop trigger if exists set_progress_updated_at on public.progress;
create trigger set_progress_updated_at
before update on public.progress
for each row execute function public.set_updated_at();

-- =========================
-- 4) Abonnements Premium
-- =========================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  phone text not null,
  status text not null default 'free' check (status in ('free','premium','expired','cancelled')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  provider text,
  tx_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_phone_idx on public.subscriptions(phone);
create index if not exists subscriptions_profile_idx on public.subscriptions(profile_id);
create index if not exists subscriptions_expires_idx on public.subscriptions(expires_at);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

-- =========================
-- 5) Paiements Mobile Money
-- =========================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
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

create index if not exists payments_phone_idx on public.payments(phone);
create index if not exists payments_tx_ref_idx on public.payments(tx_ref);
create index if not exists payments_status_idx on public.payments(status);

-- =========================
-- 6) Historique des quiz
-- =========================
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  phone text not null,
  title text,
  category text,
  total integer not null default 0,
  correct integer not null default 0,
  score_percent integer not null default 0,
  xp_gained integer not null default 0,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quiz_attempts_phone_idx on public.quiz_attempts(phone);
create index if not exists quiz_attempts_created_idx on public.quiz_attempts(created_at);

-- =========================
-- 7) Contacts / offres promotionnelles
-- =========================
create table if not exists public.offer_leads (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  source text default 'landing_modal',
  created_at timestamptz not null default now()
);

create index if not exists offer_leads_phone_idx on public.offer_leads(phone);

-- =========================
-- 8) Sécurité RLS
-- =========================
alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.progress enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.offer_leads enable row level security;

-- Questions actives lisibles publiquement.
-- Les questions Premium restent marquées comme premium ; l'application/back-end filtrera l'accès.
drop policy if exists "Public can read active questions" on public.questions;
create policy "Public can read active questions"
on public.questions
for select
to anon, authenticated
using (is_active = true);

-- Les visiteurs peuvent laisser leur numéro pour les offres.
drop policy if exists "Public can insert offer leads" on public.offer_leads;
create policy "Public can insert offer leads"
on public.offer_leads
for insert
to anon, authenticated
with check (true);

-- Les autres tables sensibles seront manipulées par le backend avec SUPABASE_SERVICE_ROLE_KEY.
-- Ne jamais mettre SUPABASE_SERVICE_ROLE_KEY dans le frontend ou dans GitHub.

-- =========================
-- 9) Données de test facultatives
-- =========================
insert into public.questions (category, level, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, is_premium)
values
('Burkina Faso','BEPC','Quelle est la capitale du Burkina Faso ?','Bobo-Dioulasso','Koudougou','Ouagadougou','Banfora',2,'Ouagadougou est la capitale politique et administrative du Burkina Faso.',false),
('Mathématiques','BAC','Combien font 12 × 8 ?','86','96','108','128',1,'12 × 8 = 96.',true)
on conflict do nothing;
