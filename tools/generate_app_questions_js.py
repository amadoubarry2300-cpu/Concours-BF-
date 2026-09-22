#!/usr/bin/env python3
"""Génère la banque QCM embarquée dans l'application.

Mode actuel demandé par le propriétaire : accès ouvert en attendant l'activation
éventuelle des paiements. Le fichier JS contient donc les 5000 questions validées.

Quand la vente/Premium sera activée, il faudra revenir à une banque publique limitée
aux questions gratuites et servir les questions Premium via Supabase + backend.
"""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path


def to_bool(value):
    return str(value).strip().lower() in {'true', '1', 'yes', 'oui'}


def generate(src: Path, out: Path):
    with src.open(newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    questions = []
    skipped = 0
    for row in rows:
        if row.get('review_status') != 'validated':
            skipped += 1
            continue
        questions.append({
            'c': row['category'],
            'level': row['level'],
            'q': row['question_text'],
            'o': [row['option_a'], row['option_b'], row['option_c'], row['option_d']],
            'a': int(row['correct_answer']),
            'e': row['explanation'],
            # Conservé comme information technique, mais l'application ouvre tout en mode attente.
            'premium': to_bool(row['is_premium']),
        })

    out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(questions, ensure_ascii=False, indent=2)
    content = (
        '/* ============ Réussite Concours BF — banque complète de 5000 QCM ============ */\n'
        '/* Généré depuis content/qcm/qcm_bank_5000_v1.csv. Accès ouvert en attendant l’activation éventuelle des paiements. */\n'
        f'const QUESTIONS = {payload};\n\n'
        'const CATEGORIES = [...new Set(QUESTIONS.map(q => q.c))];\n'
    )
    out.write_text(content, encoding='utf-8')

    counts = Counter(q['c'] for q in questions)
    premium = Counter(q['premium'] for q in questions)
    print(f'Fichier écrit: {out}')
    print(f'Questions intégrées: {len(questions)}')
    print(f'Questions ignorées non validées: {skipped}')
    print('Répartition catégories:', dict(counts))
    print('Répartition premium technique:', {str(k).lower(): v for k, v in premium.items()})


def main():
    parser = argparse.ArgumentParser(description='Générer js/questions.js avec les 5000 QCM validés.')
    parser.add_argument('--src', default='content/qcm/qcm_bank_5000_v1.csv')
    parser.add_argument('--out', default='js/questions.js')
    args = parser.parse_args()
    generate(Path(args.src), Path(args.out))


if __name__ == '__main__':
    main()
