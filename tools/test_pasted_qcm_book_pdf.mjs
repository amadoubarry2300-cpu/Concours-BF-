#!/usr/bin/env node
process.env.NODE_ENV = 'test';
const fs = await import('node:fs');
const {
  preparePastedQcmBook,
  normalizePastedQcmBookSource,
  signPastedQcmBookSource,
  verifyPastedQcmBookSource,
  buildPastedQcmBookPdf
} = await import('../backend/server.js');
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const body = {
  title:'Physique-Chimie 3e — Préparation concours directs et professionnels',
  date:'2026-10-14',
  category:'Physique-Chimie',
  level:'BEPC',
  text:`
1. Quelle relation permet de calculer correctement la vitesse moyenne d’un mobile ?
A. Vitesse = distance × durée
B. Vitesse = distance ÷ durée
C. Vitesse = durée ÷ distance
D. Vitesse = distance + durée
Réponse : B
Explication : La vitesse moyenne est égale à la distance parcourue divisée par la durée du déplacement.

2. Le son peut-il se propager dans le vide dans les conditions ordinaires ?
A. Oui, toujours
B. Non, il nécessite un milieu matériel
Réponse : B
Explication : Le son est une vibration mécanique et sa propagation nécessite un milieu matériel.

3. Quelle valeur du pH caractérise une solution acide dans les conditions habituelles ?
A. Un pH inférieur à 7
B. Un pH égal à 7
C. Un pH supérieur à 7
Réponse : A
Explication : Dans les conditions habituelles, une solution acide possède un pH strictement inférieur à 7.

4. Un appareil fonctionne sous une tension de 12 volts avec une intensité de 2 ampères. Quelle est sa puissance ?
A. 6 watts
B. 10 watts
C. 14 watts
D. 24 watts
Réponse : D
Explication : La puissance électrique se calcule avec P = U × I, donc 12 × 2 = 24 watts.
`
};

const prepared = await preparePastedQcmBook(body);
assert(prepared.questions.length === 4, `QCM du livre: ${prepared.questions.length}`);
assert(prepared.questions[1].option_c === '', 'QCM à deux choix altéré');
assert(prepared.questions[2].option_d === '', 'QCM à trois choix altéré');
const signedSource = normalizePastedQcmBookSource({ metadata:prepared.metadata, questions:prepared.questions });
const pdfToken = signPastedQcmBookSource(signedSource);
assert(verifyPastedQcmBookSource(signedSource, pdfToken), 'source PDF validée non reconnue');
assert(!verifyPastedQcmBookSource({ ...signedSource, questions:[{ ...signedSource.questions[0], question_text:'Question modifiée' }] }, pdfToken), 'source PDF modifiée acceptée');
const pdf = await buildPastedQcmBookPdf(signedSource);
assert(Buffer.isBuffer(pdf), 'résultat PDF non binaire');
assert(pdf.subarray(0, 4).toString() === '%PDF', 'signature PDF absente');
assert(pdf.length > 20000, `PDF anormalement petit: ${pdf.length}`);
if (process.env.OUTPUT_PDF) fs.writeFileSync(process.env.OUTPUT_PDF, pdf);
console.log(`PDF LIVRE QCM OK — ${pdf.length} octets`);
