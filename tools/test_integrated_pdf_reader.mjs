#!/usr/bin/env node
import fs from 'node:fs';
import PDFDocument from '../backend/node_modules/pdfkit/js/pdfkit.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
if (!Promise.withResolvers){
  Promise.withResolvers = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

const appSource = fs.readFileSync(new URL('../backend/public/js/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../backend/public/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../backend/public/css/styles.css', import.meta.url), 'utf8');
const workerUrl = new URL('../backend/public/js/vendor/pdf.worker.mjs', import.meta.url);
const pdfModuleUrl = new URL('../backend/public/js/vendor/pdf.mjs', import.meta.url);

['pdfReader','pdfReaderCanvas','pdfReaderPrev','pdfReaderNext','pdfReaderDownload'].forEach(id => assert(html.includes(`id="${id}"`), `élément du lecteur absent : ${id}`));
['openPdfReader','openPreparedPastedQcmPdf','openCurrentDailyPdfFull','openResource','openNewsPdf'].forEach(name => assert(appSource.includes(`function ${name}`) || appSource.includes(`async function ${name}`), `fonction du lecteur absente : ${name}`));
assert(css.includes('.pdf-reader.open'), 'styles du lecteur PDF absents');
assert(fs.statSync(workerUrl).size > 1_000_000, 'moteur PDF incomplet');
assert(fs.statSync(pdfModuleUrl).size > 500_000, 'bibliothèque PDF incomplète');

const chunks = [];
const pdf = new PDFDocument({ size:'A4', margin:40 });
pdf.on('data', chunk => chunks.push(chunk));
const finished = new Promise((resolve, reject) => { pdf.on('end', resolve); pdf.on('error', reject); });
pdf.fontSize(20).text('Réussite Concours BF — lecteur intégré');
pdf.addPage().fontSize(16).text('Deuxième page du document de contrôle.');
pdf.end();
await finished;

const pdfjs = await import(pdfModuleUrl.href);
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.href;
const loaded = await pdfjs.getDocument({ data:new Uint8Array(Buffer.concat(chunks)) }).promise;
assert(loaded.numPages === 2, `nombre de pages lu : ${loaded.numPages}`);
const firstPage = await loaded.getPage(1);
const viewport = firstPage.getViewport({ scale:1 });
assert(viewport.width > 500 && viewport.height > 800, 'dimensions A4 non reconnues');
await loaded.destroy();
console.log('LECTEUR PDF INTÉGRÉ OK — 2 pages');
