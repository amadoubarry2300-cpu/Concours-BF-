# Rapport — Banque 5000 QCM corrigés détaillés v1

Banque créée pour **Réussite Concours BF**. Elle regroupe des QCM corrigés avec 4 choix, la bonne réponse, une explication et une source/justification par question.

## Résultat de génération

- Total questions : **5000**
- Format : **CSV** compatible import Supabase progressif
- Validation automatique : **5000 validées, 0 erreur, 0 avertissement**
- Paiement / vente : **non activé**, conformément à la décision de pause
- Recommandation : importer progressivement après revue éditoriale par échantillonnage

## Répartition par catégorie

- Mathématiques: **1200**
- Psychotechnique: **1000**
- Français: **900**
- Burkina Faso: **500**
- Histoire-Géo: **500**
- Culture générale: **400**
- SVT: **300**
- Greffier / Droit: **200**

## Répartition par niveau

- BEPC: **3800**
- Concours: **1200**

## Gratuit / Premium technique

- Premium technique (`is_premium=true`): **3600**
- Gratuit technique (`is_premium=false`): **1400**

> Note : les marqueurs Premium restent seulement des champs techniques dans le CSV. La vente/paiement n’est pas activée.

## Contrôles effectués

- Colonnes obligatoires présentes
- 4 options non vides par question
- Options distinctes
- Réponse correcte entre 0 et 3
- Questions sans doublons textuels
- Explications présentes
- Sources/justifications présentes
- Statut `validated` conforme

## Sources / justifications principales

- Règle scolaire vérifiée mécaniquement: 3100 questions
- Connaissance scolaire stable; à relire avant concours officiel: 1412 questions
- Présidence du Faso, Conseil des ministres du 2 juillet 2025: 473 questions
- Présidence du Faso, Présentation du Burkina Faso: 15 questions

## Fichiers livrés

- `content/qcm/qcm_bank_5000_v1.csv` — banque complète des 5000 QCM
- `tools/generate_qcm_5000_v1.py` — générateur reproductible
- `tools/validate_qcm_bank.py` — validateur qualité CSV
- `content/qcm/SOURCES.md` — registre des sources
- `content/qcm/PLAN_5000_QCM.md` — plan de production initial

## Commande de validation exécutée

```bash
./tools/validate_qcm_bank.py content/qcm/qcm_bank_5000_v1.csv
```

Résultat :

```text
Fichier: content/qcm/qcm_bank_5000_v1.csv
Questions: 5000
Validées: 5000
Erreurs: 0
Avertissements: 0
```

## Note qualité

Les questions de mathématiques, logique/psychotechnique et conjugaison sont générées par règles vérifiables. Les questions factuelles Burkina Faso s’appuient notamment sur les informations officielles recensées dans `SOURCES.md`, dont le découpage administratif 2025. Les autres questions reposent sur des connaissances scolaires stables. Avant une publication définitive à grande échelle, une revue humaine par échantillon reste recommandée, surtout pour les rubriques droit/greffier et actualité.
