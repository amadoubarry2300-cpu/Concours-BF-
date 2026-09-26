#!/usr/bin/env python3
"""Audit rapide des verrous Premium côté production.
Usage: python3 tools/audit_premium_lock.py [base_url]
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

base = (sys.argv[1] if len(sys.argv) > 1 else 'https://concoursbf-fawn.vercel.app').rstrip('/')

def get(path, accept='application/json'):
    req = urllib.request.Request(base + path, headers={'Accept': accept})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
        ctype = r.headers.get('content-type', '')
        data = json.loads(body.decode('utf-8')) if 'json' in ctype else body.decode('utf-8', 'ignore')
        return r.status, r.headers, data

def assert_true(cond, msg):
    if not cond:
        raise AssertionError(msg)

status, headers, health = get('/health?audit=1')
assert_true(health.get('ok') is True, 'health ok false')
print('health build:', health.get('build'))

status, headers, resources = get('/api/resources?audit=1')
assert_true(resources.get('premiumIncluded') is False, 'resources should be non-premium without auth')
for r in resources.get('resources', []):
    if r.get('is_premium'):
        assert_true(r.get('locked') is True, f"premium resource not locked: {r.get('id')}")
        path = '/api/resources/' + urllib.parse.quote(str(r.get('id')), safe='') + '/download'
        try:
            get(path, '*/*')
            raise AssertionError(f"premium resource download unexpectedly allowed: {r.get('id')}")
        except urllib.error.HTTPError as e:
            assert_true(e.code == 402, f"premium resource download should be 402, got {e.code}")
print('resources:', len(resources.get('resources', [])), 'premium locked:', sum(1 for r in resources.get('resources', []) if r.get('is_premium')))

status, headers, pubs = get('/api/qcm-publications?audit=1')
assert_true(pubs.get('premiumIncluded') is False, 'qcm publications should be non-premium without auth')
for p in pubs.get('publications', []):
    if p.get('is_premium'):
        assert_true(p.get('locked') is True, f"premium publication not locked: {p.get('title')}")
        assert_true(not p.get('questions'), f"premium publication leaked questions: {p.get('title')}")
print('qcm publications:', len(pubs.get('publications', [])), 'premium locked:', sum(1 for p in pubs.get('publications', []) if p.get('is_premium')))

status, headers, questions = get('/api/questions?audit=1')
leaked = [q for q in questions.get('questions', []) if q.get('is_premium')]
assert_true(not leaked, f"/api/questions leaked {len(leaked)} premium rows")
print('questions:', len(questions.get('questions', [])), 'premium leaked: 0')

status, headers, sw = get('/sw.js?v=premium-lock-update-1', '*/*')
for token in ['premium-lock-update-1', 'X-Premium-Included', 'X-Premium-Content', 'CLEAR_DATA_CACHE', 'networkFirstFile']:
    assert_true(token in sw, f'service worker missing {token}')
print('service worker premium cache guards: ok')
print('AUDIT OK')
