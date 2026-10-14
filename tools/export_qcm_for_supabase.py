#!/usr/bin/env python3
"""Prépare un CSV d'import Supabase à partir de la banque QCM validée.

Le CSV source contient `review_status`, utile pour la production éditoriale mais absent
 de la table Supabase `questions`. Ce script exporte uniquement les colonnes attendues
par la base et ajoute `is_active=true`.
"""
import argparse
import csv
from collections import Counter
from pathlib import Path

SOURCE_FIELDS = [
    'category','level','question_text','option_a','option_b','option_c','option_d',
    'correct_answer','explanation','is_premium','source','review_status'
]
SUPABASE_FIELDS = [
    'category','level','question_text','option_a','option_b','option_c','option_d',
    'correct_answer','explanation','is_premium','is_active','source'
]


def normalize_bool(value):
    value = str(value).strip().lower()
    if value in {'true', '1', 'yes', 'oui'}:
        return 'true'
    if value in {'false', '0', 'no', 'non'}:
        return 'false'
    raise ValueError(f'Booléen invalide: {value}')


def export_for_supabase(src: Path, out: Path, batch_tag: str) -> int:
    with src.open(newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        missing = [c for c in SOURCE_FIELDS if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f'Colonnes manquantes dans {src}: {missing}')
        rows = list(reader)

    exported = []
    skipped = 0
    for i, row in enumerate(rows, start=2):
        if row.get('review_status') != 'validated':
            skipped += 1
            continue
        source = row.get('source', '').strip()
        if batch_tag and not source.startswith(batch_tag + ' | '):
            source = f'{batch_tag} | {source}' if source else batch_tag
        exported.append({
            'category': row['category'].strip(),
            'level': row['level'].strip(),
            'question_text': row['question_text'].strip(),
            'option_a': row['option_a'].strip(),
            'option_b': row['option_b'].strip(),
            'option_c': row['option_c'].strip(),
            'option_d': row['option_d'].strip(),
            'correct_answer': str(int(row['correct_answer'])),
            'explanation': row['explanation'].strip(),
            'is_premium': normalize_bool(row['is_premium']),
            'is_active': 'true',
            'source': source,
        })

    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=SUPABASE_FIELDS)
        writer.writeheader()
        writer.writerows(exported)

    counts = Counter(r['category'] for r in exported)
    print(f'CSV Supabase écrit: {out}')
    print(f'Lignes exportées: {len(exported)}')
    print(f'Lignes ignorées non validées: {skipped}')
    print('Répartition:', dict(counts))
    return len(exported)


def main():
    parser = argparse.ArgumentParser(description='Exporter la banque QCM vers un CSV compatible Supabase.')
    parser.add_argument('--src', default='content/qcm/qcm_bank_5000_v1.csv')
    parser.add_argument('--out', default='content/qcm/qcm_bank_5000_v1_supabase.csv')
    parser.add_argument('--batch-tag', default='qcm_bank_5000_v1')
    args = parser.parse_args()
    export_for_supabase(Path(args.src), Path(args.out), args.batch_tag)


if __name__ == '__main__':
    main()
