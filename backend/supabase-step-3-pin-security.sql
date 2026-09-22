-- Réussite Concours BF — Étape sécurité 3
-- Objectif : protéger la connexion PIN contre les essais répétés.
-- À exécuter dans Supabase > SQL Editor > New query > Run.

create table if not exists public.auth_attempts (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  success boolean not null default false,
  reason text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists auth_attempts_phone_created_idx
on public.auth_attempts(phone, created_at desc);

create index if not exists auth_attempts_success_idx
on public.auth_attempts(success);

alter table public.auth_attempts enable row level security;

-- Important : aucune policy publique n'est créée volontairement.
-- Seul le backend avec SUPABASE_SERVICE_ROLE_KEY doit écrire/lire les tentatives.

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'auth_attempts';
