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


## 2026-09-22 — Test admin des notifications

- Ajout d'un onglet admin **Notifications**.
- Ajout d'un statut e-mail/SMS sans révéler les secrets.
- Ajout d'un envoi de test e-mail/SMS réservé à l'administrateur.


## 2026-09-22 — Libellé e-mail simplifié

- Le champ d'inscription affiche maintenant **Adresse e-mail** pour accepter Gmail, Yahoo ou toute autre adresse valide.


## 2026-09-22 — Correction stockage documents

- Correction du premier chargement des documents lorsque le bucket Supabase vient d'être créé et que le fichier d'index n'existe pas encore.
- `/api/resources` renvoie maintenant une liste vide au lieu d'une erreur tant qu'aucun document n'est publié.


## 2026-09-22 — Nouveau logo

- Remplacement du logo principal et du favicon par le nouveau logo fourni par le propriétaire.
- Le logo est synchronisé dans l'application frontend et dans le dossier public du backend.


## 2026-09-22 — Ajustement premium du titre

- Le mot **Réussite** est agrandi.
- **Concours BF** est légèrement réduit pour donner une hiérarchie plus premium dans la barre supérieure.


## 2026-09-22 — Profil premium et accueil personnalisé

- Le nom complet du candidat est utilisé dans le profil et dans le bouton compte.
- Message personnalisé après inscription : bienvenue au candidat avec son nom complet.
- Message personnalisé après reconnexion : bon retour avec le nom complet.
- Ajout d'un compteur Premium dans le compte avec jours restants et date de renouvellement.
- Ajout de bulles animées légères sur certains blocs pour un rendu plus premium sans surcharger l'interface.


## 2026-09-22 — Compte Pro admin et Accès complet

- Le compte administrateur est affiché comme **Compte Pro administrateur** avec badge **Pro**.
- Le compte administrateur bénéficie de l'accès complet sans devoir souscrire à Premium.
- Le menu du bas remplace **Accès** par **🔓 Accès complet** avec une taille adaptée pour rester lisible.


## 2026-09-22 — Accès complet QCM pour admin

- Correction de `/api/questions` : le compte administrateur/pro reçoit maintenant toute la banque 5000 QCM, comme un accès complet.
- Les matières Premium affichées dans Formations ouvrent bien leurs QCM pour l'administrateur.


## 2026-09-22 — Bouton WhatsApp flottant

- Ajout d'un bouton WhatsApp flottant à droite de l'application.
- Le numéro n'est pas affiché à l'écran ; le clic ouvre directement WhatsApp pour contacter le support.

## 2026-09-22 — Actualités concours et communiqués

- Ajout d'une section publique **Actualités concours** pour les recrutements, communiqués, résultats, calendriers et dates limites.
- Ajout d'un onglet admin **Actualités** pour créer, modifier, masquer/publier et supprimer les annonces.
- Les actualités sont stockées côté serveur via Supabase Storage, comme les documents, sans exposer de clé secrète.
- Ajout de filtres publics : Tout, Concours, Recrutement et Communiqué.

## 2026-09-22 — PDF joint aux communiqués

- Ajout d'un champ **Communiqué PDF** dans le formulaire admin des actualités.
- Les communiqués peuvent maintenant être publiés avec un PDF joint.
- Les candidats voient un bouton **Ouvrir le PDF** dans l'actualité publiée.

## 2026-09-22 — IA QCM Gemini dans l'admin

- Ajout d'un onglet **IA QCM** dans l'espace administrateur.
- L'IA génère des QCM en brouillon selon catégorie, niveau, thème et nombre demandé.
- Les brouillons restent sous contrôle administrateur : vérifier/modifier, publier, publier tout ou retirer.
- L'accès utilise `GEMINI_API_KEY` côté serveur uniquement, sans exposer la clé dans le frontend.


## 2026-09-23 — Correction modèles IA Gemini

- L'intégration IA détecte automatiquement les modèles Gemini disponibles pour la clé API.
- Les anciens noms de modèles indisponibles ne bloquent plus la génération.
- Le message d'erreur affiché à l'admin est maintenant clair et non technique.

## 2026-09-23 — Séparation claire Gratuit / Premium dans l’admin

- L’onglet **Mes QCM** sépare maintenant les QCM gratuits, Premium et masqués.
- Ajout de filtres rapides : Tout, Gratuit, Premium, Masqué.
- Après publication d’un brouillon IA, l’admin voit clairement la destination : **Mes QCM → Gratuit** ou **Mes QCM → Premium**.
- L’écran Formations affiche aussi un rappel simple des zones gratuites et Premium.

## 2026-09-23 — QCM publiés, cadenas Premium et veille IA concours

- Les formations Premium affichent maintenant clairement un cadenas et un badge **Premium**.
- Les blocs **Gratuit** et **Premium** ont des boutons pour filtrer rapidement les contenus accessibles.
- Le défi gratuit quotidien est réglé sur **10 QCM gratuits par jour**.
- Ajout d’un écran public **QCM publiés** : chaque publication affiche son nom, sa date, sa catégorie, son niveau et un bouton pour commencer le quiz.
- Les QCM ajoutés par l’admin et les brouillons IA publiés proposent un bouton pour ouvrir directement les QCM publiés côté candidat.
- Ajout d’un logo IA dans le panel admin et d’une veille IA qui prépare des brouillons d’actualités à partir de sources officielles, sans publication automatique.

## 2026-09-23 — Retour après quiz

- Le bouton fermer pendant un quiz et le bouton retour après résultat renvoient maintenant vers l’écran d’origine.
- Exemple : un QCM lancé depuis **Formations** revient à Formations, un QCM lancé depuis **QCM publiés** revient à QCM publiés, au lieu de revenir toujours à l’accueil.

## 2026-09-23 — Abonnements mensuel et annuel

- Ajout de deux offres Premium : **mensuel 1 500 FCFA** et **annuel 10 000 FCFA**.
- L’offre annuelle affiche l’ancien total **18 000 FCFA**, la réduction **8 000 FCFA**, l’accès 12 mois, toutes les formations, QCM/exercices et examens blancs.
- La page paiement est mieux organisée : choix de l’abonnement, réseaux Mobile Money plus compacts côte à côte, bouton dynamique **S’abonner / mois** ou **S’abonner / an**.
- Le backend SasPay accepte maintenant le montant et la durée correspondant à l’offre choisie.

## 2026-09-23 — IA actualités à jour et QCM depuis PDF

- La veille IA des concours filtre maintenant les anciennes actualités : pas de communiqués 2024/2025 si l’année courante est 2026, et pas d’inscriptions avec date limite déjà dépassée.
- Le prompt IA reçoit la date du jour et demande uniquement des brouillons issus de sources officielles à jour.
- Ajout d’un champ **PDF source** dans **IA QCM** : l’admin peut joindre un PDF, et Gemini génère des QCM brouillons à partir du document.
- Les QCM issus d’un PDF restent non publiés tant que l’admin ne les vérifie pas.

## 2026-09-23 — Animations premium et adresse confidentialité

- Ajout d’animations plus fluides sur les blocs, boutons, images et cartes principales pour donner une impression plus premium sans surcharger l’interface.
- Ajout d’une mini animation visuelle sur l’accueil pour dynamiser les blocs d’image.
- Ajout de l’adresse **Réussite Concours BF — Ouagadougou, Burkina Faso** dans la politique de confidentialité.

## 2026-09-23 — Nettoyage des textes d’interface

- Suppression du bloc d’accueil qui affichait une consigne interne de type “mini vidéo animée”.
- Conservation des animations premium directement sur les cartes, images et boutons, sans texte technique visible pour les candidats.
- Vérification des textes visibles pour éviter d’afficher les demandes de conception dans l’application.

## 2026-09-23 — Interface candidat nettoyée

- Nettoyage supplémentaire des textes visibles pour éviter les mentions techniques ou les consignes de conception.
- Remplacement des formulations trop techniques par des textes simples côté candidat et côté administration.
- Conservation des effets visuels premium sans ajouter de bloc explicatif inutile.

## 2026-09-23 — Libellé Nouveaux QCM

- Remplacement du titre **Quiz ajoutés par l’administration** par **Nouveaux QCM** dans l’écran des QCM publiés.
- Remplacement du texte d’accueil **Nouveaux quiz** par **Nouveaux QCM** pour garder un vocabulaire cohérent.

## 2026-09-23 — Adresse e-mail de contact

- Remplacement de l’e-mail de contact affiché par **reussiteconcoursbf@yahoo.com** dans le pied de page, les mentions et la page contact.

## 2026-09-23 — Écran Nouveaux QCM

- Renommage complet des libellés visibles **QCM publiés** en **Nouveaux QCM** sur l’accueil, l’en-tête de l’écran, les boutons et les messages de chargement.
- L’e-mail de contact Yahoo reste affiché dans le pied de page, les mentions et la page contact.

## 2026-09-23 — Nettoyage espace candidat

- Suppression des phrases inutiles sur l’écran **Nouveaux QCM** : plus de mention “classés par nom et date” ni “Chaque publication porte un nom et une date”.
- Nettoyage du bloc **Documents & fichiers** : remplacement de “PDF, Word et images publiés” par une formulation orientée révision.
- Nettoyage des textes candidats qui mentionnaient inutilement “publié par l’administration” ou “document publié”.

## 2026-09-23 — Bloc Premium reformulé

- Le bloc supérieur de l’écran **Accès complet** ne répète plus le prix de l’abonnement mensuel.
- Il présente maintenant clairement l’intérêt de Premium : 5000 QCM, matières avancées, examens blancs, erreurs et progression.
- Ajout d’une image d’arrière-plan très transparente dans le bloc Premium, avec texte lisible et rendu plus professionnel.
- Les cartes d’abonnement en bas restent inchangées.

## 2026-09-23 — Bouton WhatsApp déplaçable

- Le bouton WhatsApp flottant peut maintenant être déplacé par glisser-déposer sur l’écran.
- Sa position est mémorisée sur le téléphone/navigateur du candidat.
- Un simple toucher continue d’ouvrir WhatsApp normalement.

## 2026-09-23 — Tableau de bord candidat

- Ajout d’un tableau de bord sur l’accueil pour les candidats connectés.
- Il affiche les QCM faits, le taux de réussite, le niveau, les erreurs à revoir et une priorité de révision.
- Ajout de boutons directs pour le défi du jour, la révision des erreurs, les nouveaux QCM ou la matière prioritaire.

## 2026-09-24 — Fiches de révision courtes

- Ajout d’un écran **Fiches de révision courtes** accessible depuis l’accueil.
- Les candidats peuvent lire des résumés rapides par matière, filtrer par catégorie, puis lancer un QCM lié.
- Ajout d’un suivi local des fiches déjà lues et d’une fiche conseillée selon la priorité de révision.
- Les matières Premium gardent le cadenas au moment de lancer les QCM associés.


## 2026-09-24 — Accueil candidat connecté mieux différencié

- Le tableau de bord candidat apparaît maintenant juste sous le bloc principal de l’accueil après connexion.
- La barre supérieure et le bouton profil changent visuellement quand le candidat est connecté, sans ajouter de bloc inutile au milieu de l’accueil.
- Ajout d’un raccourci **Fiches courtes** dans l’espace compte pour mieux organiser les actions du candidat.


## 2026-09-24 — Accueil transformé en espace candidat connecté

- Quand un candidat est connecté, l’onglet **Accueil** devient **Mon espace**.
- Les blocs publics de présentation sont masqués pour le candidat connecté afin que l’écran commence directement par son tableau de bord et ses outils.
- Le contenu public reste inchangé pour les visiteurs non connectés.

## 2026-09-24 — IA quotidienne QCM PDF

- Ajout d’un bloc admin **QCM PDF quotidiens** dans l’espace IA.
- L’admin peut créer un PDF du jour avec 20 QCM générés par IA, par module ou par niveau selon la rotation configurée.
- Les PDF IA restent des brouillons à relire : rien n’est publié automatiquement côté candidat.
- Après vérification, l’admin peut publier les QCM du PDF en Gratuit ou Premium.
- Ajout d’une route cron quotidienne pour préparer automatiquement le PDF du jour si la clé IA et le stockage sont configurés.

## 2026-09-24 — PDF QCM premium

- Amélioration du PDF quotidien : design plus professionnel avec en-tête Réussite Concours BF, logo, date, module, niveau et cartes de questions.
- Suppression des mentions IA dans le document PDF destiné à la relecture.
- Correction de l’encodage des accents français dans le PDF.

## 2026-09-24 — PDF premium et vérification intégrée

- Nouveau modèle PDF quotidien inspiré des supports de formation : couverture colorée, logo, titre, date, module, niveau et nombre de QCM.
- Les pages QCM sont mieux structurées pour la relecture avec questions, réponses proposées, bonne réponse et correction.
- Le document PDF ne mentionne plus l’IA.
- Ajout d’un écran de vérification PDF dans l’application pour ouvrir le PDF, le relire, le télécharger ou publier les QCM validés.

## 2026-09-24 — Correction aperçu PDF et publication ciblée

- L’aperçu du PDF ne dépend plus du lecteur PDF du navigateur : un aperçu intégré lisible s’ouvre directement dans l’application.
- Ajout d’un bouton séparé **Ouvrir le PDF** pour afficher le fichier complet si le navigateur le permet.
- Agrandissement des écritures dans les pages QCM pour se rapprocher du format du PDF de référence.
- Renforcement du prompt : les QCM quotidiens doivent être de haut niveau, avec raisonnement et pièges réalistes.
- Avant publication, l’admin choisit maintenant la catégorie, le niveau et Gratuit/Premium.

## 2026-09-24 — QCM stricts, 50 questions et veille officielle

- Le PDF quotidien prépare maintenant **50 QCM** au lieu de 20.
- Ajout d’une vérification stricte avant création du PDF : blocage des commentaires internes comme “attention”, “à vérifier”, “brouillon” ou “IA” dans les questions/corrections.
- Ajout d’un contrôle de non-répétition : les QCM générés sont comparés à la banque locale, aux QCM Supabase et aux anciens brouillons pour éviter les doublons ou reformulations trop proches.
- La publication est bloquée si un QCM du PDF existe déjà ou ressemble trop à une question présente dans l’application.
- La mention “Document de révision à vérifier avant publication” a été retirée du document et remplacée par une formulation neutre de préparation.
- La veille actualités consulte davantage de sources officielles du Burkina Faso, prépare des actualités masquées pour validation admin et tente de joindre automatiquement le communiqué PDF officiel quand il est disponible.
- Ajout d’une route cron de veille officielle quotidienne pour préparer les communiqués récents sans publication automatique.

## 2026-09-24 — Correctif génération 50 QCM

- La génération quotidienne ne s’arrête plus après un lot partiellement validé.
- Les 50 QCM sont préparés par petits lots mieux ciblés pour éviter les réponses tronquées et augmenter le nombre de QCM fiables.
- Les anciennes questions de la même catégorie sont davantage prises en compte pour éviter les répétitions, sans bloquer abusivement les questions réellement différentes.

## 2026-09-24 — Fiabilisation finale des 50 QCM

- La liste anti-répétition transmise au modèle est raccourcie pour éviter de saturer la génération.
- Les QCM sont produits par lots plus efficaces avec contrôle interne demandé au modèle et contrôle local strict conservé.
- Le mot “attention” n’est plus rejeté quand il fait partie d’un vrai thème, mais les commentaires internes du type “attention,” restent bloqués.

## 2026-09-24 — Documents PDF quotidiens visibles

- Les PDF quotidiens déjà publiés apparaissent automatiquement dans **Documents & fichiers**, même s’ils ont été publiés avant la synchronisation Documents.
- Le téléchargement public des PDF quotidiens publiés utilise le stockage du brouillon validé si le document n’a pas encore été copié dans l’index Documents.

## 2026-09-24 — Historique PDF admin

- Les PDF quotidiens déjà publiés sont masqués par défaut dans l’administration afin de garder l’espace propre.
- Un bouton **Voir l’historique publié** permet de les revoir au besoin.
- Retirer un PDF publié de l’historique admin conserve les QCM et le document côté candidat.

## 2026-09-24 — Suppression côté candidat

- Ajout d’un bouton **Supprimer chez candidat** dans l’historique des PDF quotidiens publiés.
- Cette action retire le groupe de QCM de **Nouveaux QCM** et le PDF de **Documents & fichiers**.
- Le PDF reste disponible dans l’administration pour correction, republication ou suppression complète.

## 2026-09-24 — Niveau prioritaire et historique multi-PDF

- Les matières proposées dépendent maintenant du niveau sélectionné : par exemple **CEP** ne propose plus **Physique-Chimie**.
- La génération quotidienne garde plusieurs PDF le même jour si le niveau ou la matière change ; un nouveau PDF ne remplace plus les autres PDF du jour.
- L’historique admin et Documents récupèrent aussi les PDF quotidiens déjà publiés qui existent dans Documents ou dans les QCM publiés mais avaient disparu de la liste IA.

## 2026-09-25 — Formules lisibles et IA mieux ciblée

- Les QCM affichent maintenant les puissances, racines, fractions et symboles mathématiques/scientifiques de façon lisible dans l’application.
- Les textes techniques inutiles comme **Destination après validation** ont été retirés des propositions IA.
- Le formulaire IA est mieux respecté : nom du QCM, thème, catégorie et niveau guident davantage la génération.
- Les actions publier/supprimer mettent à jour l’écran plus rapidement, puis rechargent les listes en arrière-plan.

## 2026-09-26 — Sélection multiple admin et crons IA

- Ajout de cases de sélection dans **Mes QCM** côté administration.
- Possibilité de publier, masquer ou supprimer plusieurs QCM sélectionnés en une seule action.
- Les propositions IA peuvent aussi être sélectionnées pour publier ou retirer seulement une partie du lot.
- Les multiplications écrites avec `*` sont affichées et normalisées en `×` dans les contenus éducatifs.
- Les crons IA acceptent correctement les appels officiels Vercel Cron même lorsqu’un secret cron est configuré.
- Les horaires quotidiens IA QCM et veille officielle sont réglés tôt le matin pour préparer les contenus à relire.
