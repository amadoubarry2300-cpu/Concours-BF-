# Réussite Concours BF — déploiement e-mail v20

## Ordre obligatoire

1. Exécuter `backend/email-automation-v20.sql` une seule fois dans Supabase SQL Editor.
2. Vérifier que l’exécution se termine sans erreur.
3. Autoriser temporairement la mise à jour du dépôt GitHub uniquement après explication et accord explicite.
4. Pousser la version v20 sans aucun secret.
5. Attendre le redéploiement Vercel.
6. Vérifier `/health` : `build` doit valoir `email-automation-v20`.
7. Tester dans l’application :
   - inscription avec consentement décoché par défaut ;
   - connexion et alerte de sécurité ;
   - PIN oublié, code reçu, nouveau PIN et révocation des anciennes sessions ;
   - activation ou renouvellement Premium ;
   - préférences e-mail dans Mon compte ;
   - création d’une offre dans Administration → Notifications ;
   - publication d’un QCM et d’un document ;
   - lien de désabonnement.
8. Vérifier le suivi des campagnes et les tâches quotidiennes.
9. Retirer immédiatement toute autorisation GitHub temporaire.

## Secrets

Les variables SMTP déjà configurées dans Vercel ne doivent pas être copiées dans le dépôt ni communiquées dans le chat.
