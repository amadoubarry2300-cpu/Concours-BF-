#!/usr/bin/env node
process.env.NODE_ENV = 'test';
const { parsePastedQcmText, pastedQcmImportMetadata, qcmDeterministicFactIssue } = await import('../backend/server.js');
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

3) Parmi ces réponses, laquelle désigne un pays membre de l’Alliance des États du Sahel ?
A. Burkina Faso
B. Ghana
C. Sénégal
Réponse : A
Explication : Le Burkina Faso est membre de l’Alliance des États du Sahel avec le Mali et le Niger.

4. Le Burkina Faso est-il un pays sans accès direct à la mer ?
A. Oui
B. Non
Réponse : A
Explication : Le Burkina Faso est un pays enclavé qui ne possède aucun littoral maritime.

5. Cette question est volontairement incomplète pour vérifier le blocage automatique ?
A. Oui
Réponse : A
Explication : Une seule option ne permet pas de constituer un questionnaire à choix multiple.
`;

const parsed = parsePastedQcmText(sample, metadata);
assert(parsed.detected === 5, `questions détectées: ${parsed.detected}`);
assert(parsed.questions.length === 4, `QCM prêts: ${parsed.questions.length}`);
assert(parsed.rejected.length === 1, `QCM bloqués: ${parsed.rejected.length}`);
assert(parsed.questions[0].correct_answer === 1, 'lettre B mal convertie');
assert(parsed.questions[1].correct_answer === 0, 'correction A mal convertie');
assert(parsed.questions[2].option_d === '', 'QCM à trois choix mal normalisé');
assert(parsed.questions[3].option_c === '' && parsed.questions[3].option_d === '', 'QCM à deux choix mal normalisé');
assert(parsed.questions.every(q => q.source === metadata.title), 'titre de publication non appliqué');
assert(parsed.rejected[0].reason.includes('deux options'), 'QCM à une seule option non expliqué');

const duplicate = parsePastedQcmText(`${sample}\n6. Quelle ville est la capitale politique du Burkina Faso ?\nA. Bobo-Dioulasso\nB. Ouagadougou\nC. Koudougou\nD. Ouahigouya\nRéponse : B\nExplication : Ouagadougou est la capitale politique du Burkina Faso.`, metadata);
assert(duplicate.questions.length === 4, 'doublon interne accepté');
assert(duplicate.rejected.some(row => /déjà existante|trop proche/i.test(row.reason)), 'raison du doublon absente');

const fiftyRows = [];
for (let i = 1; i <= 50; i += 1){
  const tag = `notionunique${String.fromCharCode(97 + Math.floor((i - 1) / 26))}${String.fromCharCode(97 + ((i - 1) % 26))}`;
  fiftyRows.push(`${i}. Pour le concept ${tag}, quel choix correspond exactement à la définition demandée ?\nA. Valeur alpha ${tag}\nB. Valeur bêta ${tag}\nC. Valeur gamma ${tag}\nD. Valeur delta ${tag}\nRéponse : B\nExplication : La valeur bêta associée à ${tag} est explicitement la réponse attendue pour cet exercice.`);
}
const fifty = parsePastedQcmText(fiftyRows.join('\n\n'), { ...metadata, category:'Mathématiques' });
assert(fifty.questions.length === 50, `import 50 QCM limité à ${fifty.questions.length}`);
assert(fifty.rejected.length === 0, 'un QCM valide a été rejeté dans l’import de 50');

const formulasAndPh = parsePastedQcmText(`
1. Quelle relation permet de calculer correctement la vitesse moyenne d’un mobile ?
A. Vitesse = distance × durée
B. Vitesse = distance ÷ durée
C. Vitesse = durée ÷ distance
D. Vitesse = distance + durée
Réponse : B
Explication : La vitesse moyenne est la distance parcourue divisée par la durée du déplacement.

2. Quelle relation traduit correctement la loi d’Ohm aux bornes d’un conducteur ?
A. U = R × I
B. U = R ÷ I
C. R = U × I
D. I = U × R
Réponse : A
Explication : La loi d’Ohm relie la tension, la résistance et l’intensité par la relation U = R × I.

3. Que devient le pH d’une solution acide lorsqu’on la dilue progressivement avec de l’eau ?
A. Il diminue jusqu’à zéro
B. Il augmente et se rapproche de 7
C. Il devient immédiatement égal à 14
D. Il ne change jamais
Réponse : B
Explication : La dilution diminue la concentration en espèces acides et le pH se rapproche progressivement de 7.
`, { ...metadata, category:'Physique-Chimie', level:'BEPC' });
assert(formulasAndPh.questions.length === 3, `faux blocage physique-chimie: ${JSON.stringify(formulasAndPh.rejected)}`);
assert(formulasAndPh.rejected.length === 0, 'formule ou mot « espèces » rejeté à tort');
assert(!qcmDeterministicFactIssue({ question_text:'Dilution d’une solution acide', explanation:'La concentration en espèces acides diminue.' }), '« espèces » confondu avec le CES');
assert(qcmDeterministicFactIssue({ question_text:'Quel est le rôle actuel du CESE ?', explanation:'Le CESE conseille les pouvoirs publics.' }), 'acronyme CESE non détecté');

console.log('IMPORT TEXTE QCM OK');
