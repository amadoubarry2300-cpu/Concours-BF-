#!/usr/bin/env python3
"""Import contrôlé de la banque QCM dans Supabase.

Sécurité : par défaut ce script est en mode simulation. Il n'écrit rien dans Supabase
sans l'option explicite `--execute`.

Variables d'environnement attendues pour exécuter réellement :
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
"""
import argparse
import csv
import json
import os
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

SUPABASE_FIELDS = [
    'category','level','question_text','option_a','option_b','option_c','option_d',
    'correct_answer','explanation','is_premium','is_active','source'
]


def as_bool(value):
    value = str(value).strip().lower()
    if value in {'true', '1', 'yes', 'oui'}:
        return True
    if value in {'false', '0', 'no', 'non'}:
        return False
    raise ValueError(f'Booléen invalide: {value}')


def load_rows(path: Path, limit: int | None = None):
    with path.open(newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        missing = [c for c in SUPABASE_FIELDS if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f'Colonnes manquantes dans {path}: {missing}')
        rows = []
        for row in reader:
            rows.append({
                'category': row['category'].strip(),
                'level': row['level'].strip() or None,
                'question_text': row['question_text'].strip(),
                'option_a': row['option_a'].strip(),
                'option_b': row['option_b'].strip(),
                'option_c': row['option_c'].strip(),
                'option_d': row['option_d'].strip(),
                'correct_answer': int(row['correct_answer']),
                'explanation': row['explanation'].strip(),
                'is_premium': as_bool(row['is_premium']),
                'is_active': as_bool(row.get('is_active', 'true')),
                'source': row['source'].strip(),
            })
            if limit and len(rows) >= limit:
                break
    return rows


def chunks(items, size):
    for i in range(0, len(items), size):
        yield i, items[i:i+size]


def request_json(url, key, method='GET', body=None, prefer='return=minimal'):
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
    }
    if prefer:
        headers['Prefer'] = prefer
    data = None if body is None else json.dumps(body).encode('utf-8')
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=60) as res:
            raw = res.read().decode('utf-8')
            return raw
    except HTTPError as e:
        detail = e.read().decode('utf-8', errors='replace')
        raise RuntimeError(f'Erreur Supabase HTTP {e.code}: {detail}') from e
    except URLError as e:
        raise RuntimeError(f'Connexion Supabase impossible: {e}') from e


def main():
    parser = argparse.ArgumentParser(description='Importer la banque QCM dans Supabase en lots contrôlés.')
    parser.add_argument('--csv', default='content/qcm/qcm_bank_5000_v1_supabase.csv')
    parser.add_argument('--chunk-size', type=int, default=250)
    parser.add_argument('--limit', type=int, default=0, help='Limiter le nombre de lignes importées, utile pour un test.')
    parser.add_argument('--execute', action='store_true', help='Écrire réellement dans Supabase. Sans cette option: simulation.')
    parser.add_argument('--delete-existing-batch', default='', help='Supprimer avant import les questions dont source commence par ce tag, ex: qcm_bank_5000_v1')
    parser.add_argument('--url', default=os.getenv('SUPABASE_URL', ''))
    parser.add_argument('--service-role-key', default=os.getenv('SUPABASE_SERVICE_ROLE_KEY', ''))
    args = parser.parse_args()

    rows = load_rows(Path(args.csv), limit=args.limit or None)
    counts = Counter(r['category'] for r in rows)
    premium = Counter(r['is_premium'] for r in rows)
    print(f'Fichier: {args.csv}')
    print(f'Lignes prêtes: {len(rows)}')
    print('Répartition catégories:', dict(counts))
    print('Répartition premium:', {str(k).lower(): v for k, v in premium.items()})

    if not args.execute:
        print('\nSIMULATION uniquement: aucun import effectué.')
        print('Pour importer réellement, utiliser --execute avec SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.')
        return 0

    if not args.url or not args.service_role_key:
        raise SystemExit('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires pour --execute.')
    if not rows:
        raise SystemExit('Aucune ligne à importer.')
    if args.chunk_size < 1 or args.chunk_size > 1000:
        raise SystemExit('--chunk-size doit être entre 1 et 1000.')

    base = args.url.rstrip('/') + '/rest/v1/questions'

    if args.delete_existing_batch:
        pattern = quote(args.delete_existing_batch + '*', safe='')
        delete_url = f'{base}?source=like.{pattern}'
        print(f'Suppression des anciennes lignes du lot {args.delete_existing_batch}...')
        request_json(delete_url, args.service_role_key, method='DELETE')
        print('Suppression terminée.')

    imported = 0
    for start, part in chunks(rows, args.chunk_size):
        print(f'Import lot {start + 1}-{start + len(part)} / {len(rows)}...')
        request_json(base, args.service_role_key, method='POST', body=part)
        imported += len(part)
    print(f'Import terminé: {imported} questions insérées.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
