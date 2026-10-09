import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const {
  qcmContentFingerprint,
  qcmDeterministicFactIssue,
  qcmVerificationIssue,
  qcmVerificationSummary,
  dailyDraftGenerationIssue,
  isOfficialBurkinaQcmSource,
  isTrustedEducationalQcmSource
} = await import('../backend/server.js');

const baseQuestion = {
  category:'Burkina Faso',
  level:'Concours',
  question_text:'Dans quelle région actuelle se trouve la province du Passoré ?',
  option_a:'Le Kuilsé',
  option_b:'Le Yaadga',
  option_c:'L’Oubri',
  option_d:'Le Sourou',
  correct_answer:1,
  explanation:'La province du Passoré, dont le chef-lieu est Yako, appartient à la région du Yaadga.',
  evidence_type:'official_source',
  source_title:'Nouvelle carte administrative du Burkina Faso',
  source_url:'https://www.matd.gov.bf/accueil/actualites/details',
  source_quote:'La nouvelle carte administrative compte 17 régions et rattache le Passoré au Yaadga.',
  source_date:'2025-07-04',
  verification_status:'verified',
  verification_score:97,
  verification_reason:'La source officielle confirme directement la région et la province.',
  verified_at:'2026-10-08T00:00:00.000Z',
  verified_by:'test-verifier',
  verification_version:'official-sources-v2'
};
baseQuestion.verified_fingerprint = qcmContentFingerprint(baseQuestion);

assert.match(dailyDraftGenerationIssue({ status:'generating', generation_target:50, questions:[baseQuestion] }), /1\/50/);
assert.match(dailyDraftGenerationIssue({ status:'draft', generation_target:50, questions:Array(49).fill(baseQuestion) }), /49\/50/);
assert.equal(dailyDraftGenerationIssue({ status:'draft', generation_target:50, questions:Array(50).fill(baseQuestion) }), '');

assert.equal(isOfficialBurkinaQcmSource(baseQuestion.source_url), true);
assert.equal(isTrustedEducationalQcmSource('https://www.unesco.org/fr/education'), true);
assert.equal(qcmVerificationIssue(baseQuestion, { category:'Burkina Faso', requireVerified:true }), '');
assert.equal(qcmVerificationSummary([baseQuestion], { category:'Burkina Faso', requireVerified:true }).publishable, true);
const missingDate = { ...baseQuestion, source_date:'' };
missingDate.verified_fingerprint = qcmContentFingerprint(missingDate);
assert.match(qcmVerificationIssue(missingDate, { category:'Burkina Faso', requireVerified:true }), /Date de la source/i);

const stale = { ...baseQuestion, explanation:'Le Passoré appartient à une autre région.' };
assert.match(qcmVerificationIssue(stale, { category:'Burkina Faso', requireVerified:true }), /modifiée/i);
const changedEvidence = { ...baseQuestion, source_quote:'Citation remplacée après la vérification initiale.' };
assert.match(qcmVerificationIssue(changedEvidence, { category:'Burkina Faso', requireVerified:true }), /modifiée/i);

const nonOfficial = { ...baseQuestion, source_url:'https://example.com/article' };
nonOfficial.verified_fingerprint = qcmContentFingerprint(nonOfficial);
assert.match(qcmVerificationIssue(nonOfficial, { category:'Burkina Faso', requireVerified:true }), /officielle burkinabè/i);

assert.match(qcmDeterministicFactIssue({
  question_text:'Quel est le rôle constitutionnel principal du Médiateur du Faso ?',
  explanation:'Le Médiateur du Faso règle les litiges entre administration et citoyens.'
}), /Institution supprimée/i);

assert.match(qcmDeterministicFactIssue({
  question_text:'Dans quelle région se trouve la province du Passoré ?',
  explanation:'Elle appartient à la région du Nord selon une donnée publiée en 2024.'
}), /Ancienne dénomination/i);
assert.equal(qcmDeterministicFactIssue({
  question_text:'Avant la réforme de juillet 2025, comment se nommait la région du Yaadga ?',
  explanation:'Son ancienne dénomination était la région du Nord.'
}), '');

assert.match(qcmDeterministicFactIssue({
  question_text:'Quel officier supérieur, le capitaine X, dirige le mouvement ?',
  explanation:'Le capitaine X dirige le mouvement.'
}), /officiers subalternes/i);

assert.match(qcmDeterministicFactIssue({
  question_text:'Quel syndicaliste et homme politique assassiné à Sapouy était Norbert Zongo ?',
  explanation:'Norbert Zongo a été assassiné en 1998.'
}), /journaliste d’investigation/i);

assert.match(qcmDeterministicFactIssue({
  question_text:'Soumane Touré était-il le fondateur du PAI ?',
  explanation:'Soumane Touré fut le fondateur du PAI.'
}), /fondateur initial/i);

assert.match(qcmDeterministicFactIssue({
  question_text:'Quel régime fut interrompu par le CMRPN ?',
  explanation:'La Deuxième République fut interrompue par le CMRPN.'
}), /Troisième République/i);

const mathQuestion = {
  category:'Mathématiques', level:'BEPC',
  question_text:'Combien vaut 15 % de 200 ?',
  option_a:'15', option_b:'20', option_c:'30', option_d:'45', correct_answer:2,
  explanation:'15 % de 200 vaut 0,15 × 200 = 30.',
  evidence_type:'calculation', source_title:'', source_url:'calculation://server-verified', source_quote:'', source_date:'',
  verification_status:'verified', verification_score:100,
  verification_reason:'Le calcul indépendant donne 0,15 × 200 = 30, qui correspond uniquement à l’option C.',
  verified_at:'2026-10-08T00:00:00.000Z', verified_by:'test-verifier', verification_version:'official-sources-v2'
};
mathQuestion.verified_fingerprint = qcmContentFingerprint(mathQuestion);
assert.equal(qcmVerificationIssue(mathQuestion, { category:'Mathématiques', requireVerified:true }), '');

console.log('QCM verification V2 tests: OK');
