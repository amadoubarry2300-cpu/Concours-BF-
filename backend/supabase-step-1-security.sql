-- Réussite Concours BF — Étape sécurité 1
-- Objectif : finaliser les bases Supabase sans casser l'application.
-- À exécuter dans Supabase > SQL Editor > New query > Run.

-- 1) Ajouter la colonne photo de profil si elle n'existe pas encore.
alter table public.profiles
add column if not exists avatar_data text;

-- 2) Vérifier/activer RLS sur les tables sensibles.
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.offer_leads enable row level security;
alter table public.questions enable row level security;

-- 3) Les visiteurs ne doivent lire publiquement que les questions gratuites actives.
-- Les questions Premium seront servies plus tard par le backend après vérification de l'abonnement.
drop policy if exists "Public can read active questions" on public.questions;
drop policy if exists "Public can read free active questions" on public.questions;

create policy "Public can read free active questions"
on public.questions
for select
to anon, authenticated
using (is_active = true and is_premium = false);

-- 4) Les visiteurs peuvent laisser leur numéro pour les offres,
-- mais seulement au format Burkina Faso normalisé +226XXXXXXXX.
drop policy if exists "Public can insert offer leads" on public.offer_leads;
drop policy if exists "Public can insert valid offer leads" on public.offer_leads;

create policy "Public can insert valid offer leads"
on public.offer_leads
for insert
to anon, authenticated
with check (
  phone ~ '^[+]226[0-9]{8}$'
  and length(coalesce(source, '')) <= 80
);

-- 5) Contrôle rapide : affiche les politiques importantes.
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('questions', 'offer_leads')
order by tablename, policyname;
