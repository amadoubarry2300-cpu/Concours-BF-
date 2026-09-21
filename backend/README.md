# Backend paiements Concours BF+

Ce backend sert à encaisser l'abonnement **Premium 1 500 FCFA / mois** via Mobile Money avec CinetPay.

## Lancer localement

```bash
cd backend
cp .env.example .env
# remplir CINETPAY_APIKEY, CINETPAY_SITE_ID, APP_ORIGIN, PUBLIC_BASE_URL
npm install
npm run dev
```

Endpoints :

- `POST /api/payments/cinetpay/init` — crée une transaction CinetPay et renvoie `paymentUrl`
- `POST /api/payments/cinetpay/webhook` — reçoit la confirmation CinetPay, vérifie la transaction, active 30 jours Premium
- `GET /api/subscription/status?phone=+22670000000` — retourne l'état Premium

## Branchement côté application

Dans `js/app.js`, renseigner :

```js
const PAYMENT_CONFIG = window.CONCOURS_BF_PLUS_PAYMENT_CONFIG || {
  amount: 1500,
  currency: 'XOF',
  plan: 'premium_monthly',
  backendBaseUrl: 'https://api.votre-domaine.com',
  demoMode: false
};
```

## Production

1. Créer le compte marchand CinetPay/Ligdicash.
2. Déployer ce backend sur Railway, Render, Fly.io, VPS, ou Vercel Functions.
3. Mettre `PUBLIC_BASE_URL` sur l'URL publique du backend.
4. Configurer l'URL webhook dans le compte marchand si nécessaire.
5. Remplacer le stockage mémoire par Supabase/PostgreSQL avec `supabase-schema.sql`.
