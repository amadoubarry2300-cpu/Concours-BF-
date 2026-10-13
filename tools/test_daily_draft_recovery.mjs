#!/usr/bin/env node
process.env.NODE_ENV = 'test';
const { recoverDailyAiDraft } = await import('../backend/server.js');

function assert(condition, message){
  if (!condition) throw new Error(message);
}

const id = 'daily-20261013-a1b2c3d4';
const question = {
  id:'q-1', category:'Physique-Chimie', level:'BEPC',
  question_text:'Quelle unité mesure une intensité électrique ?',
  option_a:'Le volt', option_b:'L’ampère', option_c:'Le watt', option_d:'Le joule',
  correct_answer:1, explanation:'L’intensité électrique se mesure en ampères.'
};
const recovered = recoverDailyAiDraft(id, {
  id,
  date:'2026-10-13',
  title:'QCM quotidien — Physique-Chimie — BEPC — 2026-10-13',
  category:'Physique-Chimie',
  level:'BEPC',
  is_premium:true,
  generationTarget:50,
  questions:[question]
});

assert(recovered?.id === id, 'identifiant non restauré');
assert(recovered.status === 'generating', 'statut de reprise invalide');
assert(recovered.generation_target === 50, 'objectif invalide');
assert(recovered.questions.length === 1, 'progression perdue');
assert(recovered.questions[0].question_text === question.question_text, 'question validée perdue');
assert(recovered.is_premium === true, 'choix Premium perdu');
assert(recoverDailyAiDraft('bad-id', { id:'bad-id' }) === null, 'identifiant invalide accepté');
assert(recoverDailyAiDraft(id, { id, category:'Physique-Chimie', level:'CEP' }) === null, 'catégorie incompatible avec le niveau acceptée');

console.log('REPRISE PRÉPARATION QUOTIDIENNE OK');
