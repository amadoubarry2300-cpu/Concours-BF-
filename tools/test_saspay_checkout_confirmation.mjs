#!/usr/bin/env node
import fs from 'node:fs';
process.env.NODE_ENV = 'test';
const { checkoutStatusTransactionId, checkoutStatusLabel } = await import('../backend/server.js');

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const status = {
  id:'c9a17e2c-4b1a-4f0e-9c3d-2a1b3c4d5e6f',
  status:'PAID',
  transaction_id:'9c3f2a10-4b7e-4f1a-9d2e-9b6a7c1e4a02',
  transaction_status:'SUCCESS'
};
assert(checkoutStatusTransactionId(status) === status.transaction_id, 'identifiant de transaction non lu');
assert(checkoutStatusTransactionId({ success:true, data:status }) === status.transaction_id, 'enveloppe SasPay non lue');
assert(checkoutStatusLabel(status) === 'SUCCESS', 'statut de transaction non lu');
assert(checkoutStatusLabel({ status:'PENDING' }) === 'PENDING', 'statut en attente non conservé');

const server = fs.readFileSync(new URL('../backend/server.js', import.meta.url), 'utf8');
const routeStart = server.indexOf("app.get('/api/payments/saspay/status'");
const routeEnd = server.indexOf("app.post('/api/payments/saspay/webhook'", routeStart);
const route = server.slice(routeStart, routeEnd);
assert(route.includes('/status/`'), 'endpoint officiel du statut checkout non utilisé');
const sessionBlock = route.slice(route.indexOf('if (sessionId)'));
assert(sessionBlock.includes('/verify/`'), 'transaction SasPay non revérifiée');
assert(sessionBlock.indexOf('/status/`') < sessionBlock.indexOf('/verify/`'), 'la session doit être consultée avant la transaction');
assert(sessionBlock.includes('paymentIsSuccessful(verified, plan)'), 'montant et devise non contrôlés avant activation');
assert(server.includes("data?.metadata?.tx_ref"), 'corrélation webhook par référence locale absente');
console.log('CONFIRMATION CHECKOUT SASPAY OK');
