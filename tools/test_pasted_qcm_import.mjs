#!/usr/bin/env node
process.env.NODE_ENV = 'test';
const { parsePastedQcmText, pastedQcmImportMetadata } = await import('../backend/server.js');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const metadata = pastedQcmImportMetadata({
  title:'Actualités Burkina Faso — Octobre 2026',
  date:'2026-10-14',
  category:'Burkina Faso',
  level:'Concours',
  is_premium:false
});
assert(metadata.created_at.startsWith('2026-10-14'), 'date de publication perdue');

const sample = `
# QCM à copier

**1. Quelle ville est la capitale politique du Burkina Faso ?**
A) Bobo-Dioulasso
B) Ouagadougou
C) Koudougou
D) Ouahigouya
Réponse correcte : B
Explication : Ouagadougou est la capitale politique du Burkina Faso.

Question 2 : Quel est le nom officiel de l’hymne national du Burkina Faso ?
A - Le Ditanyè
B - La Marseillaise
C - Une seule nuit
D - Le Lion rouge
Correction : A. Le Ditanyè est l’hymne national officiel du Burkina Faso.

3) Cette question est volontairement incomplète pour vérifier le blocage automatique ?
A. Oui
B. Non
C. Peut-être
Réponse : A
Explication : Elle ne contient pas les quatre options obligatoires.
`;

const parsed = parsePastedQcmText(sample, metadata);
assert(parsed.detected === 3, `questions détectées: ${parsed.detected}`);
assert(parsed.questions.length === 2, `QCM prêts: ${parsed.questions.length}`);
assert(parsed.rejected.length === 1, `QCM bloqués: ${parsed.rejected.length}`);
assert(parsed.questions[0].correct_answer === 1, 'lettre B mal convertie');
assert(parsed.questions[1].correct_answer === 0, 'correction A mal convertie');
assert(parsed.questions.every(q => q.source === metadata.title), 'titre de publication non appliqué');
assert(parsed.rejected[0].reason.includes('quatre options'), 'QCM incomplet non expliqué');

const duplicate = parsePastedQcmText(`${sample}\n4. Quelle ville est la capitale politique du Burkina Faso ?\nA. Bobo-Dioulasso\nB. Ouagadougou\nC. Koudougou\nD. Ouahigouya\nRéponse : B\nExplication : Ouagadougou est la capitale politique du Burkina Faso.`, metadata);
assert(duplicate.questions.length === 2, 'doublon interne accepté');
assert(duplicate.rejected.some(row => /déjà existante|trop proche/i.test(row.reason)), 'raison du doublon absente');

const fiftyRows = [];
for (let i = 1; i <= 50; i += 1){
  const tag = `notionunique${String.fromCharCode(97 + Math.floor((i - 1) / 26))}${String.fromCharCode(97 + ((i - 1) % 26))}`;
  fiftyRows.push(`${i}. Pour le concept ${tag}, quel choix correspond exactement à la définition demandée ?\nA. Valeur alpha ${tag}\nB. Valeur bêta ${tag}\nC. Valeur gamma ${tag}\nD. Valeur delta ${tag}\nRéponse : B\nExplication : La valeur bêta associée à ${tag} est explicitement la réponse attendue pour cet exercice.`);
}
const fifty = parsePastedQcmText(fiftyRows.join('\n\n'), { ...metadata, category:'Mathématiques' });
assert(fifty.questions.length === 50, `import 50 QCM limité à ${fifty.questions.length}`);
assert(fifty.rejected.length === 0, 'un QCM valide a été rejeté dans l’import de 50');

console.log('IMPORT TEXTE QCM OK');
