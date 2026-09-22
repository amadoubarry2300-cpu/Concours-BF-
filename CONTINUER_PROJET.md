# Continuer le projet — Réussite Concours BF

Ce document sert de mémo si la discussion avec l’assistant disparaît. Il permet à un développeur ou à un autre assistant de reprendre le projet sans repartir de zéro.

---

## 1. Projet

Nom de l’application : **Réussite Concours BF**

Objectif : application web de préparation aux examens et concours au Burkina Faso avec :

- quiz gratuits ;
- examens blancs ;
- formations par matière/niveau ;
- compte candidat avec prénom, nom, téléphone, PIN ;
- photo de profil ;
- progression, XP, passeport, badges ;
- abonnement Premium à **1 500 FCFA/mois** ;
- paiement mobile money à connecter plus tard avec **SasPay**.

---

## 2. Liens importants

### Site en ligne Vercel

```text
https://concoursbf-fawn.vercel.app/
```

### GitHub

```text
https://github.com/amadoubarry2300-cpu/Concours-BF-
```

### Supabase

Projet Supabase utilisé :

```text
https://scnhrcjhxqzetkrhhong.supabase.co
```

### GitHub Pages, version secondaire

```text
https://amadoubarry2300-cpu.github.io/Concours-BF-/
```

---

## 3. État actuel du projet

Dernier commit important au moment de ce mémo :

```text
f726870 Serve premium questions through backend
```

Sécurité déjà mise en place :

- Supabase connecté à Vercel ;
- `SUPABASE_SERVICE_ROLE_KEY` configurée dans Vercel ;
- RLS activé sur les tables sensibles ;
- questions Premium non lisibles publiquement ;
- endpoint backend `/api/questions` pour servir les questions ;
- sessions sécurisées après connexion ;
- progression protégée par session ;
- changement de photo de profil protégé ;
- protection contre les essais répétés de PIN ;
- blocage après plusieurs mauvais PIN pendant environ 15 minutes.

---

## 4. Structure des fichiers importants

```text
index.html
```

Interface principale de l’application.

```text
css/styles.css
```

Styles de l’application.

```text
js/app.js
```

Logique frontend : navigation, quiz, compte candidat, premium, paiement côté interface, Supabase public, sessions.

```text
js/questions.js
```

Banque locale de questions.

```text
backend/server.js
```

Backend Express : auth, sessions, Supabase, progression, paiements, abonnements, questions Premium.

```text
backend/supabase-schema.sql
```

Schéma principal Supabase.

```text
backend/supabase-step-1-security.sql
backend/supabase-step-2-sessions.sql
backend/supabase-step-3-pin-security.sql
```

Migrations de sécurité déjà exécutées dans Supabase.

```text
backend/public/
```

Copie du frontend servie par le backend sur Vercel.

Quand on modifie `index.html`, `css/`, `js/` ou `img/`, il faut aussi mettre à jour `backend/public/`.

---

## 5. Variables Vercel importantes

Dans Vercel :

```text
Settings > Environment Variables
```

Variables Supabase :

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Variables de session :

```text
SESSION_SECRET
SESSION_DAYS
LOGIN_MAX_FAILED
LOGIN_LOCK_MINUTES
```

`SESSION_SECRET` est recommandé mais si absent, le backend utilise la clé service Supabase comme base de signature.

Variables paiement à ajouter plus tard avec SasPay :

```text
SASPAY_API_KEY
SASPAY_API_SECRET
SASPAY_MERCHANT_ID
SASPAY_WEBHOOK_SECRET
SASPAY_BASE_URL
PUBLIC_BASE_URL
APP_ORIGIN
```

Les noms exacts dépendront de la documentation SasPay.

---

## 6. Ce qu’il ne faut jamais exposer

Ne jamais mettre dans GitHub, dans un message public ou dans une capture visible :

```text
SUPABASE_SERVICE_ROLE_KEY
SASPAY_API_SECRET
SASPAY_WEBHOOK_SECRET
CINETPAY_APIKEY
CINETPAY_SITE_ID
```

Les clés secrètes doivent être mises directement dans Vercel.

---

## 7. Paiement : prochaine grande étape

Le choix actuel est : **SasPay**.

Le flux souhaité :

```text
Client clique Premium
↓
Choisit Orange Money ou Moov Money
↓
Entre son numéro
↓
Backend crée une transaction SasPay
↓
Client valide le paiement
↓
SasPay appelle le webhook
↓
Backend vérifie le paiement
↓
Supabase met payment = ACCEPTED
↓
Backend active Premium 30 jours
```

URL webhook à donner à SasPay :

```text
https://concoursbf-fawn.vercel.app/api/payments/saspay/webhook
```

URL de retour après paiement :

```text
https://concoursbf-fawn.vercel.app/#subscription
```

Informations à récupérer chez SasPay :

- documentation API ;
- endpoint de création paiement ;
- endpoint de vérification paiement ;
- format du webhook ;
- statuts possibles : `SUCCESS`, `PENDING`, `FAILED`, etc. ;
- méthode de signature du webhook ;
- clés marchand ;
- moyens supportés : Orange Money Burkina, Moov Money Burkina.

---

## 8. Que faire si la discussion disparaît ?

### Option simple

Ouvrir GitHub :

```text
https://github.com/amadoubarry2300-cpu/Concours-BF-
```

Puis donner ce message à un développeur ou à un autre assistant :

```text
Voici mon projet Réussite Concours BF. Lis le fichier CONTINUER_PROJET.md, puis reprends à partir du dernier commit. La prochaine étape est l’intégration du paiement SasPay avec webhook pour activer Premium automatiquement.
```

### Ce qu’il faut fournir à l’assistant suivant

- lien GitHub ;
- lien Vercel ;
- ce fichier `CONTINUER_PROJET.md` ;
- documentation SasPay quand elle sera disponible ;
- ne pas fournir les clés secrètes dans le chat.

---

## 9. Commandes utiles pour un développeur

Cloner le projet :

```bash
git clone https://github.com/amadoubarry2300-cpu/Concours-BF-.git
cd Concours-BF-
```

Lancer en local comme site statique :

```bash
python3 -m http.server 3000 --bind 0.0.0.0
```

Vérifier le JavaScript :

```bash
node --check js/app.js
node --check backend/server.js
node --check backend/public/js/app.js
```

Après modification frontend, copier vers backend public :

```bash
rm -rf backend/public
mkdir -p backend/public
cp index.html backend/public/index.html
cp -R css js img backend/public/
```

Commit et push :

```bash
git add .
git commit -m "Message clair de modification"
git push origin main
```

Vercel redéploie automatiquement après push sur GitHub.

---

## 10. Points à améliorer plus tard

1. Intégration SasPay complète.
2. Désactivation du mode démo Premium avant lancement officiel.
3. Interface admin pour valider paiements, gérer questions et voir les utilisateurs.
4. Import Excel/CSV des questions dans Supabase.
5. Stockage des photos dans Supabase Storage au lieu de `avatar_data` en base.
6. Nom de domaine professionnel.
7. Politique de remboursement et CGV plus complètes.
8. Tests utilisateurs avec élèves/candidats.

---

## 11. Résumé ultra court

Projet : **Réussite Concours BF**  
Site : `https://concoursbf-fawn.vercel.app/`  
GitHub : `https://github.com/amadoubarry2300-cpu/Concours-BF-`  
Backend : `backend/server.js`  
Frontend : `index.html`, `css/styles.css`, `js/app.js`  
Base de données : Supabase  
Paiement à venir : SasPay  
Prochaine tâche : intégrer SasPay avec webhook et activation automatique Premium.
