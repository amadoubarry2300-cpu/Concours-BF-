import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const app = express();
const PORT = Number(process.env.PORT || 8080);
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const CINETPAY_APIKEY = process.env.CINETPAY_APIKEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;
const CINETPAY_CURRENCY = process.env.CINETPAY_CURRENCY || 'XOF';
const PLAN_AMOUNT = 1500;

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://scnhrcjhxqzetkrhhong.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Si Vercel est configuré avec le dossier backend comme racine,
// on sert aussi l'application web depuis backend/public.
app.use(express.static(PUBLIC_DIR));

// Fallback mémoire si Supabase n'est pas encore configuré côté Vercel.
const subscriptions = new Map();
const payments = new Map();

function supabaseReady(){
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

async function supabaseRequest(endpoint, { method='GET', body, prefer, key='service' } = {}){
  const apiKey = key === 'anon' ? (SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY) : SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !apiKey) throw new Error('Supabase non configuré');
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try{ data = text ? JSON.parse(text) : null; }catch{ data = text; }
  if (!res.ok){
    const err = new Error(data?.message || data?.hint || `Erreur Supabase ${res.status}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

function normalizePhone(phone){
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('226') && digits.length >= 11) return '+226' + digits.slice(3, 11);
  if (digits.length >= 8) return '+226' + digits.slice(-8);
  return '';
}

function publicPhone(phone){
  return String(phone || '').replace(/^\+226/, '');
}

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function hashPin(pin){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPin(pin, stored){
  if (!stored) return false;
  const [kind, salt, hash] = String(stored).split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

async function getProfile(phone){
  const normalized = normalizePhone(phone);
  if (!normalized || !supabaseReady()) return null;
  const rows = await supabaseRequest(`profiles?phone=eq.${encodeURIComponent(normalized)}&select=*`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function ensureProgress(profile){
  if (!profile || !supabaseReady()) return null;
  const rows = await supabaseRequest('progress?on_conflict=phone&select=*', {
    method:'POST',
    prefer:'resolution=merge-duplicates,return=representation',
    body:[{ profile_id:profile.id, phone:profile.phone }]
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function saveProgress(phone, progress){
  if (!supabaseReady()) return null;
  const normalized = normalizePhone(phone);
  const profile = await getProfile(normalized);
  const payload = {
    profile_id: profile?.id || null,
    phone: normalized,
    xp: Number(progress.xp || 0),
    quiz_done: Number(progress.quizDone || progress.quiz_done || 0),
    correct: Number(progress.correct || 0),
    answered: Number(progress.answered || 0),
    errors: progress.errors || [],
    cat_stats: progress.catStats || progress.cat_stats || {},
    streak: Number(progress.streak || 0),
    last_day: progress.lastDay || progress.last_day || null
  };
  const rows = await supabaseRequest('progress?on_conflict=phone&select=*', {
    method:'POST',
    prefer:'resolution=merge-duplicates,return=representation',
    body:[payload]
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function activateSubscription({ phone, txRef, provider }){
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

  if (supabaseReady()){
    const profile = await getProfile(normalized);
    const payload = {
      profile_id: profile?.id || null,
      phone: normalized,
      status: 'premium',
      starts_at: new Date().toISOString(),
      expires_at: expiresAt,
      provider: provider || 'CINETPAY',
      tx_ref: txRef
    };
    await supabaseRequest('subscriptions', { method:'POST', prefer:'return=minimal', body:[payload] });
  }
  return sub;
}

async function getActiveSubscription(phone){
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  if (supabaseReady()){
    const rows = await supabaseRequest(`subscriptions?phone=eq.${encodeURIComponent(normalized)}&status=eq.premium&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&order=expires_at.desc&limit=1`);
    const sub = Array.isArray(rows) ? rows[0] || null : null;
    if (sub){
      return { phone: normalized, status:'premium', expiresAt:sub.expires_at, txRef:sub.tx_ref, provider:sub.provider };
    }
  }

  const sub = subscriptions.get(normalized);
  if (!sub) return null;
  if (new Date(sub.expiresAt).getTime() <= Date.now()) return null;
  return sub;
}

function requireCinetPayConfig(){
  if (!CINETPAY_APIKEY || !CINETPAY_SITE_ID){
    const err = new Error('CinetPay non configuré: ajoutez CINETPAY_APIKEY et CINETPAY_SITE_ID dans Vercel');
    err.status = 500;
    throw err;
  }
}

function safeProfile(row){
  if (!row) return null;
  return {
    id: row.id,
    phone: publicPhone(row.phone),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    displayName: row.display_name || '',
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'Réussite Concours BF API', supabase: supabaseReady(), time: new Date().toISOString() });
});

app.get('/api/config', (_req, res) => {
  res.json({ supabaseUrl: SUPABASE_URL, hasAnonKey: Boolean(SUPABASE_ANON_KEY), hasServiceRole: Boolean(SUPABASE_SERVICE_ROLE_KEY) });
});

app.post('/api/auth/register', async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Supabase service_role non configuré dans Vercel' });
    const phone = normalizePhone(req.body?.phone);
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const pin = String(req.body?.pin || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ message:'Numéro invalide' });
    if (firstName.length < 2 || lastName.length < 2) return res.status(400).json({ message:'Nom et prénom requis' });
    if (pin.length < 4) return res.status(400).json({ message:'PIN invalide' });

    const displayName = `${firstName} ${lastName}`.trim();
    const rows = await supabaseRequest('profiles?on_conflict=phone&select=*', {
      method:'POST',
      prefer:'resolution=merge-duplicates,return=representation',
      body:[{
        phone,
        first_name:firstName,
        last_name:lastName,
        display_name:displayName,
        pin_hash:hashPin(pin),
        last_login_at:new Date().toISOString()
      }]
    });
    const profile = Array.isArray(rows) ? rows[0] : null;
    const progress = await ensureProgress(profile);
    const subscription = await getActiveSubscription(phone);
    res.json({ user:safeProfile(profile), progress, subscription });
  }catch(err){ next(err); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Supabase service_role non configuré dans Vercel' });
    const phone = normalizePhone(req.body?.phone);
    const pin = String(req.body?.pin || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ message:'Numéro invalide' });
    if (pin.length < 4) return res.status(400).json({ message:'PIN invalide' });

    const profile = await getProfile(phone);
    if (!profile) return res.status(404).json({ message:'Compte introuvable. Crée d’abord un compte.' });
    if (!verifyPin(pin, profile.pin_hash)) return res.status(401).json({ message:'Code PIN incorrect' });

    await supabaseRequest(`profiles?phone=eq.${encodeURIComponent(phone)}`, {
      method:'PATCH',
      prefer:'return=minimal',
      body:{ last_login_at:new Date().toISOString() }
    });
    const progressRows = await supabaseRequest(`progress?phone=eq.${encodeURIComponent(phone)}&select=*`);
    const progress = Array.isArray(progressRows) ? progressRows[0] || await ensureProgress(profile) : null;
    const subscription = await getActiveSubscription(phone);
    res.json({ user:safeProfile(profile), progress, subscription });
  }catch(err){ next(err); }
});

app.post('/api/progress/save', async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Supabase service_role non configuré dans Vercel' });
    const phone = normalizePhone(req.body?.phone);
    if (!phone) return res.status(400).json({ message:'Numéro invalide' });
    const progress = await saveProgress(phone, req.body?.progress || {});
    res.json({ ok:true, progress });
  }catch(err){ next(err); }
});

app.post('/api/leads/offer', async (req, res, next) => {
  try{
    const phone = normalizePhone(req.body?.phone);
    if (!phone) return res.status(400).json({ message:'Numéro invalide' });
    if (supabaseReady()){
      await supabaseRequest('offer_leads', { method:'POST', prefer:'return=minimal', body:[{ phone, source:req.body?.source || 'landing_modal' }] });
    }
    res.json({ ok:true });
  }catch(err){ next(err); }
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

    payments.set(tx, { tx, phone, amount: PLAN_AMOUNT, currency: 'XOF', status: 'INITIATED', provider: provider || 'MOBILE_MONEY', createdAt: new Date().toISOString() });

    if (supabaseReady()){
      const profile = await getProfile(phone);
      await supabaseRequest('payments', {
        method:'POST',
        prefer:'return=minimal',
        body:[{ profile_id:profile?.id || null, phone, tx_ref:tx, provider:provider || 'CINETPAY', amount:PLAN_AMOUNT, currency:'XOF', status:'INITIATED' }]
      });
    }

    const payload = {
      apikey: CINETPAY_APIKEY,
      site_id: CINETPAY_SITE_ID,
      transaction_id: tx,
      amount: PLAN_AMOUNT,
      currency: 'XOF',
      description: 'Réussite Concours BF Premium - abonnement 30 jours',
      return_url: returnUrl || `${APP_ORIGIN}/#subscription`,
      notify_url: `${PUBLIC_BASE_URL}/api/payments/cinetpay/webhook`,
      channels: 'MOBILE_MONEY',
      metadata,
      customer_name: 'Client',
      customer_surname: 'Réussite Concours BF',
      customer_email: `client-${phone.replace(/\D/g,'')}@reussite-concours-bf.local`,
      customer_phone_number: phone,
      customer_address: 'Ouagadougou',
      customer_city: 'Ouagadougou',
      customer_country: 'BF',
      customer_state: 'Centre',
      customer_zip_code: '00000'
    };

    const cp = await fetch('https://api-checkout.cinetpay.com/v2/payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
    const cp = await fetch('https://api-checkout.cinetpay.com/v2/payment/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(verifyPayload) });
    const verified = await cp.json().catch(() => ({}));
    const data = verified?.data || {};

    const accepted = verified?.code === '00' && String(data.status).toUpperCase() === 'ACCEPTED' && Number(data.amount) === PLAN_AMOUNT;
    const existing = payments.get(tx);
    const meta = (() => { try { return JSON.parse(data.metadata || existing?.metadata || '{}'); } catch { return {}; } })();
    const phone = normalizePhone(meta.phone || existing?.phone || data.customer_phone_number);

    if (accepted && phone){
      payments.set(tx, { ...(existing || {}), tx, phone, status:'ACCEPTED', verifiedAt:new Date().toISOString(), raw:data });
      if (supabaseReady()){
        await supabaseRequest(`payments?tx_ref=eq.${encodeURIComponent(tx)}`, { method:'PATCH', prefer:'return=minimal', body:{ status:'ACCEPTED', raw:data, verified_at:new Date().toISOString() } });
      }
      await activateSubscription({ phone, txRef: tx, provider: 'CINETPAY' });
      return res.send('OK');
    }

    payments.set(tx, { ...(existing || {}), tx, status:data.status || 'REFUSED', verifiedAt:new Date().toISOString(), raw:data });
    res.send('IGNORED');
  }catch(err){ next(err); }
});

app.get('/api/subscription/status', async (req, res, next) => {
  try{
    const phone = normalizePhone(req.query.phone);
    if (!phone) return res.status(400).json({ message: 'Numéro invalide' });
    const sub = await getActiveSubscription(phone);
    if (!sub) return res.json({ active:false, status:'free' });
    res.json({ active:true, status:'premium', expiresAt:sub.expiresAt, txRef:sub.txRef, provider:sub.provider });
  }catch(err){ next(err); }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health') return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'), err => {
    if (err) next();
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Erreur serveur' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Réussite Concours BF API listening on 0.0.0.0:${PORT}`);
});
