# Guide d’import Supabase — Banque 5000 QCM v1

Ce guide prépare l’étape d’intégration dans l’application **Réussite Concours BF** sans importer automatiquement les données.

## État actuel

- Banque complète validée : `content/qcm/qcm_bank_5000_v1.csv`
- CSV prêt pour Supabase : `content/qcm/qcm_bank_5000_v1_supabase.csv`
- Questions intégrées directement au JavaScript : `js/questions.js` (**5000 QCM**)
- Questions intégrées dans le miroir backend : `backend/public/js/questions.js` (**5000 QCM**)
- Import réel Supabase : **non exécuté**
- Paiement / vente : **non activé**

## Pourquoi deux fichiers CSV ?

Le fichier éditorial `qcm_bank_5000_v1.csv` contient aussi `review_status`, utile pour la production et la validation.

La table Supabase `questions` n’a pas cette colonne. Le fichier `qcm_bank_5000_v1_supabase.csv` contient seulement les colonnes attendues :

```text
category, level, question_text, option_a, option_b, option_c, option_d,
correct_answer, explanation, is_premium, is_active, source
```

## Commandes préparées

### 1. Revalider la banque éditoriale

```bash
./tools/validate_qcm_bank.py content/qcm/qcm_bank_5000_v1.csv
```

Résultat attendu :

```text
Questions: 5000
Validées: 5000
Erreurs: 0
Avertissements: 0
```

### 2. Régénérer le CSV Supabase

```bash
./tools/export_qcm_for_supabase.py
```

### 3. Simulation d’import

```bash
python3 tools/import_qcm_to_supabase.py --csv content/qcm/qcm_bank_5000_v1_supabase.csv
```

Cette commande ne modifie rien. Elle affiche seulement le nombre de lignes prêtes à importer.

### 4. Import réel — à faire seulement après accord

Ne pas lancer sans décision explicite, car cela ajoute les questions dans la base.

```bash
SUPABASE_URL="https://scnhrcjhxqzetkrhhong.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="..." \
python3 tools/import_qcm_to_supabase.py \
  --csv content/qcm/qcm_bank_5000_v1_supabase.csv \
  --delete-existing-batch qcm_bank_5000_v1 \
  --execute
```

## Mode actuel dans l’application

À la demande du propriétaire, les **5000 QCM** sont actuellement intégrés directement dans l’application et ouverts à la révision, car la vente et le paiement restent en pause.

Répartition intégrée :

- Mathématiques : 1200
- Psychotechnique : 1000
- Français : 900
- Burkina Faso : 500
- Histoire-Géo : 500
- Culture générale : 400
- SVT : 300
- Greffier / Droit : 200

Le champ technique `premium` reste conservé dans `js/questions.js` pour faciliter une séparation future. Si la vente est réactivée, il faudra repasser en mode protégé : questions gratuites dans le JavaScript public, questions Premium servies par Supabase + backend après vérification.

## Contrôle après import Supabase

Après import réel, vérifier :

```bash
curl https://concoursbf-fawn.vercel.app/api/questions
```

Puis vérifier dans l’application :

1. Un visiteur non connecté doit voir les questions gratuites.
2. Les questions Premium ne doivent pas être exposées sans droit Premium.
3. Les explications doivent s’afficher après chaque réponse.
4. Les catégories doivent rester cohérentes dans Formations.

## Note importante

Comme l’utilisateur a demandé de ne pas vendre pour le moment, aucune activation paiement/SasPay n’est faite ici. Les écrans de paiement sont mis en pause côté interface, et les QCM sont ouverts en attendant.
