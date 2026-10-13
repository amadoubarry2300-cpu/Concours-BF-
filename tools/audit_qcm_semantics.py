#!/usr/bin/env python3
"""Contrôle ciblé des corrections sémantiques connues et de la banque canonique."""
from __future__ import annotations

import json
import re
import sys
import unicodedata
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORRECTIONS = ROOT / 'backend/data/qcm_corrections_v3.json'
PUBLICATIONS = ROOT / 'audit_snapshots/production_publications_2026-10-13.json'
BANK = ROOT / 'backend/data/qcm_bank_5000_v1.json'

EXPECTED_ANSWERS = {
    '4907a296-8463-47a4-9afb-fb27ab2270c3': 'x = 12',
    '8a0c8a33-c220-4157-b45b-afec708265d0': '[0,208 ; 0,292]',
    '76dd112b-5f3b-469f-aa25-335dafd503f3': '1325',
    '48ba995d-e941-4137-8c22-329d1ec597fb': '1,24',
    '6d2bb6f4-20d0-470d-beef-ff0e3a653cc6': 'Un angle nul',
    '7a97ae6d-2525-4169-921a-5905c2b5a71b': 'Des droites gauches',
    'c3f1e7d4-d6e8-4714-831e-d484ffd692cb': 'Une similitude directe de rapport 2 et d’angle 0',
    '57f204bf-c4e9-4ebf-a831-ece9c669be36': 'Le cercle de diamètre reliant i et −1, privé de ces deux points',
    '46f1fdad-cad2-4dac-8068-7b184b19063d': 'Une symétrie orthogonale par rapport à une autre droite passant par O',
    '3cb080af-913f-4655-9a61-b277396386b5': 'Le cercle de diamètre [BC]',
    'b690968f-f66c-452d-a9ea-74d2ddb08212': '27/31',
    'e3678499-4678-4d3b-b040-1af0d588b8a6': 'Une parabole',
    'b1a64544-326e-4f90-bfa0-808bb9d597b7': '69 184',
    'db17eb76-4edb-4702-9d16-268e86347fd0': '1,028',
}

TEMPLATE_PATTERNS = [
    r'un document indique par erreur', r'un tableau attribue', r'une copie associe',
    r'pour corriger .+reponse erronee proposee', r'(?:dans .+|en preparation .+), une reponse proposee est',
    r'dans une fiche de revision, la reponse .+ est proposee', r'la reponse .+ est rejetee',
    r'une proposition erronee indique',
]


def norm(value: object) -> str:
    text = unicodedata.normalize('NFD', str(value or ''))
    text = ''.join(ch for ch in text if unicodedata.category(ch) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', ' ', text).strip()


def option_norm(value: object) -> str:
    return re.sub(r"[^\w'’]+", '', unicodedata.normalize('NFKC', str(value or '')).lower(), flags=re.UNICODE)


def options(question: dict) -> list[str]:
    return [str(question.get(f'option_{letter}') or '').strip() for letter in 'abcd']


def selected_answer(question: dict) -> str:
    return options(question)[int(question['correct_answer'])]


def apply_corrections(question: dict, corrections: dict[str, dict]) -> dict:
    return {**question, **corrections.get(str(question.get('id') or ''), {})}


def load_publications() -> dict:
    if PUBLICATIONS.exists():
        return json.loads(PUBLICATIONS.read_text(encoding='utf-8'))
    request = urllib.request.Request(
        'https://concoursbf-fawn.vercel.app/api/qcm-publications?semantic_audit=1',
        headers={'Accept':'application/json', 'Cache-Control':'no-cache', 'User-Agent':'Reussite-Concours-BF-Semantic-Audit/1.0'},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


def audit_publications(errors: list[str]) -> None:
    corrections = json.loads(CORRECTIONS.read_text(encoding='utf-8'))
    payload = load_publications()
    raw_questions = [q for publication in payload['publications'] for q in publication.get('questions', [])]
    by_id = {q['id']: apply_corrections(q, corrections) for q in raw_questions}

    unknown = sorted(set(corrections) - set(by_id))
    # L’API publique écarte volontairement les lignes que son filtre qualité juge
    # non publiables. Une correction visant une telle ligne reste utile pour la
    # persistance Supabase, mais son absence du flux public n’est pas une erreur.
    if unknown:
        print('corrections non exposées après filtre qualité:', len(unknown), unknown)
    if len(unknown) > 5:
        errors.append(f'trop de corrections sans question publique correspondante: {unknown}')

    for question_id, expected in EXPECTED_ANSWERS.items():
        question = by_id.get(question_id)
        if not question:
            errors.append(f'question corrigée absente: {question_id}')
            continue
        actual = selected_answer(question)
        if norm(actual) != norm(expected):
            errors.append(f'{question_id}: réponse sélectionnée {actual!r}, attendu {expected!r}')

    for question_id, question in by_id.items():
        row_options = options(question)
        if len({option_norm(option) for option in row_options}) != 4:
            errors.append(f'{question_id}: options répétées après correction')
        if int(question.get('correct_answer', -1)) not in range(4):
            errors.append(f'{question_id}: index de réponse invalide')

    corrected_text = '\n'.join(
        ' '.join([q.get('question_text', ''), *options(q), q.get('explanation', '')])
        for q in by_id.values()
    )
    forbidden = {
        'ancienne abréviation A-OE': r'\bA-OE\b',
        'faute Oubangui-Changi': r'Oubangui-Changi',
        'grue au lieu de grève': r'une grue soit lancée',
        'texte de raisonnement interne': r'Non, vérifions|Avec d’autres valeurs de distribution|selon la configuration des choix',
        'affirmation non établie sur Boganda': r'avant son assassinat politique',
        'coefficient erroné 1,019': r'1,02816 × 0,85|≈ 1,019',
    }
    for label, pattern in forbidden.items():
        if re.search(pattern, corrected_text, re.I):
            errors.append(f'{label} encore présent')


def audit_bank(errors: list[str]) -> None:
    rows = json.loads(BANK.read_text(encoding='utf-8'))
    if len(rows) != 5000:
        errors.append(f'banque JSON: {len(rows)} QCM au lieu de 5000')

    for index, question in enumerate(rows, 1):
        row_options = options(question)
        if len({option_norm(option) for option in row_options}) != 4:
            errors.append(f'banque ligne {index}: options répétées')
        answer = int(question.get('correct_answer', -1))
        if answer not in range(4):
            errors.append(f'banque ligne {index}: index de réponse invalide')

    south_africa = [q for q in rows if 'Afrique du Sud' in q.get('question_text', '') and 'capitale' in q.get('question_text', '')]
    if not south_africa or not all('administrative' in q['question_text'].lower() for q in south_africa):
        errors.append('Afrique du Sud: une question de capitale reste non qualifiée')

    transcontinental = [q for q in rows if re.search(r'continents?.+(Russie|Turquie)|(Russie|Turquie).+continents?', q.get('question_text', ''), re.I)]
    if len(transcontinental) != 2 or any(selected_answer(q) != 'Europe et Asie' for q in transcontinental):
        errors.append('Russie/Turquie: libellé transcontinental incohérent')

    language = [q for q in rows if 'langues de travail' in q.get('question_text', '')]
    if not language or any(selected_answer(q) != 'Le français et l’anglais' for q in language):
        errors.append('Burkina Faso: langues de travail non actualisées')

    seen_semantic: set[str] = set()
    curated = []
    for question in rows:
        text = norm(question.get('question_text'))
        if any(re.search(pattern, text) for pattern in TEMPLATE_PATTERNS):
            continue
        key = norm(f"{question.get('category')}|{selected_answer(question)}|{question.get('explanation')}")
        if key in seen_semantic:
            continue
        seen_semantic.add(key)
        curated.append(question)
    counts = Counter(q['category'] for q in curated)
    if len(curated) < 2000:
        errors.append(f'banque épurée trop petite: {len(curated)}')
    if any(counts[category] == 0 for category in ['Mathématiques', 'Psychotechnique', 'Français', 'Burkina Faso', 'Histoire-Géo', 'Culture générale', 'SVT', 'Greffier / Droit']):
        errors.append(f'catégorie absente de la banque épurée: {dict(counts)}')
    print('banque canonique:', len(rows), 'QCM')
    print('banque sémantiquement épurée:', len(curated), 'QCM', dict(counts))


def main() -> int:
    errors: list[str] = []
    audit_publications(errors)
    audit_bank(errors)
    if errors:
        for error in errors:
            print('ERROR:', error)
        print('AUDIT SÉMANTIQUE ÉCHOUÉ:', len(errors), 'problème(s)')
        return 1
    print('corrections de publication:', len(json.loads(CORRECTIONS.read_text(encoding="utf-8"))))
    print('AUDIT SÉMANTIQUE OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
