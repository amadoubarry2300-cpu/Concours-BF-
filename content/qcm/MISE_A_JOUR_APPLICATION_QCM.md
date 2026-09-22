# Mise à jour application — 5000 QCM intégrés

## Ce qui a été fait

- Les **5000 QCM corrigés détaillés** ont été intégrés directement dans l’application.
- Le fichier principal `js/questions.js` contient maintenant les 5000 questions.
- Le miroir Vercel/backend `backend/public/js/questions.js` contient aussi les 5000 questions.
- L’accès est ouvert en attendant : pas de blocage Premium sur les matières, les quiz 20/40 questions, les examens blancs, les erreurs ou les statistiques.
- Les écrans paiement/abonnement restent présents dans la structure mais l’interface affiche que le paiement est en pause.

## Contrôles

```text
Questions: 5000
Validées: 5000
Erreurs: 0
Avertissements: 0
```

Contrôle JavaScript effectué :

```text
js/app.js: OK
backend/public/js/app.js: OK
js/questions.js: 5000 questions
backend/public/js/questions.js: 5000 questions
backend/server.js: OK
```

## Répartition intégrée

- Mathématiques : 1200
- Psychotechnique : 1000
- Français : 900
- Burkina Faso : 500
- Histoire-Géo : 500
- Culture générale : 400
- SVT : 300
- Greffier / Droit : 200

## Important

- Aucun import Supabase réel n’a été lancé.
- Aucun paiement n’a été activé.
- La vente reste en pause.
- Quand le propriétaire voudra vendre, il faudra repasser en mode protégé : gratuit dans le JS public, Premium via Supabase/backend.

## Correction interface après vérification

L’interface a été ajustée pour ne plus donner l’impression que l’application contient seulement 10 QCM :

- Les formations affichent maintenant le nombre total disponible par matière, par exemple 1200 QCM en Mathématiques.
- Les boutons de formation lancent une session de 40 QCM par défaut au lieu de 10.
- Le quiz rapide propose désormais 10, 20, 40, 100 ou toutes les questions disponibles.
- Le choix de révision propose aussi 100 QCM et « Tous ».
- Les fichiers JavaScript sont chargés avec une nouvelle version `qcm5000-2` pour éviter que le navigateur garde l’ancien cache.

## Correction définitive affichage « session 40 »

Après retour utilisateur, l’interface a été corrigée à nouveau :

- Les cartes Formation n’affichent plus « session 40 QCM ».
- Chaque carte affiche maintenant le total réel et le libellé « ouvrir toute la banque ».
- Un clic sur une formation ouvre toutes les questions de la catégorie, par exemple 1200 en Mathématiques ou 1000 en Psychotechnique.
- La fusion avec d’anciennes questions Supabase est désactivée pendant le mode accès ouvert pour éviter les totaux incohérents comme 501 au lieu de 500.
- Nouvelle version de cache : `qcm5000-3`.


## Premium réactivé avec SasPay

- Le mode accès ouvert a été désactivé.
- Le JavaScript public est revenu aux questions gratuites uniquement : Burkina Faso, Histoire-Géo et Culture générale.
- La banque complète des 5000 QCM est disponible côté backend dans `backend/data/qcm_bank_5000_v1.json`.
- Le backend sert les questions Premium uniquement aux comptes ayant un abonnement actif.
- Paiement SasPay ajouté : softpay Mobile Money Burkina Faso.
- Réseaux configurés : `orange_bf` pour Orange Money, `moov_bf` pour Moov Money.
- Montant Premium : 1500 FCFA pour 30 jours.
- La clé API SasPay doit être stockée dans Vercel comme variable `SASPAY_API_KEY`, jamais dans GitHub.
- Webhook recommandé : `https://concoursbf-fawn.vercel.app/api/payments/saspay/webhook` avec event `transaction.success` et secret `SASPAY_WEBHOOK_SECRET`.


## Correction SasPay 422

- L’email technique envoyé à SasPay utilise maintenant un domaine valide `concoursbf.app` au lieu d’un domaine local.
- Le bouton test est désactivé en production.
- Le message d’intégration affiche maintenant SasPay au lieu de l’ancien texte CinetPay.
- Si le push direct Mobile Money renvoie une erreur 422, le backend bascule automatiquement vers le checkout hébergé SasPay pour permettre au client de finaliser le paiement.
- Le bouton « Vérifier mon paiement » sait maintenant vérifier aussi une session checkout SasPay.
- Nouvelle version cache : `premium-saspay-2`.

## Correction redirection SasPay

- Le backend accepte maintenant les réponses SasPay enveloppées dans `data`.
- Le lien `checkout_url` est extrait même quand SasPay le retourne dans une enveloppe.
- Si SasPay ne renvoie vraiment aucun lien de checkout, l’application affiche une erreur claire au lieu de dire de vérifier le téléphone.
- Nouvelle version cache : `premium-saspay-3`.

## Nettoyage interface paiement

- Suppression du bloc technique visible sous le paiement.
- Suppression du bouton test caché dans la page de paiement.
- Remplacement du message technique « variables SASPAY / Vercel » par une instruction simple pour l’utilisateur.
- Mentions légales nettoyées pour éviter l’affichage de détails d’hébergement et de code source.
- Nouvelle version cache : `premium-saspay-4`.

## 2026-09-22 — Espace administrateur de publication

- Ajout d'un écran **Administration** dans l'ancien parcours compte, visible uniquement pour les comptes autorisés.
- Ajout d'un formulaire simple pour publier un QCM : catégorie, niveau, question, 4 choix, bonne réponse, correction, source/note, Premium ou gratuit, publié ou masqué.
- Ajout d'une liste des publications admin avec recherche, modification, masquage/publication et suppression.
- Ajout d'API backend protégées `/api/admin/*` ; accès autorisé par rôle `admin` ou par la variable serveur `ADMIN_PHONES`.
- Les QCM admin publiés sont fusionnés automatiquement avec la banque existante via `/api/questions`, sans modifier le code à chaque publication.
- L'interface Premium/SasPay reste inchangée côté utilisateur.

## 2026-09-22 — Documents admin et libellé administrateur

- Le compte administrateur affiche maintenant **Espace administrateur** avec badge **Admin**.
- Ajout d'une section **Documents & fichiers** côté candidat.
- Ajout d'un onglet **Documents** dans l'administration pour publier PDF, Word/DOCX et images.
- Les documents peuvent être gratuits ou Premium, publiés ou masqués.
- Les fichiers sont stockés côté serveur via Supabase Storage et téléchargés par l'application sans exposer de clé secrète.

## 2026-09-22 — E-mail obligatoire et notifications

- Ajout d'un champ **adresse e-mail / Gmail** obligatoire à l'inscription.
- Ajout d'astérisques rouges sur les champs obligatoires de l'inscription.
- Affichage de l'e-mail dans les informations du compte.
- Préparation des notifications : SMS après inscription et confirmation e-mail/SMS après activation Premium, via variables serveur sécurisées.
- La confirmation Premium utilise l'e-mail du profil ou l'e-mail envoyé au moment du paiement.
