import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
const { burkinaMobileOperator, validatePaymentPhoneForProvider } = await import('../backend/server.js');

const operatorCases = [
  ['67266720', 'ORANGE_MONEY'],
  ['66662160', 'ORANGE_MONEY'],
  ['04000000', 'ORANGE_MONEY'],
  ['70123456', 'MOOV_MONEY'],
  ['63123456', 'MOOV_MONEY'],
  ['03123456', 'MOOV_MONEY'],
  ['68123456', 'TELECEL']
];
for (const [phone, expected] of operatorCases){
  assert.equal(burkinaMobileOperator(phone), expected, `${phone} doit être ${expected}`);
}

assert.equal(validatePaymentPhoneForProvider('67266720', 'ORANGE_MONEY').phone, '+22667266720');
assert.equal(validatePaymentPhoneForProvider('+226 70 12 34 56', 'MOOV_MONEY').phone, '+22670123456');
assert.throws(
  () => validatePaymentPhoneForProvider('66662160', 'MOOV_MONEY'),
  /numéro Orange Money/i
);
assert.throws(
  () => validatePaymentPhoneForProvider('70123456', 'ORANGE_MONEY'),
  /numéro Moov Money/i
);
assert.throws(
  () => validatePaymentPhoneForProvider('68123456', 'MOOV_MONEY'),
  /Telecel/i
);
assert.throws(
  () => validatePaymentPhoneForProvider('1234', 'ORANGE_MONEY'),
  /8 chiffres/i
);
console.log('VALIDATION RÉSEAU MOBILE MONEY OK');
