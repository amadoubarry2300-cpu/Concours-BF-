# Plan de production — 5000 QCM corrigés Réussite Concours BF

Je ne dois pas inventer 5000 questions d'un seul coup sans contrôle. La production doit être faite par lots validés.

## Répartition cible

| Domaine | Nombre cible | Priorité |
|---|---:|---|
| Burkina Faso / Institutions / régions / provinces | 700 | Très haute |
| Culture générale 2020-2027 | 700 | Haute |
| Histoire-Géographie | 650 | Haute |
| Français | 600 | Haute |
| Mathématiques | 650 | Haute |
| SVT | 450 | Moyenne |
| Psychotechnique / logique | 600 | Haute |
| Concours professionnels / Greffier / Droit | 450 | Haute |
| Sujets BAC / BEPC / examens blancs | 200 | Moyenne |
| **Total** | **5000** |  |

## Processus qualité

1. Collecter sources fiables.
2. Créer un lot CSV.
3. Valider avec `tools/validate_qcm_bank.py`.
4. Corriger doublons et erreurs.
5. Importer dans Supabase seulement après validation.
6. Garder une trace des sources.

## Format CSV

Colonnes :

```text
category,level,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium,source,review_status
```

`correct_answer` :

```text
0 = A
1 = B
2 = C
3 = D
```

`review_status` :

```text
validated
needs_review
rejected
```
