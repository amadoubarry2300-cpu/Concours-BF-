#!/usr/bin/env node
import fs from 'node:fs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const server = fs.readFileSync(new URL('../backend/server.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const publicApp = fs.readFileSync(new URL('../backend/public/js/app.js', import.meta.url), 'utf8');
const rootHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const publicHtml = fs.readFileSync(new URL('../backend/public/index.html', import.meta.url), 'utf8');

const initStart = server.indexOf("app.post('/api/payments/saspay/init'");
const initEnd = server.indexOf("app.get('/api/payments/saspay/status'", initStart);
const initRoute = server.slice(initStart, initEnd);
assert(initStart >= 0 && initEnd > initStart, 'route d’initialisation SasPay absente');
assert(initRoute.includes('findReusableSasPayPayment'), 'garde serveur contre les doubles demandes absente');
assert(initRoute.includes('reused:true'), 'réutilisation de la tentative en attente absente');
assert(initRoute.includes("idempotencyKey:tx"), 'idempotence checkout SasPay absente');

assert(server.includes("app.get('/api/payments/saspay/reconcile'"), 'rapprochement des anciennes tentatives absent');
assert(server.includes('recentSasPayPaymentRecords(req.phone'), 'recherche des paiements récents du compte absente');
assert(server.includes('verifyRecentSasPayRecord(record)'), 'revérification des tentatives en attente absente');
assert(server.includes("build: 'payment-confirmation-safety-v26'"), 'marqueur v26 absent');

assert(app.includes("if (state.pendingPayment?.ref)"), 'blocage client d’un deuxième paiement absent');
assert(app.includes("Aucun code OTP ne sera demandé dans Réussite Concours BF"), 'consigne Moov sans OTP absente');
assert(app.includes("Ne relance pas un autre paiement"), 'avertissement anti-double tentative absent');
assert(app.includes("'/api/payments/saspay/reconcile?'"), 'interface non reliée au rapprochement serveur');
assert(app.includes('startPaymentAutoChecks(6)'), 'vérification automatique absente');
assert(app.includes("'J’ai confirmé — vérifier mon paiement'"), 'bouton de confirmation guidée absent');
assert(app === publicApp, 'copie frontend backend/public non synchronisée');
assert(rootHtml === publicHtml, 'copie HTML backend/public non synchronisée');

console.log('SÉCURITÉ CONFIRMATION PAIEMENT V26 OK');
