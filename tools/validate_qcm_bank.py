#!/usr/bin/env python3
import csv, sys, re
from pathlib import Path

REQUIRED = [
    'category','level','question_text','option_a','option_b','option_c','option_d',
    'correct_answer','explanation','is_premium','source','review_status'
]
ALLOWED_STATUS = {'validated','needs_review','rejected'}
ALLOWED_BOOL = {'true','false','True','False','0','1'}

def norm(s):
    return re.sub(r'\s+', ' ', (s or '').strip().lower())

def validate(path):
    errors=[]; warnings=[]; seen={}; count=0; validated=0
    with open(path, newline='', encoding='utf-8') as f:
        reader=csv.DictReader(f)
        missing=[c for c in REQUIRED if c not in (reader.fieldnames or [])]
        if missing:
            errors.append(f'Colonnes manquantes: {missing}')
            return count, validated, errors, warnings
        for i,row in enumerate(reader, start=2):
            count += 1
            q=(row.get('question_text') or '').strip()
            if len(q) < 12:
                errors.append(f'Ligne {i}: question trop courte')
            key=norm(q)
            if key in seen:
                errors.append(f'Ligne {i}: doublon avec ligne {seen[key]}')
            else:
                seen[key]=i
            opts=[(row.get(f'option_{x}') or '').strip() for x in 'abcd']
            if any(not o for o in opts):
                errors.append(f'Ligne {i}: option vide')
            if len(set(map(norm, opts))) != 4:
                errors.append(f'Ligne {i}: options non distinctes')
            try:
                a=int(row.get('correct_answer',''))
                if a not in range(4): raise ValueError
            except Exception:
                errors.append(f'Ligne {i}: correct_answer doit être 0,1,2,3')
                a=None
            exp=(row.get('explanation') or '').strip()
            if len(exp) < 25:
                warnings.append(f'Ligne {i}: explication courte')
            if row.get('is_premium','') not in ALLOWED_BOOL:
                errors.append(f'Ligne {i}: is_premium invalide')
            if row.get('review_status','') not in ALLOWED_STATUS:
                errors.append(f'Ligne {i}: review_status invalide')
            if row.get('review_status') == 'validated':
                validated += 1
            if not (row.get('source') or '').strip():
                warnings.append(f'Ligne {i}: source vide')
    return count, validated, errors, warnings

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: validate_qcm_bank.py fichier.csv', file=sys.stderr)
        sys.exit(2)
    count, validated, errors, warnings = validate(sys.argv[1])
    print(f'Fichier: {sys.argv[1]}')
    print(f'Questions: {count}')
    print(f'Validées: {validated}')
    print(f'Erreurs: {len(errors)}')
    print(f'Avertissements: {len(warnings)}')
    for e in errors[:40]: print('ERROR:', e)
    for w in warnings[:20]: print('WARN:', w)
    sys.exit(1 if errors else 0)
