#!/usr/bin/env node
process.env.NODE_ENV = 'test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const {
  parsePastedQcmText,
  buildPastedQcmBookPdf,
  PDF_THEME_KEYS
} = await import('../backend/server.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = process.env.SAMPLE_QCM_SOURCE
  || path.resolve(here, '../../deliverables/50_QCM_Histoire_Geographie_Terminale_Serie_2.txt');
const outputDir = process.env.SAMPLE_PDF_DIR
  || path.resolve(here, '../../deliverables/pdf-designs');
const sourceText = fs.readFileSync(sourcePath, 'utf8');
const metadata = {
  title:'Histoire-Géographie — Terminale — Série 2',
  date:'2026-10-14',
  category:'Histoire-Géo',
  level:'BAC'
};
const parsed = parsePastedQcmText(sourceText, metadata);
if (parsed.questions.length < 12){
  throw new Error(`Seulement ${parsed.questions.length} QCM propres détectés dans la source.`);
}
fs.mkdirSync(outputDir, { recursive:true });
for (const theme of PDF_THEME_KEYS){
  const pdf = await buildPastedQcmBookPdf({ metadata, questions:parsed.questions.slice(0, 12), theme });
  const outputPath = path.join(outputDir, `${theme}.pdf`);
  fs.writeFileSync(outputPath, pdf);
  console.log(`${theme}: ${outputPath} (${pdf.length} octets)`);
}
delete process.env.PDF_FONT_THEME;
