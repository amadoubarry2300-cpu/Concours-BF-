#!/usr/bin/env python3
"""Audit public de qualité des QCM candidats.

Usage: python3 tools/audit_qcm_quality.py [base_url]

Le script vérifie les QCM réellement servis aux candidats sans authentification.
Il échoue si une question contient une structure invalide, des options répétées,
une correction trop courte ou une remarque interne/de relecture.
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
import urllib.request
from collections.abc import Iterable

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://concoursbf-fawn.vercel.app").rstrip("/")

FORBIDDEN_PATTERNS = [
    re.compile(r"\battention\s*(?:[,!:;.-]|c[’']est|ceci|cela)", re.I),
    re.compile(r"\bI\.?A\.?\b|\bintelligence artificielle\b|\bartificial intelligence\b", re.I),
    re.compile(r"\bbrouillon\b|avant\s+publication|par\s+l[’']?administrateur", re.I),
    re.compile(r"\b(?:à|a)\s+v[ée]rifier\b|\bv[ée]rifiez\b|doit\s+être\s+v[ée]rifi[ée]", re.I),
    re.compile(r"\bincertain\b|\bje\s+(?:ne\s+)?(?:peux|vais|dois)\b|\ben tant qu\b", re.I),
    re.compile(r"source officielle\s+(?:à|a)\s+relire", re.I),
    re.compile(r"\b(?:attends?|revoyons|refaisons|reprenons|recalculons|ajustons|remplaçons)\b", re.I),
    re.compile(r"\baucune\s+(?:option|r[ée]ponse)\b.{0,100}\bcorrespond", re.I),
    re.compile(r"\boption\b.{0,80}\bnon\s+pr[ée]sente\b", re.I),
    re.compile(r"\boption\s+la\s+plus\s+(?:proche|coh[ée]rente)\b", re.I),
    re.compile(r"\bsi\s+n[ée]cessaire\b", re.I),
    re.compile(r"\b(?:corrigeons|modifions)\s+(?:l[’']|la\s+)?(?:[ée]nonc[ée]|option|r[ée]ponse)", re.I),
]


def get_json(path: str) -> dict:
    request = urllib.request.Request(
        BASE + path,
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache",
            "User-Agent": "Reussite-Concours-BF-QCM-Quality-Audit/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return json.load(response)


def normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def question_issue(question: dict) -> str:
    text = str(question.get("question_text") or "").strip()
    explanation = str(question.get("explanation") or "").strip()
    options = [str(question.get(f"option_{letter}") or "").strip() for letter in "abcd"]

    if len(text) < 24:
        return "question trop courte"
    if any(not option for option in options):
        return "option manquante"
    if len({normalize(option) for option in options}) != 4:
        return "options répétées"
    try:
        answer = int(question.get("correct_answer"))
    except (TypeError, ValueError):
        return "bonne réponse invalide"
    if answer not in range(4):
        return "bonne réponse invalide"
    if len(explanation) < 22:
        return "correction trop courte"

    combined = " ".join([text, *options, explanation])
    for pattern in FORBIDDEN_PATTERNS:
        if pattern.search(combined):
            return f"remarque interne/de relecture détectée ({pattern.pattern})"
    if re.search(r"\b(?:toutes?\s+les\s+r[ée]ponses|aucune\s+des\s+r[ée]ponses)\b", combined, re.I):
        return "option trop vague"
    return ""


def audit_questions(questions: Iterable[dict], label: str) -> tuple[int, list[str]]:
    errors: list[str] = []
    seen: dict[str, str] = {}
    count = 0
    for question in questions:
        count += 1
        question_id = str(question.get("id") or f"ligne-{count}")
        issue = question_issue(question)
        if issue:
            errors.append(f"{label} · {question_id}: {issue} — {question.get('question_text', '')}")
        key = normalize(question.get("question_text"))
        if key and key in seen:
            errors.append(f"{label} · {question_id}: doublon exact de {seen[key]}")
        elif key:
            seen[key] = question_id
    return count, errors


def main() -> int:
    health = get_json("/health?quality_audit=1")
    publications_payload = get_json("/api/qcm-publications?quality_audit=1")
    questions_payload = get_json("/api/questions?quality_audit=1")

    publications = publications_payload.get("publications") or []
    publication_questions: list[dict] = []
    errors: list[str] = []
    for publication in publications:
        rows = publication.get("questions") or []
        if publication.get("locked") and rows:
            errors.append(f"publication Premium verrouillée avec questions exposées: {publication.get('title')}")
        if not publication.get("locked") and int(publication.get("questionCount") or 0) != len(rows):
            errors.append(
                f"nombre incohérent pour {publication.get('title')}: "
                f"questionCount={publication.get('questionCount')} questions={len(rows)}"
            )
        publication_questions.extend(rows)

    publication_count, publication_errors = audit_questions(publication_questions, "Nouveaux QCM")
    bank_count, bank_errors = audit_questions(questions_payload.get("questions") or [], "Banque QCM")
    errors.extend(publication_errors)
    errors.extend(bank_errors)

    print("health build:", health.get("build"))
    print("publications:", len(publications), "questions contrôlées:", publication_count)
    print("banque candidat: questions contrôlées:", bank_count)

    if errors:
        for error in errors[:50]:
            print("ERROR:", error)
        if len(errors) > 50:
            print(f"ERROR: {len(errors) - 50} autre(s) problème(s) non affiché(s)")
        print("AUDIT QCM ÉCHOUÉ:", len(errors), "problème(s)")
        return 1

    print("QCM internes/douteux exposés: 0")
    print("AUDIT QCM OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
