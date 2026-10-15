#!/usr/bin/env node
import fs from 'node:fs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const server = fs.readFileSync(new URL('../backend/server.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../backend/public/js/app.js', import.meta.url), 'utf8');
const routeStart = server.indexOf("app.post('/api/payments/saspay/init'");
const routeEnd = server.indexOf("app.get('/api/payments/saspay/status'", routeStart);
const route = server.slice(routeStart, routeEnd);

assert(routeStart >= 0 && routeEnd > routeStart, 'route SasPay absente');
assert(route.includes("saspayUsesHostedCheckout(selectedProvider)"), 'redirection Moov/Telmob absente');
assert(route.includes("createHostedCheckout('moov_hosted_redirect')"), 'checkout Moov/Telmob non créé');
assert(route.indexOf("saspayUsesHostedCheckout(selectedProvider)") < route.indexOf("'/payments/softpay/'"), 'Moov/Telmob ne doit pas lancer Softpay avant la redirection');
assert(route.includes("'/checkout-sessions/'"), 'session SasPay hébergée absente');
assert(route.includes("return_url: returnTo"), 'retour vers l’application absent');
assert(app.includes('location.href = data.paymentUrl'), 'redirection du navigateur absente');
console.log('REDIRECTION SASPAY MOOV/TELMOB OK');
