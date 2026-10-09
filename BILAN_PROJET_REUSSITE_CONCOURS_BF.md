# Bilan général du projet — Réussite Concours BF

_Date du bilan : 2026-10-09_
_Projet : application web/mobile installable de préparation aux concours, examens, QCM et documents pour le Burkina Faso._

---

## 1. Résumé très court pour reprise rapide

L’application **Réussite Concours BF** est une application web hébergée sur **Vercel**, avec backend Node/Express, données Supabase, paiement SasPay/Mobile Money, interface candidat, interface admin, génération IA de QCM/PDF, actualités officielles, documents/fichiers, QCM gratuits/Premium et support PWA installable Android.

État production vérifié :

- URL actuelle : <https://concoursbf-fawn.vercel.app/?v=qcm-verified-v2-3>
- API santé : <https://concoursbf-fawn.vercel.app/health>
- Dernier build vérifié : `qcm-verified-v2-3`
- Dernier commit fonctionnel V2 : `e9bc03e Add source-verified QCM generation gate`
- Correctif runtime Vercel : `ab61662 Export Express app for Vercel runtime`
- Dépôt GitHub : `https://github.com/amadoubarry2300-cpu/Concours-BF-.git`
- Branche : `main`
- Vercel déploie automatiquement depuis GitHub.

Dernière correction importante :

- Côté **candidat**, tous les documents/fichiers dans **Documents & fichiers** sont maintenant affichés **Premium** et verrouillés sans abonnement.
- L’ouverture/téléchargement public d’un document sans Premium retourne `402` côté serveur.
- Le cache mobile/PWA a été rebumpé pour remplacer les anciens affichages `Gratuit / Ouvrir`.

### Mise à jour du 8 octobre 2026 — qualité des QCM

- Un audit de la production a détecté sept QCM contenant une réponse fausse, une correction contradictoire ou une remarque de brouillon.
- Le nouveau filtre candidat écarte automatiquement ces contenus de **Nouveaux QCM** et de `/api/questions`, sans modifier l’interface d’administration.
- Outil ajouté : `tools/audit_qcm_quality.py`.
- Nouveau build déployé et vérifié : `qcm-quality-gate-1`.
- Audit qualité production : 9 publications, 224 questions contrôlées, 1 600 questions dans la banque candidat, aucun contenu interne/douteux exposé.
- Audit Premium production : 4 documents candidat verrouillés, 2 publications Premium verrouillées et aucune fuite Premium.

### Mise à jour du 8 octobre 2026 — correction des QCM du PDF

- Dans la vérification du PDF quotidien, l’admin dispose maintenant du bouton **Corriger les QCM du PDF**.
- Chaque QCM source est modifiable : énoncé, options A à D, bonne réponse et correction détaillée.
- Une question peut être supprimée ou remplacée seule sans régénérer les autres questions.
- **Enregistrer et recréer le PDF** sauvegarde les corrections et produit un nouveau fichier sans ancien cache.
- La publication est bloquée si des corrections locales restent non enregistrées.
- Le PDF et les QCM interactifs publiés utilisent désormais la même liste corrigée.
- Build production vérifié : `pdf-qcm-editor-1` ; commit fonctionnel : `2900324`.

### Mise à jour du 8 octobre 2026 — V2 QCM vérifiés

La génération quotidienne a été renforcée pour éviter qu’un modèle plus puissant soit confondu avec une vraie vérification factuelle.

#### Principe retenu

1. Générer par petits lots de cinq QCM.
2. Utiliser la recherche Google de Gemini, ou le PDF fourni, comme base documentaire.
3. Lancer un deuxième appel Gemini indépendant qui rend un verdict et ne réécrit pas silencieusement les questions douteuses.
4. Refuser les questions non étayées, ambiguës, obsolètes, contradictoires ou sous le score minimal.
5. Conserver les preuves et le verdict dans le brouillon quotidien.
6. Garder une relecture humaine obligatoire.
7. Bloquer la publication côté serveur si une seule question restante n’est pas conforme.

#### Modèles et configuration

- Génération par défaut : `gemini-3.7-flash`.
- Vérification par défaut : `gemini-3.1-pro-preview`, avec repli vers les modèles Flash disponibles si le compte API ne l’expose pas.
- Variable indépendante : `GEMINI_VERIFIER_MODEL`.
- Recherche : `AI_QCM_GROUNDING_ENABLED=true`.
- Vérification obligatoire : `AI_QCM_REQUIRE_VERIFICATION=true`.
- Taille de lot : `AI_QCM_BATCH_SIZE=5`.
- Score minimal : `AI_QCM_MIN_VERIFICATION_SCORE=90`.
- Version de politique : `official-sources-v2`.

Les variables complètes et commentaires sont dans `backend/.env.example`. Les secrets réels restent dans Vercel et ne doivent jamais être committés.

#### Politique de preuves

Chaque QCM factuel doit garder :

- `evidence_type` ;
- `source_title` ;
- `source_url` ;
- `source_quote` ;
- `source_date` ;
- `verification_status` ;
- `verification_score` ;
- `verification_reason` ;
- `verified_at` ;
- `verified_by` ;
- `verified_fingerprint` ;
- `verification_version`.

Pour le Burkina Faso — institutions, administration, droit, histoire, géographie et actualité — la source exigée doit être officielle : domaine gouvernemental burkinabè, Journal officiel, CENI, Présidence, SIG, AN, Cour constitutionnelle ou source officielle équivalente. Un PDF importé est accepté comme preuve lorsqu’il est la source réelle de la question. Pour un calcul autonome ou une règle linguistique stable, le vérificateur doit fournir le calcul ou la règle exacte.

#### Garde-fous déterministes

Le serveur rejette aussi des erreurs connues sans dépendre du jugement du modèle, notamment :

- anciennes régions/provinces utilisées comme situation actuelle après la réforme de juillet 2025 ;
- Médiateur du Faso présenté comme institution actuelle après sa suppression ;
- confusion entre officier supérieur et capitaine ;
- Norbert Zongo présenté comme syndicaliste/homme politique plutôt que journaliste d’investigation ;
- Soumane Touré présenté comme fondateur initial du PAI ;
- Deuxième République présentée comme régime interrompu par le CMRPN au lieu de la Troisième.

Ces règles bloquent les formulations actuelles erronées tout en autorisant les questions historiques correctement datées.

#### Intégrité après correction

Une empreinte SHA-256 lie le verdict à l’énoncé exact, aux quatre options, à la bonne réponse, à l’explication et aux métadonnées de preuve. Toute modification manuelle invalide la vérification. L’admin doit alors cliquer sur **Vérifier les sources** avant publication. Cette règle empêche de modifier une question après validation tout en conservant artificiellement son badge.

#### Interface et routes

- La liste admin affiche **Vérifié**, **À vérifier** ou **Bloqué**, la note, le motif, le titre de la source, son lien et la citation.
- Le candidat ne voit pas ce vocabulaire technique.
- `POST /api/admin/ai/qcm/verify` revérifie une proposition individuelle après correction.
- `POST /api/admin/ai/daily/:id/verify` relance la vérification d’un brouillon existant.
- `POST /api/admin/ai/daily/:id/publish` répond `409` si le contrôle V2 échoue.
- Le PDF et le quiz interactif continuent à provenir du même tableau structuré corrigé.
- Build/cache V2 : `qcm-verified-v2-3`.

#### Correction mobile du 9 octobre 2026 — génération progressive

La création de 50 QCM vérifiés ne s’exécute plus dans une seule requête longue, qui pouvait être interrompue par Vercel et afficher `Failed to fetch` sur téléphone. L’admin initialise maintenant une préparation, puis le navigateur demande automatiquement de petits lots de cinq. Depuis le correctif `qcm-verified-v2-3`, une fonction Vercel effectue soit la génération du lot, soit sa vérification indépendante, jamais les deux appels Gemini dans la même requête. Le lot brut et le lot accepté sont enregistrés séparément dans Supabase. Un délai réseau Gemini est arrêté côté serveur avant la limite Vercel. Si le réseau ou une fonction s’interrompt, le bouton **Reprendre la préparation** continue au dernier état sauvegardé sans recommencer les QCM déjà contrôlés. Le PDF final n’est créé qu’une fois les 50 QCM vérifiés obtenus.

Routes concernées :

- `POST /api/admin/ai/daily/run` initialise ou reprend la préparation ;
- `POST /api/admin/ai/daily/:id/generate-batch` produit et enregistre un petit lot vérifié.

#### Tests V2

- `tools/test_qcm_verification_v2.mjs` contrôle les domaines, le score, la source officielle, les six erreurs connues, le calcul autonome et le blocage d’une empreinte devenue obsolète.
- Commande : `node tools/test_qcm_verification_v2.mjs`.
- Les contrôles de syntaxe restent : `node --check backend/server.js` et `node --check js/app.js`.
- La banque principale de 5 000 QCM reste validée par `python3 tools/validate_qcm_bank.py content/qcm/qcm_bank_5000_v1.csv`.

#### Limite opérationnelle importante

Sans `GEMINI_API_KEY` valide, le serveur peut vérifier sa syntaxe et ses garde-fous locaux, mais il ne peut pas confirmer le cycle réel recherche → génération → vérification. Après chaque modification de modèle ou de clé, tester avec un brouillon admin réel, consulter au moins plusieurs liens officiels, modifier volontairement un QCM pour constater son invalidation, puis confirmer que la publication est refusée tant qu’il n’est pas revérifié.

---

## 2. Vision du projet

Le projet vise à créer une vraie application appelée **Réussite Concours BF**, simple, fluide, professionnelle, proche d’une expérience type iConcours, destinée aux candidats burkinabè qui préparent :

- concours directs ;
- concours professionnels ;
- examens CEP, BEPC, BAC ;
- formations par matière/niveau ;
- QCM gratuits quotidiens ;
- QCM et documents Premium ;
- actualités officielles concours ;
- documents PDF et fichiers utiles ;
- statistiques de progression ;
- révision des erreurs ;
- génération/admin IA de QCM/PDF.

Objectif long terme : une application concrète, maintenable, candidate-friendly, installable sur Android, avec admin capable de gérer contenus, paiements, documents, QCM, actualités et publications.

---

## 3. Contraintes fortes données par le propriétaire

Ces consignes doivent être respectées dans toute nouvelle discussion :

1. **Ne pas toucher à l’admin sauf demande explicite.**
2. Verrouillage Premium demandé côté **candidat**.
3. L’interface doit rester simple, fluide, non saturée.
4. Ne pas utiliser côté candidat des mots techniques ou internes comme :
   - `publication` ;
   - `publié/publiés par l’administration` ;
   - `archive admin` ;
   - `archivé dans admin` ;
   - `Archives admin`.
5. Pour l’admin, les éléments publiés doivent aller dans :
   - **Voir historique publié (nombre)** ;
   - pas dans une interface appelée archive.
6. La suppression doit être réelle : un élément supprimé ne doit pas revenir après actualisation.
7. Côté candidat, les fichiers doivent afficher **Ouvrir**, pas **Télécharger**.
8. L’app visible doit garder le nom : **Réussite Concours BF**.
9. Style de marque : **Réussite** plus grand, **Concours BF** plus petit.
10. Contact visible : `reussiteconcoursbf@yahoo.com`.
11. Bouton WhatsApp flottant à droite uniquement, ouvrant `+22674013704`, sans afficher le numéro.
12. Les QCM IA/PDF doivent être professionnels, propres, sans mention d’IA, sans texte interne.
13. Les QCM générés doivent être validés/admin-review avant publication.
14. Le niveau doit avoir priorité sur matière/catégorie.
15. CEP ne doit pas proposer Physique-Chimie.
16. Génération quotidienne : **50 QCM**.
17. Fournir **10 QCM gratuits par jour**.
18. Les contenus Premium doivent être visibles avec verrou/upsell, pas seulement disparaître.
19. Le backend doit appliquer le verrou Premium, pas seulement le frontend.
20. L’application mobile/PWA doit recevoir les mises à jour rapidement.

---

## 4. Technologies et services utilisés

### Frontend

- HTML/CSS/JavaScript vanilla.
- Fichiers principaux :
  - `index.html`
  - `css/styles.css`
  - `js/app.js`
  - `js/questions.js`

### Backend

- Node.js avec Express.
- Fichier principal :
  - `backend/server.js`

### Hébergement

- Vercel.
- Domaine Vercel actuel :
  - `https://concoursbf-fawn.vercel.app`

### Base de données / stockage

- Supabase.
- Supabase sert notamment pour :
  - profils ;
  - sessions ;
  - abonnements ;
  - questions/QCM publiés ;
  - progression ;
  - stockage ressources/documents via bucket.

### Paiement

- SasPay / Mobile Money.
- Endpoints paiements présents :
  - `/api/payments/saspay/init`
  - `/api/payments/saspay/status`
  - `/api/payments/saspay/webhook`
- `/health` indique actuellement :
  - `saspay:true`
  - `saspayWebhook:true`

### IA

- Gemini API prévue/utilisée côté admin pour générer :
  - QCM ;
  - QCM depuis PDF ;
  - PDF quotidien ;
  - veille actualités officielles.

### Mobile / PWA Android

- Manifest : `manifest.webmanifest`
- Service worker : `sw.js`
- Icônes PWA :
  - `img/pwa-icon-192.png`
  - `img/pwa-icon-512.png`
- Dernier cache/build : `candidate-docs-premium-lock-1`

---

## 5. État production actuel vérifié

Production vérifiée au moment du bilan :

```json
{
  "ok": true,
  "service": "Réussite Concours BF API",
  "supabase": true,
  "saspay": true,
  "saspayWebhook": true,
  "build": "candidate-docs-premium-lock-1"
}
```

URL de vérification :

```txt
https://concoursbf-fawn.vercel.app/?v=candidate-docs-premium-lock-1
```

Audit Premium exécuté :

```txt
health build: candidate-docs-premium-lock-1
resources: 4 candidate premium locked: 4
qcm publications: 6 premium locked: 0
questions: 1580 premium leaked: 0
service worker premium cache guards: ok
AUDIT OK
```

Interprétation :

- Les 4 documents visibles côté candidat sont maintenant verrouillés Premium.
- Aucun QCM Premium publié actuellement en production.
- `/api/questions` ne fuite pas de questions Premium aux non-Premium.
- Le service worker contient bien les garde-fous cache Premium.

---

## 6. Historique récent des commits importants

Les commits les plus importants dans la phase actuelle :

```txt
0991451 Gate candidate documents behind Premium
4ec4fc5 Keep premium document lock candidate-only
0e9a67d Add premium lock audit script
88cd73b Lock premium documents and refresh PWA updates
a1d3f5d Add installable Android offline app support
6396ac6 Move published admin items into history
b8626f1 Align admin forms with archive behavior
ab2be4f Make hide an admin archive only
71a8377 Hide official news without PDF from candidates
081aa1e Clarify admin history and candidate file opening
54ad75f Verify admin QCM actions before success
9603b5f Make resource deletion persistent
```

### Sens des derniers commits

#### `0991451 Gate candidate documents behind Premium`

- Côté candidat, tous les documents/fichiers sont marqués Premium.
- Les cartes affichent `Premium` et `Débloquer Premium` pour non-Premium.
- Les téléchargements publics sans Premium sont bloqués côté backend par `402`.
- Build/cache : `candidate-docs-premium-lock-1`.

#### `4ec4fc5 Keep premium document lock candidate-only`

- Retrait d’un traitement spécial admin ajouté par erreur.
- Rappel : ne pas toucher admin sauf demande explicite.

#### `0e9a67d Add premium lock audit script`

- Ajout de `tools/audit_premium_lock.py` pour vérifier automatiquement :
  - ressources/documents verrouillés ;
  - QCM Premium non exposés ;
  - service worker protégé.

#### `88cd73b Lock premium documents and refresh PWA updates`

- Premier verrouillage Premium des documents.
- Protection cache mobile contre données Premium.
- Headers `X-Premium-Included` et `X-Premium-Content`.

#### `a1d3f5d Add installable Android offline app support`

- Ajout PWA/Android : manifest, service worker, icônes, bouton installation.

#### `6396ac6 Move published admin items into history`

- Admin : les documents/QCM publiés quittent la liste principale et vont dans **Voir historique publié (nombre)**.
- Pas de vocabulaire `archive` côté interface.

---

## 7. Fonctionnalités principales déjà en place

### 7.1 Côté candidat

- Accueil avec marque Réussite Concours BF.
- Connexion/compte candidat.
- Formations par matières/niveaux.
- Nouveaux QCM.
- Documents & fichiers.
- Actualités concours.
- Passeport/profil.
- Progression.
- Accès complet/Premium.
- WhatsApp flottant à droite.
- PWA installable Android.

### 7.2 Côté Premium

Premium ouvre/contrôle :

- documents/fichiers candidat ;
- QCM Premium publiés ;
- banque QCM complète ;
- entraînements plus longs ;
- statistiques détaillées ;
- révision des erreurs ;
- examen blanc ;
- formations payantes.

### 7.3 Côté admin

À ne modifier que sur demande.

Fonctions admin existantes :

- ajout/modification/suppression QCM ;
- gestion QCM gratuits/Premium ;
- génération IA QCM ;
- génération depuis PDF ;
- génération quotidienne 50 QCM/PDF ;
- choix Gratuit/Premium avant publication ;
- gestion documents ;
- gestion actualités ;
- veille officielle ;
- historique publié ;
- suppression persistante.

### 7.4 Paiement

- SasPay/Mobile Money configuré.
- Webhook SasPay présent.
- Activation Premium via abonnement.
- Plans détectés dans backend :
  - mensuel ;
  - annuel.

### 7.5 Notifications e-mail/SMS

Le code backend contient des fonctions de notification, mais l’e-mail automatique n’est pas encore totalement réglé à cause du blocage Yahoo/app password.

Adresse visible actuellement :

```txt
reussiteconcoursbf@yahoo.com
```

Conseil retenu :

- garder Yahoo comme contact visible si souhaité ;
- acheter plus tard un domaine ;
- créer une adresse professionnelle ;
- utiliser Brevo/Resend/Zoho/Google Workspace selon budget.

---

## 8. État des documents/fichiers Premium

Dernière demande utilisateur :

> Bloquer fichiers et documents Premium côté candidat, pas côté admin.

Correction finale :

- Tous les documents de la rubrique candidat **Documents & fichiers** sont maintenant Premium côté candidat.
- L’API `/api/resources` renvoie les ressources candidat avec :
  - `is_premium:true`
  - `locked:true` pour non-Premium.
- L’API `/api/resources/:id/download` retourne `402` sans Premium.
- Les abonnés Premium peuvent ouvrir.
- Le service worker ne cache pas les fichiers Premium.

Important :

- L’interface admin n’a pas été modifiée dans cette correction finale.
- Si une modification admin est nécessaire plus tard, il faut une demande explicite.

---

## 9. Fichiers importants du projet

### Racine

#### `index.html`

Interface principale côté candidat et admin. Contient :

- structure des écrans ;
- liens CSS/JS versionnés ;
- lien manifest PWA ;
- bouton installation ;
- sections candidat/admin.

#### `css/styles.css`

Styles principaux :

- cartes ;
- boutons ;
- navigation bas ;
- Premium locks ;
- PWA install button ;
- WhatsApp flottant ;
- responsive mobile.

#### `js/app.js`

Logique frontend principale :

- navigation ;
- auth ;
- quiz ;
- Premium lock ;
- documents ;
- actualités ;
- admin panel ;
- PWA registration ;
- paiement ;
- rendu QCM.

Points récents dans `js/app.js` :

- `loadResources()` affiche Documents & fichiers en Premium côté candidat.
- `openResource()` bloque sans Premium et ouvre l’écran abonnement.
- `registerOfflineApp()` force les mises à jour PWA plus rapidement.
- `checkAppBuildVersion()` recharge si build différent.

#### `js/questions.js`

Banque QCM locale/offline. Audit récent : pas de fuite Premium directe via ce fichier.

#### `manifest.webmanifest`

Manifest PWA :

- nom : Réussite Concours BF ;
- display standalone ;
- icônes PWA ;
- start URL.

#### `sw.js`

Service worker PWA :

- cache app shell ;
- cache data network-first ;
- ne cache pas contenus Premium marqués ;
- gère `CLEAR_DATA_CACHE` ;
- version actuelle : `qcm-verified-v2-3`.

#### `vercel.json`

Configuration Vercel.

---

### Backend

#### `backend/server.js`

Fichier le plus important côté backend.

Contient :

- Express server ;
- santé `/health` ;
- auth ;
- profils ;
- abonnements ;
- SasPay ;
- admin ;
- QCM ;
- IA ;
- ressources/documents ;
- actualités ;
- notifications ;
- service fichiers ;
- sécurité Premium.

Routes clés :

```txt
GET  /health
GET  /api/resources
GET  /api/resources/:id/download
GET  /api/qcm-publications
GET  /api/questions
GET  /api/subscription/status
POST /api/payments/saspay/init
GET  /api/payments/saspay/status
POST /api/payments/saspay/webhook
```

Admin :

```txt
GET    /api/admin/questions
POST   /api/admin/questions
PATCH  /api/admin/questions/:id
DELETE /api/admin/questions/:id
GET    /api/admin/resources
POST   /api/admin/resources/upload
PATCH  /api/admin/resources/:id
DELETE /api/admin/resources/:id
GET    /api/admin/ai/daily
POST   /api/admin/ai/daily/run
POST   /api/admin/ai/qcm/verify
POST   /api/admin/ai/daily/:id/verify
POST   /api/admin/ai/daily/:id/publish
GET    /api/admin/news
POST   /api/admin/news
```

#### `backend/public/...`

Miroir des fichiers publics pour le backend/Vercel :

- `backend/public/index.html`
- `backend/public/js/app.js`
- `backend/public/css/styles.css`
- `backend/public/sw.js`
- `backend/public/manifest.webmanifest`

Quand on modifie un fichier public racine, souvent il faut modifier aussi son miroir dans `backend/public`.

---

### Content / documentation

#### `content/qcm/MISE_A_JOUR_APPLICATION_QCM.md`

Changelog fonctionnel. Contient les évolutions importantes.

#### `BILAN_PROJET_REUSSITE_CONCOURS_BF.md`

Ce fichier de bilan général.

---

### Outils

#### `tools/audit_premium_lock.py`

Audit automatique Premium production.

Usage :

```bash
python3 tools/audit_premium_lock.py https://concoursbf-fawn.vercel.app
```

Vérifie :

- `/health` ;
- `/api/resources` ;
- téléchargement documents bloqué sans Premium ;
- `/api/qcm-publications` ;
- `/api/questions` ;
- service worker PWA.

#### `tools/test_qcm_verification_v2.mjs`

Tests ciblés du verrou V2 : preuves officielles, score, empreinte après modification, calcul autonome et erreurs factuelles connues.

#### `tools/validate_qcm_bank.py`

Validation banque QCM.

#### `tools/generate_qcm_5000_v1.py`

Génération banque locale.

#### `tools/import_qcm_to_supabase.py`

Import QCM vers Supabase.

#### `tools/export_qcm_for_supabase.py`

Export QCM.

#### `tools/generate_app_questions_js.py`

Génère/alimente `js/questions.js`.

#### `tools/generate_public_questions_js.py`

Génération publique questions JS.

---

## 10. Méthodes de travail utilisées

### 10.1 Avant toute modification

Toujours vérifier l’état local, car le sandbox est souvent revenu à un ancien commit :

```bash
cd /home/user/fasoprepa
git status --short --branch
git rev-parse --short HEAD
git remote -v
```

Si le dépôt est ancien/désynchronisé :

```bash
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/amadoubarry2300-cpu/Concours-BF-.git
git fetch origin main
git reset --hard origin/main
git clean -fd
```

Dernier bon HEAD au moment du bilan :

```txt
0991451
```

### 10.2 Modifier proprement

Modifier les fichiers sources et miroirs :

```txt
index.html + backend/public/index.html
js/app.js + backend/public/js/app.js
css/styles.css + backend/public/css/styles.css
sw.js + backend/public/sw.js
manifest.webmanifest + backend/public/manifest.webmanifest
```

### 10.3 Valider avant commit

Commandes utilisées :

```bash
node --check backend/server.js
node --check js/app.js
node --check backend/public/js/app.js
node --check sw.js
node --check backend/public/sw.js
python3 -m py_compile tools/audit_premium_lock.py
git diff --check
```

### 10.4 Commit/push

```bash
git config user.name "Arena Agent"
git config user.email "agent@arena.ai"
git add <fichiers>
git commit -m "Message clair"
GIT_ASKPASS=/tmp/git-askpass-token.sh git push origin main
```

### 10.5 Vérifier déploiement Vercel

Attendre que `/health` change de build :

```bash
python3 - <<'PY'
import json, time, urllib.request
url='https://concoursbf-fawn.vercel.app/health?ts='
for i in range(36):
    with urllib.request.urlopen(url+str(int(time.time()*1000)), timeout=20) as r:
        data=json.loads(r.read().decode())
        print(i+1, data.get('build'), data.get('ok'), data.get('supabase'))
        if data.get('build')=='NOUVEAU_BUILD':
            break
    time.sleep(10)
PY
```

### 10.6 Audit Premium

```bash
python3 tools/audit_premium_lock.py https://concoursbf-fawn.vercel.app
```

---

## 11. Données importantes actuelles

### Production

```txt
URL principale : https://concoursbf-fawn.vercel.app
URL test build actuel : https://concoursbf-fawn.vercel.app/?v=candidate-docs-premium-lock-1
Health : https://concoursbf-fawn.vercel.app/health
Build actuel : candidate-docs-premium-lock-1
```

### Contact

```txt
E-mail visible : reussiteconcoursbf@yahoo.com
WhatsApp : +22674013704
```

### Paiement

- Montant mensuel historique : `1500 XOF`.
- Abonnement annuel historique : `10000 XOF`.
- Paiement SasPay configuré côté backend.

### IA

- Génération quotidienne attendue : 50 QCM.
- Les QCM/news générés doivent rester en review admin avant publication.

### QCM/Documents actuels en production

Dernier audit :

```txt
resources: 4 candidate premium locked: 4
qcm publications: 6 premium locked: 0
questions: 1580 premium leaked: 0
```

Cela signifie :

- 4 documents candidat visibles, tous verrouillés Premium ;
- 6 groupes Nouveaux QCM, actuellement gratuits ;
- 1580 questions accessibles aux non-Premium, aucune marquée Premium.

---

## 12. Domaines et e-mail professionnel

Discussion récente :

### Peut-on acheter un domaine et garder Vercel ?

Oui.

Exemple :

```txt
Domaine acheté : reussiteconcoursbf.com
Hébergement : Vercel
App finale : https://reussiteconcoursbf.com
```

Il n’est pas nécessaire d’acheter un hébergement web classique si Vercel héberge déjà l’app.

### E-mail professionnel

Pour avoir :

```txt
contact@reussiteconcoursbf.com
```

il faut acheter le domaine `reussiteconcoursbf.com`.

Le domaine coûte souvent environ 6 000 à 15 000 FCFA/an selon le fournisseur.

Ensuite, pour la boîte e-mail :

- option gratuite/économique : Zoho Mail ;
- option pro payante : Google Workspace, Microsoft 365, Proton Mail Business ;
- pour envoyer les mails automatiques : Brevo ou Resend.

Conseil :

- garder `reussiteconcoursbf@yahoo.com` comme contact visible pour l’instant ;
- acheter plus tard `reussiteconcoursbf.com` ;
- connecter le domaine à Vercel ;
- configurer `contact@reussiteconcoursbf.com` ;
- configurer Brevo/Resend pour les mails automatiques.

---

## 13. Points sensibles / erreurs déjà rencontrées

### 13.1 Sandbox revenu à d’anciens commits

Très fréquent. Toujours resynchroniser avant modification.

Symptôme :

- `git rev-parse --short HEAD` retourne parfois `ee39d06` ou autre ancien commit ;
- fichiers PWA ou derniers commits manquants ;
- remote `origin` absent.

Solution :

```bash
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/amadoubarry2300-cpu/Concours-BF-.git
git fetch origin main
git reset --hard origin/main
git clean -fd
```

### 13.2 Ne pas réintroduire “archive admin”

Le propriétaire a explicitement refusé :

```txt
Archives admin
archivé dans admin
Archivé admin
```

Utiliser :

```txt
Voir historique publié (nombre)
```

### 13.3 Documents Premium

Erreur corrigée : au départ les documents Premium étaient cachés ou affichés Gratuit selon les anciennes données.

État final : côté candidat, tous les documents/fichiers sont Premium verrouillés.

### 13.4 Ne pas modifier admin sans demande

Le propriétaire a corrigé clairement :

> C'est côté candidat j'ai dit de bloquer fichiers et documents en premium c'est pas côté admin. Ne touche rien à admin si je te demande pas.

À respecter impérativement.

### 13.5 Yahoo e-mail

Yahoo bloque souvent les mots de passe d’application. Ne pas insister longuement sur Yahoo pour l’envoi automatique.

### 13.6 Contenu ancien Physique-Chimie CEP

Un ancien contenu `Physique-Chimie — CEP` a déjà existé en production avant correction des règles. Ne pas supposer que le code nettoie automatiquement les anciens contenus.

---

## 14. Prompts / demandes utilisateur développées ici

Cette section reformule les demandes principales données au fil du projet. Elle peut être copiée dans un nouveau chat.

### Identité / marque

```txt
App name: Réussite Concours BF.
Réussite plus grand, Concours BF plus petit.
Utiliser le logo PNG fourni.
Interface simple, fluide, professionnelle, type iConcours.
Ne pas surcharger.
```

### Contact

```txt
Afficher l’e-mail: reussiteconcoursbf@yahoo.com.
WhatsApp uniquement via bouton flottant à droite.
Bouton WhatsApp ouvre +22674013704.
Ne pas afficher le numéro partout.
```

### Admin historique

```txt
Ne pas écrire Archives admin ou archivé admin.
Quand un document/QCM est publié, il quitte la liste principale admin.
Il apparaît dans Voir historique publié (nombre).
La suppression doit être réelle et persistante.
```

### QCM / IA

```txt
Les QCM IA doivent être 50 par jour.
Ils doivent être de haut niveau, ciblés selon formulaire admin.
Ils doivent être vérifiés, non dupliqués.
Ils ne doivent pas contenir de commentaire interne ou mention IA.
Admin choisit Gratuit ou Premium avant publication.
Niveau prioritaire sur matière/catégorie.
CEP ne doit pas proposer Physique-Chimie.
```

### Documents / fichiers

```txt
Côté candidat, les documents et fichiers doivent être Premium verrouillés.
Les candidats non Premium doivent voir le verrou/upsell.
Ils ne doivent pas ouvrir les fichiers sans abonnement.
Le backend doit bloquer aussi, pas seulement le bouton.
Côté candidat, afficher Ouvrir et non Télécharger.
Ne pas modifier admin sauf demande explicite.
```

### Mobile/PWA

```txt
L’application doit être installable Android.
Elle doit fonctionner avec cache/offline autant que possible.
Les mises à jour doivent arriver rapidement dans l’app installée.
Les contenus Premium ne doivent pas rester accessibles via cache ancien.
```

### Actualités

```txt
Actualités concours via sources officielles Burkina Faso.
Récupérer communiqués PDF quand disponibles.
Éviter doublons et anciennes infos.
Laisser les actualités IA en revue admin avant publication.
```

### Domaine/e-mail

```txt
On peut garder Vercel et acheter un domaine plus tard.
Le domaine peut pointer vers Vercel.
L’e-mail professionnel nécessite un domaine.
Yahoo peut rester contact visible.
Pour mails automatiques, utiliser plus tard Brevo/Resend ou autre service.
```

---

## 15. Prompt de reprise pour nouveau chat

Copier-coller ce bloc dans un nouveau chat pour reprendre sans se perdre :

```txt
Je travaille sur le projet Réussite Concours BF, une application web/mobile installable Android pour préparation aux concours au Burkina Faso.

Dépôt GitHub : https://github.com/amadoubarry2300-cpu/Concours-BF-.git
Production : https://concoursbf-fawn.vercel.app
Dernier build vérifié : candidate-docs-premium-lock-1
Dernier commit important : 0991451 Gate candidate documents behind Premium

Stack : frontend HTML/CSS/JS vanilla, backend Node/Express dans backend/server.js, Supabase pour données/stockage, SasPay pour paiement, Vercel pour hébergement, PWA via manifest.webmanifest et sw.js.

Consignes absolues :
- Ne pas toucher admin sauf demande explicite.
- Côté candidat, Documents & fichiers doit être Premium verrouillé sans abonnement.
- Ne pas utiliser “Archives admin”, “archivé dans admin”, etc. Utiliser “Voir historique publié (nombre)”.
- Interface simple, fluide, professionnelle, pas surchargée.
- App name : Réussite Concours BF.
- Contact visible : reussiteconcoursbf@yahoo.com.
- WhatsApp flottant à droite : +22674013704, sans afficher le numéro partout.
- Côté candidat, fichiers : bouton Ouvrir, pas Télécharger.
- Backend doit appliquer les verrous Premium.
- Mobile/PWA doit recevoir les updates rapidement et ne pas garder de contenu Premium en cache.

Avant de modifier : vérifier git status, HEAD, remote. Le sandbox peut revenir à un vieux commit. Si besoin :
cd /home/user/fasoprepa
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/amadoubarry2300-cpu/Concours-BF-.git
git fetch origin main
git reset --hard origin/main
git clean -fd

Validation habituelle :
node --check backend/server.js
node --check js/app.js
node --check backend/public/js/app.js
node --check sw.js
node --check backend/public/sw.js
python3 -m py_compile tools/audit_premium_lock.py
git diff --check
python3 tools/audit_premium_lock.py https://concoursbf-fawn.vercel.app

Fichiers importants :
backend/server.js
js/app.js
backend/public/js/app.js
index.html
backend/public/index.html
css/styles.css
backend/public/css/styles.css
sw.js
backend/public/sw.js
manifest.webmanifest
backend/public/manifest.webmanifest
tools/audit_premium_lock.py
content/qcm/MISE_A_JOUR_APPLICATION_QCM.md

Dernier audit production : resources 4 candidate premium locked 4, qcm publications 6 premium locked 0, questions 1580 premium leaked 0, AUDIT OK.
```

---

## 16. Requêtes utiles pour vérifier la production

### Santé

```bash
curl -s https://concoursbf-fawn.vercel.app/health | python3 -m json.tool
```

### Ressources candidat

```bash
curl -s https://concoursbf-fawn.vercel.app/api/resources | python3 -m json.tool
```

Attendu actuellement sans Premium :

- `premiumIncluded:false`
- chaque resource :
  - `is_premium:true`
  - `locked:true`

### Test téléchargement bloqué

Remplacer `ID` par un id de ressource :

```bash
curl -i https://concoursbf-fawn.vercel.app/api/resources/ID/download
```

Attendu sans Premium :

```txt
HTTP/2 402
{"message":"Ce document est réservé aux comptes Premium"}
```

### QCM publications

```bash
curl -s https://concoursbf-fawn.vercel.app/api/qcm-publications | python3 -m json.tool
```

### Questions non-Premium

```bash
curl -s https://concoursbf-fawn.vercel.app/api/questions | python3 - <<'PY'
import sys,json
data=json.load(sys.stdin)
qs=data.get('questions',[])
print('count', len(qs), 'premium', sum(1 for q in qs if q.get('is_premium')))
PY
```

### Service worker

```bash
curl -s https://concoursbf-fawn.vercel.app/sw.js?v=candidate-docs-premium-lock-1 | grep -E "candidate-docs|X-Premium|CLEAR_DATA_CACHE|networkFirstFile"
```

---

## 17. Prochaines orientations possibles

### Court terme

1. Tester sur téléphone candidat non connecté/non Premium :
   - Documents & fichiers : Premium / Débloquer Premium.
2. Tester un compte Premium réel après paiement :
   - Documents s’ouvrent.
3. Vérifier installation Android depuis Chrome.
4. Vérifier que l’app installée recharge le nouveau build.

### Moyen terme

1. Acheter un domaine : `reussiteconcoursbf.com` si disponible.
2. Connecter ce domaine à Vercel.
3. Créer `contact@reussiteconcoursbf.com`.
4. Configurer Brevo/Resend pour mails automatiques.
5. Garder Yahoo comme contact visible ou secours.

### Contenu

1. Publier régulièrement 10 QCM gratuits/jour.
2. Créer des lots Premium par niveau/matière.
3. Alimenter Documents & fichiers avec PDF professionnels.
4. Vérifier l’absence de doublons.
5. Nettoyer anciens contenus incohérents comme Physique-Chimie CEP si nécessaire.

### Technique

1. Ajouter tests automatiques plus complets.
2. Ajouter une vraie CI GitHub Actions pour :
   - `node --check` ;
   - audit scripts ;
   - lint minimal ;
   - contrôle du build marker.
3. Améliorer les logs admin et paiement.
4. Préparer un vrai environnement domaine/e-mail.

---

## 18. Règles pour éviter de se perdre à long terme

1. Toujours commencer par vérifier le commit actuel.
2. Ne jamais modifier sur un vieux HEAD.
3. Travailler par petites corrections.
4. Toujours valider localement avant push.
5. Toujours attendre `/health` après push.
6. Toujours tester côté candidat après une modification visible.
7. Toujours garder l’admin stable si la demande concerne candidat.
8. Toujours bumper le build/cache PWA après modification frontend ou cache.
9. Toujours documenter les changements dans `content/qcm/MISE_A_JOUR_APPLICATION_QCM.md` ou dans ce bilan si majeur.
10. Ne jamais mettre de secrets/API keys dans un fichier du dépôt.

---

## 19. Fichiers/secrets à ne pas publier

Ne jamais écrire dans GitHub :

- clés Supabase service role ;
- clés SasPay ;
- clés Gemini ;
- clés SMTP/Brevo/Resend ;
- token GitHub ;
- mots de passe Yahoo/Google ;
- fichiers `.env` contenant secrets.

Les variables doivent rester dans Vercel/Supabase/GitHub secrets selon le cas.

---

## 20. Conclusion

Le projet **Réussite Concours BF** est déjà une base solide :

- application candidate fonctionnelle ;
- paiement Premium intégré ;
- documents verrouillés Premium côté candidat ;
- backend protecteur ;
- PWA Android installable ;
- admin riche ;
- QCM/IA/PDF ;
- historique publié ;
- suppression persistante ;
- actualités officielles ;
- audit reproductible.

Pour continuer ailleurs, utiliser le **prompt de reprise** de la section 15 et garder ce fichier comme référence centrale.
