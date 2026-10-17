# Backend Réussite Concours BF

Ce backend gère les comptes candidats, Premium, les paiements, les contenus administrateur et les notifications automatiques.

## Lancer localement

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Les secrets Supabase, paiement, Gemini et SMTP restent exclusivement dans les variables serveur.

## Automatisation e-mail v20

Avant le déploiement v20, exécuter une seule fois dans **Supabase → SQL Editor** :

- `email-automation-v20.sql`

La migration ajoute :

- le consentement révocable aux nouveautés et offres ;
- le journal anti-doublon des e-mails transactionnels ;
- les codes de réinitialisation du PIN hachés et temporaires ;
- les campagnes et leur suivi de livraison.

Fonctions principales :

- inscription et connexion sécurisée ;
- activation ou renouvellement Premium ;
- rappels avant expiration ;
- demande et confirmation de réinitialisation du PIN ;
- annonces automatiques des nouveaux QCM et documents ;
- offres rédigées par l’administrateur ;
- désabonnement en un clic.

Les deux tâches quotidiennes existantes exécutent également les rappels et les campagnes, sans ajouter une nouvelle tâche Vercel.

## Paiements

- `POST /api/payments/saspay/init` — crée ou reprend une transaction SasPay pour le compte connecté.
- `GET /api/payments/saspay/status` — vérifie une transaction appartenant au compte connecté.
- `GET /api/payments/saspay/reconcile` — rapproche les tentatives récentes du compte.
- `POST /api/payments/saspay/webhook` — vérifie la signature et la transaction avant d’activer Premium.
- `GET /api/subscription/status` — retourne l’état Premium du compte connecté.
