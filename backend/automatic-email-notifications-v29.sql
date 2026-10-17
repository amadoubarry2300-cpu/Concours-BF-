-- Réussite Concours BF — Notifications e-mail automatiques v29
-- Tous les profils qui ont une adresse valide reçoivent les nouveautés automatiquement.
-- Un désabonnement explicite effectué depuis un e-mail reste respecté.

alter table public.profiles
  alter column marketing_email_opt_in set default true;

update public.profiles
set
  marketing_email_opt_in = true,
  marketing_email_opt_in_at = coalesce(marketing_email_opt_in_at, created_at, now())
where email is not null
  and btrim(email) <> ''
  and marketing_email_unsubscribed_at is null;

drop index if exists public.profiles_marketing_email_idx;
create index profiles_marketing_email_idx on public.profiles(id)
  where marketing_email_unsubscribed_at is null
    and email is not null
    and btrim(email) <> '';
