-- Réussite Concours BF — Étape sécurité 2
-- Objectif : ajouter des sessions sécurisées après connexion.
-- À exécuter dans Supabase > SQL Editor > New query > Run.

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  phone text not null,
  token_hash text unique not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists sessions_token_hash_idx on public.sessions(token_hash);
create index if not exists sessions_phone_idx on public.sessions(phone);
create index if not exists sessions_profile_idx on public.sessions(profile_id);
create index if not exists sessions_expires_idx on public.sessions(expires_at);

alter table public.sessions enable row level security;

-- Important : aucune policy publique n'est créée volontairement.
-- Seul le backend avec SUPABASE_SERVICE_ROLE_KEY doit lire/écrire les sessions.

select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'sessions';
