# Sources utilisées pour la banque QCM

Objectif : chaque question factuelle doit pouvoir être reliée à une source fiable. Les questions de calcul/logique sont vérifiées mécaniquement par script.

## Sources Burkina Faso

1. Présidence du Faso — Conseil des ministres du 2 juillet 2025  
   URL : https://www.presidencedufaso.bf/conseil-des-ministres-du-2-juillet-2025/  
   Utilisation : nouveau découpage administratif, passage à 17 régions et 47 provinces, nouvelles régions, nouvelles provinces, toponymes endogènes.

2. Présidence du Faso — Présentation du Burkina Faso  
   URL : https://www.presidencedufaso.bf/presentation/  
   Utilisation : situation géographique, superficie, pays frontaliers.

## Sources générales stables

Les questions de mathématiques, psychotechnique et grammaire française sont générées à partir de règles vérifiables : calculs exacts, définitions scolaires, accords et conjugaisons usuels. Elles doivent être contrôlées par le script de validation avant import.

## Règle de production

- Pas d'import dans Supabase sans validation CSV.
- Pas de questions d'actualité sans source récente.
- Les questions incertaines sont marquées `needs_review` et ne doivent pas être importées.
