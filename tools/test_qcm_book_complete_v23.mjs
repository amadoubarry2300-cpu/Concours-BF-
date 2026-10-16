#!/usr/bin/env node
process.env.NODE_ENV = 'test';
const { preparePastedQcmBook, buildPastedQcmBookPdf } = await import('../backend/server.js');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const rows = [];
for (let i = 1; i <= 24; i += 1){
  const noAnswer = i === 6 || i === 12;
  rows.push(`${i}. Question d’histoire et de géographie numéro ${i} ?\nA. Proposition A ${i}\nB. Proposition B ${i}\nC. Proposition C ${i}\nD. Proposition D ${i}\n${noAnswer ? 'Réponse : aucune des propositions.' : 'Réponse : B\nExplication : La proposition B donne la réponse exacte à cette question.'}`);
}

const prepared = await preparePastedQcmBook({
  title:'24 QCM Histoire géographie',
  date:'2026-10-16',
  category:'Histoire-Géo',
  level:'Concours',
  text:rows.join('\n\n')
});
assert(prepared.detected === 24, `24 QCM attendus, ${prepared.detected} détectés`);
assert(prepared.questions.length === 24, `24 QCM attendus, ${prepared.questions.length} conservés`);
assert(prepared.rejected.length === 0, `QCM rejetés : ${JSON.stringify(prepared.rejected)}`);
assert(prepared.questions.filter(q => q.no_correct_option).length === 2, 'les deux pièges sans bonne option ont disparu');

const pdf = await buildPastedQcmBookPdf({ ...prepared, theme:'tinos-examen' });
const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
assert(pageCount === 25, `25 pages attendues (couverture + 24 QCM), ${pageCount} obtenues`);
console.log('LIVRE COMPLET V23 OK — 24 QCM CONSERVÉS — 25 PAGES');
