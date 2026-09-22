#!/usr/bin/env python3
"""Génère la banque publique embarquée `js/questions.js`.

Important : ce fichier public ne doit contenir que les questions gratuites.
Les questions Premium restent dans le CSV validé et doivent être servies par le backend
après import Supabase, pour éviter de les exposer dans le JavaScript public.
"""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path


def is_false(value):
    return str(value).strip().lower() in {'false', '0', 'no', 'non'}


def generate(src: Path, out: Path):
    with src.open(newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    questions = []
    for row in rows:
        if row.get('review_status') != 'validated':
            continue
        if not is_false(row.get('is_premium')):
            continue
        questions.append({
            'c': row['category'],
            'level': row['level'],
            'q': row['question_text'],
            'o': [row['option_a'], row['option_b'], row['option_c'], row['option_d']],
            'a': int(row['correct_answer']),
            'e': row['explanation'],
            'premium': False,
        })

    out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(questions, ensure_ascii=False, indent=2)
    content = (
        '/* ============ Réussite Concours BF — banque publique de questions gratuites ============ */\n'
        '/* Généré depuis content/qcm/qcm_bank_5000_v1.csv. Ne pas ajouter ici les questions Premium. */\n'
        f'const QUESTIONS = {payload};\n\n'
        'const CATEGORIES = [...new Set(QUESTIONS.map(q => q.c))];\n'
    )
    out.write_text(content, encoding='utf-8')
    counts = Counter(q['c'] for q in questions)
    print(f'Fichier écrit: {out}')
    print(f'Questions publiques: {len(questions)}')
    print('Répartition:', dict(counts))


def main():
    parser = argparse.ArgumentParser(description='Générer js/questions.js avec les questions gratuites validées.')
    parser.add_argument('--src', default='content/qcm/qcm_bank_5000_v1.csv')
    parser.add_argument('--out', default='js/questions.js')
    args = parser.parse_args()
    generate(Path(args.src), Path(args.out))


if __name__ == '__main__':
    main()
