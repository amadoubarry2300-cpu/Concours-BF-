# Guide d’import Supabase — Banque 5000 QCM v1

Ce guide prépare l’étape d’intégration dans l’application **Réussite Concours BF** sans importer automatiquement les données.

## État actuel

- Banque complète validée : `content/qcm/qcm_bank_5000_v1.csv`
- CSV prêt pour Supabase : `content/qcm/qcm_bank_5000_v1_supabase.csv`
- Questions publiques intégrées au JavaScript : `js/questions.js`
- Questions publiques dans le miroir backend : `backend/public/js/questions.js`
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

## Protection des questions Premium

Le fichier public `js/questions.js` contient uniquement les questions gratuites :

- Burkina Faso : 500
- Histoire-Géo : 500
- Culture générale : 400

Total public embarqué : **1400 questions gratuites**.

Les **3600 questions Premium** ne sont pas exposées dans le JavaScript public. Elles restent dans le CSV complet et devront être servies par le backend après import Supabase, avec vérification du compte Premium si la vente est activée plus tard.

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

Comme l’utilisateur a demandé de ne pas vendre pour le moment, aucune activation paiement/SasPay n’est faite ici.
