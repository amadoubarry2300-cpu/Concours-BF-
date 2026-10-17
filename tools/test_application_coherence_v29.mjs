#!/usr/bin/env node
import fs from 'node:fs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const server = read('backend/server.js');
const app = read('js/app.js');
const html = read('index.html');
const css = read('css/styles.css');
const sw = read('sw.js');
const pkg = JSON.parse(read('backend/package.json'));

for (const value of [server, app, read('README.md'), read('backend/README.md'), read('backend/.env.example')]){
  assert(!/cinetpay/i.test(value), 'ancienne intégration CinetPay encore présente dans le code actif');
}
assert(!/demoMode|simulatePaymentSuccess|function activatePremium\(/.test(app), 'ancien paiement de démonstration encore présent');
assert(server.includes("app.get('/api/subscription/status', requireSession"), 'statut Premium non protégé par la session');
assert(!server.includes("app.get('/api/config'"), 'ancienne route de configuration publique encore présente');
assert(server.includes('async function verifySasPayRecord'), 'vérificateur SasPay partagé absent');
assert(server.includes('verifySasPayRecord(record, {'), 'route de statut non reliée au vérificateur partagé');
assert(server.includes('accountPhone !== normalizePhone(requestedPhone)'), 'contrôle de propriété du paiement absent');
assert(!/req\.query\.(?:paymentId|sessionId)/.test(server), 'identifiant SasPay fourni par le client encore utilisé');
assert(server.includes('verifySasPayRecord(record);'), 'rapprochement non relié au vérificateur partagé');
assert(app.includes('existing.add(key);'), 'déduplication des QCM distants incomplète');
assert(app.includes('${renderMathText(e.q)}'), 'affichage sécurisé des erreurs QCM absent');
assert(!app.includes('${err.message}'), 'message d’erreur injecté sans échappement HTML');
assert(!app.includes("'/api/subscription/status?phone='"), 'numéro encore envoyé dans la route de statut Premium');
assert(pkg.dependencies.nodemailer === '^10.1.2', 'Nodemailer sécurisé non installé');
assert(!html.includes('published-qcm-intro'), 'titre Nouveaux QCM encore répété');
assert(!css.includes('.published-qcm-intro'), 'style mort de Nouveaux QCM encore présent');
assert(html.includes('<span class="nav-label">Premium</span>'), 'libellé Premium incohérent dans la navigation');
assert(fs.existsSync(new URL('../img/subject-physics.svg', import.meta.url)), 'illustration Physique-Chimie absente');
assert(sw.includes("'/img/subject-physics.svg'"), 'illustration Physique-Chimie absente du cache PWA');
assert(!sw.match(/isCandidateApi[\s\S]{0,500}subscription\/status/), 'statut privé encore mis en cache');
assert(server.includes("build: 'automatic-email-notifications-v29'"), 'marqueur v29 absent');

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert(new Set(ids).size === ids.length, 'identifiants HTML dupliqués');
const routes = [...server.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)].map(match => `${match[1]} ${match[2]}`);
assert(new Set(routes).size === routes.length, 'routes API dupliquées');

for (const [root, mirror] of [
  ['index.html','backend/public/index.html'],
  ['js/app.js','backend/public/js/app.js'],
  ['js/payment-config.example.js','backend/public/js/payment-config.example.js'],
  ['css/styles.css','backend/public/css/styles.css'],
  ['sw.js','backend/public/sw.js'],
  ['img/subject-physics.svg','backend/public/img/subject-physics.svg']
]){
  assert(read(root) === read(mirror), `copie de déploiement non synchronisée : ${root}`);
}

const visibleCopy = [html, app, server].join('\n');
for (const wording of [
  'Tous les modules', 'Publications récentes', 'Banque complète', 'banque du module',
  'Nouveaux QCM du module', '>Actualiser<', 'IA QCM', 'Destination après validation',
  'Prévisualiser le quiz', 'code OTP', 'confirme la transaction', 'Référence : <b>',
  'Synchronisation terminée', 'Génération en cours...', 'confirmée par le serveur',
  'Statistiques détaillées', 'Matières avancées'
]){
  assert(!visibleCopy.includes(wording), `terme technique encore visible : ${wording}`);
}
for (const wording of [
  'Matières et concours', 'Ajouts récents', 'Toutes les questions', 'Mettre à jour',
  'Aide à créer des QCM', 'Numéro de suivi', 'Préparation en cours...',
  'Suivi détaillé', 'Toutes les matières'
]){
  assert(visibleCopy.includes(wording), `libellé simple absent : ${wording}`);
}

console.log('LANGAGE SIMPLE ET COHÉRENCE APPLICATION V29 OK');
