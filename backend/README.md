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

- `POST /api/payments/cinetpay/init` — crée une transaction et renvoie l’URL de paiement.
- `POST /api/payments/cinetpay/webhook` — vérifie la transaction puis active Premium.
- `GET /api/subscription/status?phone=+22670000000` — retourne l’état Premium.
