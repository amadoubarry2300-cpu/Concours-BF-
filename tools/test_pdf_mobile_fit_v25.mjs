#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';

const appSource = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const publicApp = fs.readFileSync(new URL('../backend/public/js/app.js', import.meta.url), 'utf8');
const publicCss = fs.readFileSync(new URL('../backend/public/css/styles.css', import.meta.url), 'utf8');

assert.equal(publicApp, appSource, 'le miroir public de app.js doit rester synchronisé');
assert.equal(publicCss, css, 'le miroir public des styles doit rester synchronisé');
assert.match(css, /\.pdf-reader\{[^}]*grid-template-rows:auto minmax\(0,1fr\)[^}]*min-width:0[^}]*max-width:100vw[^}]*overflow:hidden/,
  'le lecteur doit rester strictement borné à la largeur du téléphone');
assert.match(css, /\.pdf-reader-stage\{[^}]*width:100%[^}]*min-width:0[^}]*max-width:100%[^}]*overflow-x:hidden/,
  'la zone de lecture ne doit pas prendre la largeur intrinsèque du canvas haute résolution');
assert.match(css, /\.pdf-reader-page\{[^}]*min-width:0[^}]*max-width:100%/,
  'chaque page doit tenir dans la zone visible');
assert.match(css, /\.pdf-reader-page canvas\{[^}]*width:100%[^}]*max-width:100%[^}]*min-width:0/,
  'le canvas PDF haute résolution doit être réduit visuellement à la page');
assert.ok(!appSource.includes('Math.max(260, Math.min(920, stage.clientWidth - 16))'),
  'une largeur minimale fixe ne doit plus pouvoir faire dépasser une page');
assert.match(appSource, /section\.style\.width = `\$\{availableWidth\}px`;/,
  'la largeur calculée doit être appliquée à la page');

const functionSource = appSource.match(/function pdfReaderAvailableWidth\(stage\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(functionSource, 'fonction de largeur sûre absente');
const documentMock = { documentElement:{ clientWidth:360 } };
const windowMock = {
  innerWidth:360,
  getComputedStyle:() => ({ paddingLeft:'8px', paddingRight:'8px' })
};
const fitWidth = new Function('document','window', `${functionSource}; return pdfReaderAvailableWidth;`)(documentMock, windowMock);
assert.equal(fitWidth({ clientWidth:700 }), 344, 'un canvas trop large ne doit pas élargir le lecteur au-delà de 360 px');
assert.equal(fitWidth({ clientWidth:360 }), 344, 'les marges gauche et droite doivent rester visibles');
documentMock.documentElement.clientWidth = 240;
windowMock.innerWidth = 240;
assert.equal(fitWidth({ clientWidth:240 }), 224, 'un très petit écran ne doit pas subir une largeur minimale artificielle');
documentMock.documentElement.clientWidth = 1920;
windowMock.innerWidth = 1920;
assert.equal(fitWidth({ clientWidth:1050 }), 920, 'la largeur de bureau doit rester plafonnée');

console.log('LECTEUR PDF MOBILE V25 OK — PAGES ENTIÈRES VISIBLES');
