// Optionnel : créez js/payment-config.js en production et chargez-le avant js/app.js
// pour éviter de modifier app.js à chaque environnement.
window.CONCOURS_BF_PLUS_PAYMENT_CONFIG = {
  amount: 1500,
  currency: 'XOF',
  plan: 'premium_monthly',
  backendBaseUrl: 'https://api.votre-domaine.com',
  demoMode: false
};
