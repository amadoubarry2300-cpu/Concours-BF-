import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.APP_ORIGIN = 'http://localhost:3000';
process.env.VERCEL = '1';
process.env.VERCEL_PROJECT_PRODUCTION_URL = 'concoursbf-fawn.vercel.app';

const { absoluteAppUrl } = await import('../backend/server.js?email-link-test=1');

assert.equal(
  absoluteAppUrl('/'),
  'https://concoursbf-fawn.vercel.app/',
  'Un e-mail de production ne doit jamais contenir localhost.'
);
assert.equal(
  absoluteAppUrl('/#subscription'),
  'https://concoursbf-fawn.vercel.app/#subscription'
);
assert.ok(!absoluteAppUrl('/').includes('localhost'));

console.log('email production links v20: OK');
