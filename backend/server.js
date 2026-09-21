import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = Number(process.env.PORT || 8080);
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const CINETPAY_APIKEY = process.env.CINETPAY_APIKEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;
const CINETPAY_CURRENCY = process.env.CINETPAY_CURRENCY || 'XOF';
const PLAN_AMOUNT = 1500;

app.use(cors({ origin: APP_ORIGIN, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Stockage mémoire pour démarrer. En production, remplacez par Supabase/PostgreSQL.
// Map phone -> { phone, status, expiresAt, txRef, provider, updatedAt }
const subscriptions = new Map();
const payments = new Map();

function normalizePhone(phone){
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('226') && digits.length >= 11) return '+226' + digits.slice(3, 11);
  if (digits.length >= 8) return '+226' + digits.slice(-8);
  return '';
}

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function activateSubscription({ phone, txRef, provider }){
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Numéro client invalide');
  const current = subscriptions.get(normalized);
  const base = current && new Date(current.expiresAt).getTime() > Date.now()
    ? new Date(current.expiresAt)
    : new Date();
  const expiresAt = addDays(base, 30).toISOString();
  const sub = {
    phone: normalized,
    status: 'premium',
    expiresAt,
    txRef,
    provider: provider || 'CINETPAY',
    updatedAt: new Date().toISOString()
  };
  subscriptions.set(normalized, sub);
  return sub;
}

function getActiveSubscription(phone){
  const normalized = normalizePhone(phone);
  const sub = subscriptions.get(normalized);
  if (!sub) return null;
  if (new Date(sub.expiresAt).getTime() <= Date.now()) return null;
  return sub;
}

function requireCinetPayConfig(){
  if (!CINETPAY_APIKEY || !CINETPAY_SITE_ID){
    const err = new Error('CinetPay non configuré: ajoutez CINETPAY_APIKEY et CINETPAY_SITE_ID dans .env');
    err.status = 500;
    throw err;
  }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'Concours BF+ payments', time: new Date().toISOString() });
});

app.post('/api/payments/cinetpay/init', async (req, res, next) => {
  try{
    requireCinetPayConfig();
    const { amount, currency, transactionId, provider, customer, returnUrl } = req.body || {};
    const phone = normalizePhone(customer?.phone);

    if (Number(amount) !== PLAN_AMOUNT) return res.status(400).json({ message: 'Montant invalide' });
    if ((currency || CINETPAY_CURRENCY) !== 'XOF') return res.status(400).json({ message: 'Devise invalide' });
    if (!phone) return res.status(400).json({ message: 'Numéro client invalide' });

    const tx = String(transactionId || `FP-${Date.now()}`);
    const metadata = JSON.stringify({ phone, plan: 'premium_monthly', provider: provider || 'MOBILE_MONEY' });

    payments.set(tx, {
      tx,
      phone,
      amount: PLAN_AMOUNT,
      currency: 'XOF',
      status: 'INITIATED',
      provider: provider || 'MOBILE_MONEY',
      createdAt: new Date().toISOString()
    });

    const payload = {
      apikey: CINETPAY_APIKEY,
      site_id: CINETPAY_SITE_ID,
      transaction_id: tx,
      amount: PLAN_AMOUNT,
      currency: 'XOF',
      description: 'Concours BF+ Premium - abonnement 30 jours',
      return_url: returnUrl || `${APP_ORIGIN}/#subscription`,
      notify_url: `${PUBLIC_BASE_URL}/api/payments/cinetpay/webhook`,
      channels: 'MOBILE_MONEY',
      metadata,
      customer_name: 'Client',
      customer_surname: 'Concours BF+',
      customer_email: `client-${phone.replace(/\D/g,'')}@concours-bf-plus.local`,
      customer_phone_number: phone,
      customer_address: 'Ouagadougou',
      customer_city: 'Ouagadougou',
      customer_country: 'BF',
      customer_state: 'Centre',
      customer_zip_code: '00000'
    };

    const cp = await fetch('https://api-checkout.cinetpay.com/v2/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await cp.json().catch(() => ({}));
    if (!cp.ok || !data?.data?.payment_url){
      return res.status(502).json({ message: 'CinetPay a refusé l’initialisation', details: data });
    }

    res.json({ transactionId: tx, paymentUrl: data.data.payment_url, raw: data });
  }catch(err){ next(err); }
});

app.post('/api/payments/cinetpay/webhook', async (req, res, next) => {
  try{
    requireCinetPayConfig();
    const tx = req.body?.cpm_trans_id || req.body?.transaction_id || req.body?.transactionId;
    if (!tx) return res.status(400).send('transaction_id missing');

    const verifyPayload = { apikey: CINETPAY_APIKEY, site_id: CINETPAY_SITE_ID, transaction_id: tx };
    const cp = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(verifyPayload)
    });
    const verified = await cp.json().catch(() => ({}));
    const data = verified?.data || {};

    const accepted = verified?.code === '00' && String(data.status).toUpperCase() === 'ACCEPTED' && Number(data.amount) === PLAN_AMOUNT;
    const existing = payments.get(tx);
    const meta = (() => { try { return JSON.parse(data.metadata || existing?.metadata || '{}'); } catch { return {}; } })();
    const phone = normalizePhone(meta.phone || existing?.phone || data.customer_phone_number);

    if (accepted && phone){
      payments.set(tx, { ...(existing || {}), tx, phone, status:'ACCEPTED', verifiedAt:new Date().toISOString(), raw:data });
      activateSubscription({ phone, txRef: tx, provider: 'CINETPAY' });
      return res.send('OK');
    }

    payments.set(tx, { ...(existing || {}), tx, status:data.status || 'REFUSED', verifiedAt:new Date().toISOString(), raw:data });
    res.send('IGNORED');
  }catch(err){ next(err); }
});

app.get('/api/subscription/status', (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone) return res.status(400).json({ message: 'Numéro invalide' });
  const sub = getActiveSubscription(phone);
  if (!sub) return res.json({ active:false, status:'free' });
  res.json({ active:true, status:'premium', expiresAt:sub.expiresAt, txRef:sub.txRef, provider:sub.provider });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Erreur serveur' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Concours BF+ payments backend listening on 0.0.0.0:${PORT}`);
});
