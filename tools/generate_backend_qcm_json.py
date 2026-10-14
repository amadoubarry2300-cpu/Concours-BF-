#!/usr/bin/env python3
"""Convertit la banque CSV validée en JSON privé pour le backend."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def parse_bool(value: object) -> bool:
    return str(value or '').strip().lower() in {'true', '1', 'yes', 'oui'}


def generate(src: Path, out: Path) -> None:
    with src.open(newline='', encoding='utf-8') as handle:
        rows = list(csv.DictReader(handle))
    payload = []
    for row in rows:
        if row.get('review_status') != 'validated':
            continue
        payload.append({
            'category': row['category'],
            'level': row['level'],
            'question_text': row['question_text'],
            'option_a': row['option_a'],
            'option_b': row['option_b'],
            'option_c': row['option_c'],
            'option_d': row['option_d'],
            'correct_answer': int(row['correct_answer']),
            'explanation': row['explanation'],
            'is_premium': parse_bool(row['is_premium']),
        })
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'Fichier écrit: {out} ({len(payload)} QCM)')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--src', default='content/qcm/qcm_bank_5000_v1.csv')
    parser.add_argument('--out', default='backend/data/qcm_bank_5000_v1.json')
    args = parser.parse_args()
    generate(Path(args.src), Path(args.out))


if __name__ == '__main__':
    main()
