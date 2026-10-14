#!/usr/bin/env node
process.env.NODE_ENV = 'test';
const fs = await import('node:fs');
const {
  preparePastedQcmBook,
  normalizePastedQcmBookSource,
  signPastedQcmBookSource,
  verifyPastedQcmBookSource,
  buildQcmDraftPdf,
  buildPastedQcmBookPdf,
  PDF_THEME_KEYS
} = await import('../backend/server.js');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const fontAssets = [
  '../backend/public/fonts/Montserrat-Regular.ttf',
  '../backend/public/fonts/Montserrat-ExtraBold.ttf',
  '../backend/public/fonts/Montserrat-Italic.ttf',
  '../backend/public/fonts/OpenSans-Regular.ttf',
  '../backend/public/fonts/OpenSans-ExtraBold.ttf',
  '../backend/public/fonts/OpenSans-Italic.ttf',
  '../backend/public/fonts/Roboto-Regular.ttf',
  '../backend/public/fonts/Roboto-Black.ttf',
  '../backend/public/fonts/Roboto-Italic.ttf',
  '../backend/public/fonts/Tinos-Regular.ttf',
  '../backend/public/fonts/Tinos-Bold.ttf',
  '../backend/public/fonts/Tinos-Italic.ttf'
];
fontAssets.forEach(file => assert(fs.statSync(new URL(file, import.meta.url)).size > 50000, `police Google Fonts absente : ${file}`));
assert(PDF_THEME_KEYS.length === 4, `nombre de designs premium inattendu : ${PDF_THEME_KEYS.length}`);

function ttfSupportsCodePoint(file, codePoint){
  const buffer = fs.readFileSync(new URL(file, import.meta.url));
  const numTables = buffer.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i=0; i<numTables; i++){
    const entry = 12 + i * 16;
    if (buffer.toString('ascii', entry, entry + 4) === 'cmap') cmapOffset = buffer.readUInt32BE(entry + 8);
  }
  if (cmapOffset < 0) return false;
  const subtableCount = buffer.readUInt16BE(cmapOffset + 2);
  for (let i=0; i<subtableCount; i++){
    const subtable = cmapOffset + buffer.readUInt32BE(cmapOffset + 4 + i * 8 + 4);
    const format = buffer.readUInt16BE(subtable);
    if (format === 12){
      const groupCount = buffer.readUInt32BE(subtable + 12);
      for (let group=0; group<groupCount; group++){
        const pos = subtable + 16 + group * 12;
        const start = buffer.readUInt32BE(pos);
        const end = buffer.readUInt32BE(pos + 4);
        if (codePoint >= start && codePoint <= end) return buffer.readUInt32BE(pos + 8) + codePoint - start !== 0;
      }
    }
    if (format === 4 && codePoint <= 0xffff){
      const segmentCount = buffer.readUInt16BE(subtable + 6) / 2;
      const endCodes = subtable + 14;
      const startCodes = endCodes + segmentCount * 2 + 2;
      const deltas = startCodes + segmentCount * 2;
      const ranges = deltas + segmentCount * 2;
      for (let segment=0; segment<segmentCount; segment++){
        const start = buffer.readUInt16BE(startCodes + segment * 2);
        const end = buffer.readUInt16BE(endCodes + segment * 2);
        if (codePoint < start || codePoint > end) continue;
        const delta = buffer.readInt16BE(deltas + segment * 2);
        const range = buffer.readUInt16BE(ranges + segment * 2);
        if (!range) return ((codePoint + delta) & 0xffff) !== 0;
        const glyphPos = ranges + segment * 2 + range + (codePoint - start) * 2;
        return glyphPos + 2 <= buffer.length && buffer.readUInt16BE(glyphPos) !== 0;
      }
    }
  }
  return false;
}
const requiredGlyphs = [...'ÀÂÇÉÈÊËÎÏÔÙÛÜŸœŒ√−≤≥×÷π²³⁻⁴±Δσ∞≠≈′∫∑∂'];
fontAssets.filter(file => !file.includes('Italic')).forEach(file => {
  requiredGlyphs.forEach(glyph => assert(ttfSupportsCodePoint(file, glyph.codePointAt(0)), `glyphe ${glyph} absent : ${file}`));
});

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
const existingPrepared = await preparePastedQcmBook({
  title:'Réutilisation d’un QCM publié',
  date:'2026-10-14',
  category:'Mathématiques',
  level:'BEPC',
  text:`1. Quel est le périmètre d’un carré de côté 3 cm ?
A. 100 cm
B. 101 cm
C. 102 cm
D. 103 cm
Réponse : A
Explication : Cette correction volontairement différente doit être remplacée par la version canonique déjà publiée.`
});
assert(existingPrepared.questions.length === 1, 'QCM publié exact refusé dans le livre');
assert(existingPrepared.questions[0].option_a === '6 cm', 'version canonique publiée non réutilisée');
assert(existingPrepared.questions[0].correct_answer === 2, 'bonne réponse canonique publiée non réutilisée');

const unicodeSource = {
  metadata:{ title:'Contrôle des signes mathématiques', date:'2026-10-14', category:'Mathématiques', level:'BEPC' },
  questions:[{
    question_text:'Si x² − 9 ≤ 0, quel encadrement correct obtient-on pour x ?',
    option_a:'−3 ≤ x ≤ 3',
    option_b:'x ≥ 3',
    option_c:'x ≤ −3',
    option_d:'−3 ≥ x ≥ 3',
    correct_answer:0,
    explanation:'Comme √9 = 3, les solutions sont comprises entre −3 et 3. Les signes √, −, ≤, ≥, ×, ÷, π, ², ³ et 10⁻⁴ doivent rester lisibles.'
  }]
};
for (const theme of PDF_THEME_KEYS){
  const unicodePdf = await buildPastedQcmBookPdf({ ...unicodeSource, theme });
  const pageCount = (unicodePdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  assert(unicodePdf.subarray(0, 4).toString() === '%PDF', `PDF mathématique invalide : ${theme}`);
  assert(unicodePdf.length > 20000, `police mathématique non incorporée : ${theme}`);
  assert(pageCount === 2, `pagination inattendue pour ${theme} : ${pageCount} pages`);
}
process.env.PDF_FONT_THEME = 'roboto-classique';
const dailyPdf = await buildQcmDraftPdf({
  title:unicodeSource.metadata.title,
  date:unicodeSource.metadata.date,
  category:unicodeSource.metadata.category,
  level:unicodeSource.metadata.level,
  questions:unicodeSource.questions
});
assert(dailyPdf.subarray(0, 4).toString() === '%PDF' && dailyPdf.length > 20000, 'PDF quotidien Google Fonts invalide');
delete process.env.PDF_FONT_THEME;

const compactQuestions = Array.from({ length:9 }, (_, index) => ({
  question_text:`Quel nombre vient immédiatement après ${index + 1} ?`,
  option_a:String(index + 1),
  option_b:String(index + 2),
  option_c:'',
  option_d:'',
  correct_answer:1,
  explanation:`Le nombre suivant est ${index + 2}.`
}));
const compactPdf = await buildPastedQcmBookPdf({
  metadata:{ title:'Test de pagination automatique', date:'2026-10-14', category:'Mathématiques', level:'CE2' },
  questions:compactQuestions,
  theme:'open-sans-epure'
});
const compactPageCount = (compactPdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
assert(compactPageCount === 10, `le livre ne réserve pas exactement une page à chaque QCM : ${compactPageCount - 1} pages de contenu pour 9 QCM`);
delete process.env.PDF_FONT_THEME;

const pdf = await buildPastedQcmBookPdf(signedSource);
assert(Buffer.isBuffer(pdf), 'résultat PDF non binaire');
assert(pdf.subarray(0, 4).toString() === '%PDF', 'signature PDF absente');
assert(pdf.length > 20000, `PDF anormalement petit: ${pdf.length}`);
if (process.env.OUTPUT_PDF) fs.writeFileSync(process.env.OUTPUT_PDF, pdf);
console.log(`PDF LIVRE QCM OK — ${pdf.length} octets`);
