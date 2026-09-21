# 🎓 FasoPrépa

Application web de préparation aux examens et concours (CEP, BEPC, BAC, concours professionnels) — spéciale **Burkina Faso** 🇧🇫.

Inspirée du concept « prouve que tu as travaillé » : quiz corrigés, passeport de préparation, suivi des erreurs, statistiques et **abonnement Premium 1 500 FCFA/mois**.

## ✨ Fonctionnalités

### Gratuit

- **Quiz découverte** — 10 questions gratuites, 2 minutes, sans inscription
- **Quiz rapide 10 questions**
- **Défi du jour** — 15 questions, 1 fois par jour
- Catégories gratuites : Burkina Faso, Culture générale, Histoire-Géo
- Passeport de préparation — niveaux, XP et badges
- Partage natif de l'application

### Premium — 1 500 FCFA/mois

- **Examens blancs** — 40 questions / 40 minutes
- **Mes erreurs** — mauvaises réponses enregistrées et rejouables
- **Statistiques détaillées** — taux de réussite global et par matière
- **Matières avancées** — Maths, SVT, Français, Psychotechnique et contenus concours
- Verrouillage freemium intégré : les contenus Premium affichent un cadenas et redirigent vers l'abonnement

### Compte + paiement

- Écran **Compte candidat** avec numéro + PIN
- Écran **Abonnement Premium** avec Orange Money / Moov Money
- Mode test pour vérifier le verrouillage Premium dans l'aperçu local
- Code frontend prêt à appeler un backend : `POST /api/payments/cinetpay/init`
- Backend Express fourni dans `backend/` pour CinetPay + webhook + statut d'abonnement

## 🚀 Lancer l'application en local

Frontend statique, aucune dépendance :

```bash
cd fasoprepa
python3 -m http.server 3000 --bind 0.0.0.0
# puis http://localhost:3000
```

## 💳 Lancer le backend paiement

```bash
cd fasoprepa/backend
cp .env.example .env
# Remplir CINETPAY_APIKEY, CINETPAY_SITE_ID, APP_ORIGIN, PUBLIC_BASE_URL
npm install
npm run dev
```

Puis dans `js/app.js` ou via un fichier `js/payment-config.js`, configurer :

```js
backendBaseUrl: 'https://api.votre-domaine.com',
demoMode: false
```

> Important : le paiement réel nécessite un compte marchand CinetPay/Ligdicash/PayDunya validé. Sans clés marchandes, l'application reste en mode test local.

## 🌐 Déployer

- Frontend : GitHub Pages, Netlify ou Vercel
- Backend paiement : Railway, Render, Fly.io, VPS, ou fonctions serverless
- Base de données production : Supabase/PostgreSQL avec `backend/supabase-schema.sql`

GitHub Pages peut héberger le frontend, mais **ne peut pas exécuter le backend paiement**. Il faudra donc une URL API séparée.

## 📁 Structure

```text
fasoprepa/
├── index.html                    # Toutes les vues : accueil, quiz, compte, abonnement…
├── css/styles.css                # Design system + animations + premium
├── js/
│   ├── questions.js              # Banque de questions
│   ├── app.js                    # Quiz, XP, auth locale, freemium, paiement frontend
│   └── payment-config.example.js # Exemple de config API paiement
├── img/                          # Vraies photos JPG utilisées dans l'app
└── backend/
    ├── server.js                 # API paiement CinetPay + webhook
    ├── package.json
    ├── .env.example
    ├── supabase-schema.sql       # Tables production recommandées
    └── README.md
```

## ➕ Ajouter des questions

Éditer `js/questions.js` — chaque question suit ce format :

```js
{
  c: "Catégorie",
  q: "La question ?",
  o: ["Option A", "Option B", "Option C", "Option D"],
  a: 1,
  e: "Explication affichée après la réponse."
}
```

## 🗺️ Prochaines étapes production

- [ ] Créer le compte marchand CinetPay/Ligdicash/PayDunya
- [ ] Déployer le backend paiement avec HTTPS
- [ ] Brancher Supabase pour comptes, progression et abonnements persistants
- [ ] Ajouter plusieurs milliers de questions originales
- [ ] Ajouter PWA installable et notifications de renouvellement
- [ ] Publier ensuite sur Play Store si besoin
