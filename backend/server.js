import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
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
const SASPAY_API_KEY = process.env.SASPAY_API_KEY || '';
const SASPAY_WEBHOOK_SECRET = process.env.SASPAY_WEBHOOK_SECRET || '';
const SASPAY_BASE_URL = (process.env.SASPAY_BASE_URL || 'https://api.saspay.me/api/v1').replace(/\/$/, '');
const SASPAY_COUNTRY = process.env.SASPAY_COUNTRY || 'BF';
const SASPAY_CURRENCY = process.env.SASPAY_CURRENCY || 'XOF';
const SASPAY_NETWORKS = {
  ORANGE_MONEY: process.env.SASPAY_NETWORK_ORANGE || 'orange_bf',
  MOOV_MONEY: process.env.SASPAY_NETWORK_MOOV || 'moov_bf'
};

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://scnhrcjhxqzetkrhhong.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const SESSION_SECRET = process.env.SESSION_SECRET || SUPABASE_SERVICE_ROLE_KEY || 'dev-session-secret-change-me';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const LOGIN_MAX_FAILED = Number(process.env.LOGIN_MAX_FAILED || 5);
const LOGIN_LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOCAL_QCM_BANK_PATH = path.join(__dirname, 'data', 'qcm_bank_5000_v1.json');
let localQcmBankCache = null;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
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

function clientIp(req){
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return (xf || req.socket?.remoteAddress || '').slice(0, 80);
}

function isMissingAuthAttemptsTableError(err){
  const msg = String(err?.message || err?.details?.message || err?.details?.hint || '');
  return /auth_attempts|schema cache|relation|does not exist/i.test(msg);
}

async function recordAuthAttempt(phone, success, reason, req){
  if (!supabaseReady()) return;
  try{
    await supabaseRequest('auth_attempts', {
      method:'POST',
      prefer:'return=minimal',
      body:[{
        phone,
        success:Boolean(success),
        reason:String(reason || '').slice(0, 80),
        ip:clientIp(req),
        user_agent:String(req.headers['user-agent'] || '').slice(0, 250)
      }]
    });
  }catch(err){
    if (isMissingAuthAttemptsTableError(err)) return;
    throw err;
  }
}

async function getPinLockInfo(phone){
  const fallback = { locked:false, attempts:0, remaining:LOGIN_MAX_FAILED, lockedUntil:null };
  if (!supabaseReady()) return fallback;
  const windowStart = new Date(Date.now() - LOGIN_LOCK_MINUTES * 60 * 1000).toISOString();
  try{
    const successRows = await supabaseRequest(`auth_attempts?phone=eq.${encodeURIComponent(phone)}&success=eq.true&created_at=gte.${encodeURIComponent(windowStart)}&select=created_at&order=created_at.desc&limit=1`);
    const lastSuccessAt = Array.isArray(successRows) && successRows[0]?.created_at ? successRows[0].created_at : null;
    const since = lastSuccessAt || windowStart;
    const failRows = await supabaseRequest(`auth_attempts?phone=eq.${encodeURIComponent(phone)}&success=eq.false&created_at=gte.${encodeURIComponent(since)}&select=created_at&order=created_at.asc&limit=${LOGIN_MAX_FAILED}`);
    const attempts = Array.isArray(failRows) ? failRows.length : 0;
    const remaining = Math.max(0, LOGIN_MAX_FAILED - attempts);
    let lockedUntil = null;
    if (attempts >= LOGIN_MAX_FAILED && failRows[0]?.created_at){
      lockedUntil = new Date(new Date(failRows[0].created_at).getTime() + LOGIN_LOCK_MINUTES * 60 * 1000).toISOString();
    }
    return { locked:Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now()), attempts, remaining, lockedUntil };
  }catch(err){
    if (isMissingAuthAttemptsTableError(err)) return fallback;
    throw err;
  }
}

function lockMessage(info){
  if (!info?.lockedUntil) return `Trop de tentatives. Réessaie dans ${LOGIN_LOCK_MINUTES} minutes.`;
  const minutes = Math.max(1, Math.ceil((new Date(info.lockedUntil).getTime() - Date.now()) / 60000));
  return `Trop de tentatives de PIN. Réessaie dans ${minutes} minute${minutes>1?'s':''}.`;
}

function hashSessionToken(token){
  return crypto.createHmac('sha256', SESSION_SECRET).update(String(token)).digest('hex');
}

function bearerToken(req){
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function isMissingSessionsTableError(err){
  const msg = String(err?.message || err?.details?.message || err?.details?.hint || '');
  return /sessions|schema cache|relation|does not exist/i.test(msg);
}

async function createSession(profile, req){
  if (!profile || !supabaseReady()) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = addDays(new Date(), SESSION_DAYS).toISOString();
  const payload = {
    profile_id: profile.id,
    phone: profile.phone,
    token_hash: hashSessionToken(token),
    user_agent: String(req.headers['user-agent'] || '').slice(0, 250),
    expires_at: expiresAt
  };
  try{
    await supabaseRequest('sessions', { method:'POST', prefer:'return=minimal', body:[payload] });
    return { token, expiresAt };
  }catch(err){
    if (isMissingSessionsTableError(err)) return null;
    throw err;
  }
}

async function getSessionFromRequest(req){
  const token = bearerToken(req);
  if (!token || !supabaseReady()) return null;
  const tokenHash = hashSessionToken(token);
  try{
    const rows = await supabaseRequest(`sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*&limit=1`);
    const session = Array.isArray(rows) ? rows[0] || null : null;
    if (!session) return null;
    const profile = await getProfile(session.phone);
    if (!profile) return null;
    await supabaseRequest(`sessions?id=eq.${encodeURIComponent(session.id)}`, {
      method:'PATCH',
      prefer:'return=minimal',
      body:{ last_seen_at:new Date().toISOString() }
    }).catch(()=>{});
    return { session, profile };
  }catch(err){
    if (isMissingSessionsTableError(err)) return null;
    throw err;
  }
}

async function requireSession(req, res, next){
  try{
    const sessionData = await getSessionFromRequest(req);
    if (!sessionData) return res.status(401).json({ message:'Session expirée. Reconnecte-toi.' });
    req.sessionData = sessionData.session;
    req.profile = sessionData.profile;
    req.phone = sessionData.profile.phone;
    next();
  }catch(err){ next(err); }
}

function requireCinetPayConfig(){
  if (!CINETPAY_APIKEY || !CINETPAY_SITE_ID){
    const err = new Error('CinetPay non configuré: ajoutez CINETPAY_APIKEY et CINETPAY_SITE_ID dans Vercel');
    err.status = 500;
    throw err;
  }
}


function requireSasPayConfig(){
  if (!SASPAY_API_KEY){
    const err = new Error('SasPay non configuré: ajoutez SASPAY_API_KEY dans Vercel');
    err.status = 503;
    throw err;
  }
}

function saspayNetwork(provider){
  const key = String(provider || 'ORANGE_MONEY').toUpperCase();
  return SASPAY_NETWORKS[key] || SASPAY_NETWORKS.ORANGE_MONEY;
}

async function saspayRequest(pathname, { method='GET', body, idempotencyKey } = {}){
  requireSasPayConfig();
  const headers = { Authorization: `Bearer ${SASPAY_API_KEY}`, 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 255);
  const res = await fetch(`${SASPAY_BASE_URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let data = null;
  try{ data = text ? JSON.parse(text) : null; }catch{ data = text; }
  if (!res.ok){
    const err = new Error(data?.message || `Erreur SasPay ${res.status}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}

function loadLocalQcmBank(){
  if (localQcmBankCache) return localQcmBankCache;
  try{
    const raw = fs.readFileSync(LOCAL_QCM_BANK_PATH, 'utf8');
    const rows = JSON.parse(raw);
    localQcmBankCache = Array.isArray(rows) ? rows : [];
  }catch(err){
    localQcmBankCache = [];
  }
  return localQcmBankCache;
}

function safeLocalQuestion(row, index){
  return {
    id: row.id || `local-qcm-${index}`,
    category: row.category,
    level: row.level,
    question_text: row.question_text,
    option_a: row.option_a,
    option_b: row.option_b,
    option_c: row.option_c,
    option_d: row.option_d,
    correct_answer: row.correct_answer,
    explanation: row.explanation || '',
    is_premium: Boolean(row.is_premium)
  };
}

function saspaySignatureValid(req){
  if (!SASPAY_WEBHOOK_SECRET) return false;
  const signature = String(req.get('X-Webhook-Signature') || '').trim();
  const timestamp = String(req.get('X-Webhook-Timestamp') || '').trim();
  if (!signature || !timestamp || !req.rawBody) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;
  const expected = crypto.createHmac('sha256', SASPAY_WEBHOOK_SECRET).update(`${timestamp}.${req.rawBody}`).digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}


function paymentRawWithSasPay(raw, data){
  return { ...(raw || {}), saspay_id: data?.id || raw?.saspay_id, saspay: data || raw?.saspay };
}

async function createPaymentRecord({ tx, phone, provider, status='INITIATED', raw }){
  payments.set(tx, { tx, phone, provider, amount: PLAN_AMOUNT, currency:'XOF', status, raw, createdAt:new Date().toISOString() });
  if (!supabaseReady()) return;
  const profile = await getProfile(phone);
  await supabaseRequest('payments?on_conflict=tx_ref', {
    method:'POST',
    prefer:'resolution=merge-duplicates,return=minimal',
    body:[{ profile_id:profile?.id || null, phone, tx_ref:tx, provider, amount:PLAN_AMOUNT, currency:'XOF', status, raw:raw || null }]
  });
}

async function updatePaymentRecord(tx, patch){
  const existing = payments.get(tx) || { tx };
  payments.set(tx, { ...existing, ...patch });
  if (!supabaseReady()) return;
  await supabaseRequest(`payments?tx_ref=eq.${encodeURIComponent(tx)}`, {
    method:'PATCH',
    prefer:'return=minimal',
    body:patch
  });
}

async function getPaymentRecord(tx){
  const existing = payments.get(tx);
  if (existing) return existing;
  if (!supabaseReady()) return null;
  const rows = await supabaseRequest(`payments?tx_ref=eq.${encodeURIComponent(tx)}&select=*`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function findPaymentBySasPayId(paymentId){
  for (const item of payments.values()){
    if (item?.raw?.saspay_id === paymentId || item?.raw?.saspay?.id === paymentId) return item;
  }
  if (!supabaseReady()) return null;
  const rows = await supabaseRequest('payments?provider=eq.SASPAY&select=*&order=created_at.desc&limit=200');
  return Array.isArray(rows) ? rows.find(r => r?.raw?.saspay_id === paymentId || r?.raw?.saspay?.id === paymentId) || null : null;
}

function paymentIsSuccessful(data){
  const status = String(data?.status || '').toUpperCase();
  const amount = Number(data?.requested_amount || data?.amount || data?.net_amount || 0);
  const currency = String(data?.currency || '').toUpperCase();
  return status === 'SUCCESS' && amount === PLAN_AMOUNT && currency === 'XOF';
}

function isMissingAvatarColumnError(err){
  const msg = String(err?.message || err?.details?.message || err?.details?.hint || '');
  return /avatar_data|schema cache|column/i.test(msg);
}

function cleanAvatarData(value){
  const v = String(value || '');
  if (!v) return '';
  if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/i.test(v)) return '';
  return v.length <= 600000 ? v : '';
}

async function saveProfileAvatar(phone, avatarData){
  const clean = cleanAvatarData(avatarData);
  if (!clean || !supabaseReady()) return null;
  try{
    const rows = await supabaseRequest(`profiles?phone=eq.${encodeURIComponent(phone)}&select=*`, {
      method:'PATCH',
      prefer:'return=representation',
      body:{ avatar_data: clean }
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }catch(err){
    if (isMissingAvatarColumnError(err)) return null;
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
    avatarData: row.avatar_data || '',
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'Réussite Concours BF API',
    supabase: supabaseReady(),
    saspay: Boolean(SASPAY_API_KEY),
    saspayWebhook: Boolean(SASPAY_WEBHOOK_SECRET),
    time: new Date().toISOString()
  });
});

app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    hasAnonKey: Boolean(SUPABASE_ANON_KEY),
    hasServiceRole: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    hasSasPay: Boolean(SASPAY_API_KEY),
    hasSasPayWebhook: Boolean(SASPAY_WEBHOOK_SECRET),
    saspayCountry: SASPAY_COUNTRY,
    saspayNetworks: SASPAY_NETWORKS
  });
});

app.post('/api/auth/register', async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Supabase service_role non configuré dans Vercel' });
    const phone = normalizePhone(req.body?.phone);
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const pin = String(req.body?.pin || '').replace(/\D/g, '');
    const avatarData = cleanAvatarData(req.body?.avatarData);
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
    let profile = Array.isArray(rows) ? rows[0] : null;
    if (avatarData){
      const updated = await saveProfileAvatar(phone, avatarData);
      if (updated) profile = updated;
      else if (profile) profile.avatar_data = avatarData; // visible immédiatement même si la migration n'a pas encore été relancée
    }
    const progress = await ensureProgress(profile);
    const subscription = await getActiveSubscription(phone);
    const session = await createSession(profile, req);
    res.json({ user:safeProfile(profile), progress, subscription, session });
  }catch(err){ next(err); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Supabase service_role non configuré dans Vercel' });
    const phone = normalizePhone(req.body?.phone);
    const pin = String(req.body?.pin || '').replace(/\D/g, '');
    if (!phone) return res.status(400).json({ message:'Numéro invalide' });
    if (pin.length < 4) return res.status(400).json({ message:'PIN invalide' });

    const lockBefore = await getPinLockInfo(phone);
    if (lockBefore.locked) return res.status(429).json({ message:lockMessage(lockBefore), lockedUntil:lockBefore.lockedUntil });

    const profile = await getProfile(phone);
    if (!profile){
      await recordAuthAttempt(phone, false, 'not_found', req);
      return res.status(404).json({ message:'Compte introuvable. Crée d’abord un compte.' });
    }
    if (!verifyPin(pin, profile.pin_hash)){
      await recordAuthAttempt(phone, false, 'bad_pin', req);
      const lockAfter = await getPinLockInfo(phone);
      if (lockAfter.locked) return res.status(429).json({ message:lockMessage(lockAfter), lockedUntil:lockAfter.lockedUntil });
      return res.status(401).json({ message:`Code PIN incorrect. ${lockAfter.remaining} essai${lockAfter.remaining>1?'s':''} restant${lockAfter.remaining>1?'s':''}.` });
    }

    await recordAuthAttempt(phone, true, 'login_success', req);

    await supabaseRequest(`profiles?phone=eq.${encodeURIComponent(phone)}`, {
      method:'PATCH',
      prefer:'return=minimal',
      body:{ last_login_at:new Date().toISOString() }
    });
    const freshProfile = { ...profile, last_login_at:new Date().toISOString() };
    const progressRows = await supabaseRequest(`progress?phone=eq.${encodeURIComponent(phone)}&select=*`);
    const progress = Array.isArray(progressRows) ? progressRows[0] || await ensureProgress(profile) : null;
    const subscription = await getActiveSubscription(phone);
    const session = await createSession(profile, req);
    res.json({ user:safeProfile(freshProfile), progress, subscription, session });
  }catch(err){ next(err); }
});

app.post('/api/progress/save', requireSession, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Supabase service_role non configuré dans Vercel' });
    const progress = await saveProgress(req.phone, req.body?.progress || {});
    res.json({ ok:true, progress });
  }catch(err){ next(err); }
});

app.post('/api/profile/avatar', requireSession, async (req, res, next) => {
  try{
    const avatarData = cleanAvatarData(req.body?.avatarData);
    if (!avatarData) return res.status(400).json({ message:'Photo invalide' });
    const profile = await saveProfileAvatar(req.phone, avatarData);
    res.json({ ok:true, user:safeProfile(profile || { ...req.profile, avatar_data:avatarData }) });
  }catch(err){ next(err); }
});

app.post('/api/auth/logout', requireSession, async (req, res, next) => {
  try{
    await supabaseRequest(`sessions?id=eq.${encodeURIComponent(req.sessionData.id)}`, {
      method:'PATCH',
      prefer:'return=minimal',
      body:{ revoked_at:new Date().toISOString() }
    }).catch(()=>{});
    res.json({ ok:true });
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

app.post('/api/payments/saspay/init', requireSession, async (req, res, next) => {
  try{
    requireSasPayConfig();
    const { amount, currency, transactionId, provider, customer, returnUrl } = req.body || {};
    const phone = normalizePhone(customer?.phone || req.phone);
    const selectedProvider = provider || 'ORANGE_MONEY';
    const network = saspayNetwork(selectedProvider);

    if (Number(amount) !== PLAN_AMOUNT) return res.status(400).json({ message:'Montant invalide' });
    if ((currency || SASPAY_CURRENCY) !== 'XOF') return res.status(400).json({ message:'Devise invalide' });
    if (!phone || phone !== req.phone) return res.status(400).json({ message:'Numéro client invalide' });

    const tx = String(transactionId || `RCBF-${Date.now()}`);
    const profile = req.profile || await getProfile(phone);
    await createPaymentRecord({ tx, phone, provider:'SASPAY', status:'INITIATED', raw:{ local_tx_ref:tx, selected_provider:selectedProvider, network } });

    const firstName = profile?.first_name || profile?.display_name?.split(' ')?.[0] || 'Client';
    const lastName = profile?.last_name || 'Réussite Concours BF';
    const payload = {
      amount: `${PLAN_AMOUNT}.00`,
      currency: 'XOF',
      country: SASPAY_COUNTRY,
      description: 'Réussite Concours BF Premium - abonnement 30 jours',
      customer: {
        email: `client-${phone.replace(/\D/g,'')}@reussite-concours-bf.local`,
        first_name: firstName,
        last_name: lastName,
        phone
      },
      network,
      return_url: returnUrl || `${APP_ORIGIN}/#subscription`,
      metadata: { tx_ref: tx, phone, plan: 'premium_monthly', provider: selectedProvider }
    };

    const data = await saspayRequest('/payments/softpay/', { method:'POST', body:payload, idempotencyKey:tx });
    const raw = paymentRawWithSasPay({ local_tx_ref:tx, selected_provider:selectedProvider, network }, data);
    await updatePaymentRecord(tx, { status:data?.status || 'PENDING', raw });

    res.json({
      ok:true,
      transactionId: tx,
      paymentId: data?.id || null,
      status: data?.status || 'PENDING',
      paymentUrl: data?.checkout_url || '',
      message: data?.checkout_url ? 'Redirection paiement SasPay requise' : 'Demande Mobile Money envoyée. Valide sur ton téléphone.'
    });
  }catch(err){ next(err); }
});

app.get('/api/payments/saspay/status', requireSession, async (req, res, next) => {
  try{
    requireSasPayConfig();
    const tx = String(req.query.transactionId || req.query.tx || '').trim();
    if (!tx) return res.status(400).json({ message:'Référence paiement manquante' });
    const record = await getPaymentRecord(tx);
    if (!record || normalizePhone(record.phone) !== req.phone) return res.status(404).json({ message:'Paiement introuvable' });
    const paymentId = String(req.query.paymentId || record?.raw?.saspay_id || record?.raw?.saspay?.id || '').trim();
    if (!paymentId) return res.status(400).json({ message:'Identifiant SasPay manquant' });

    const verified = await saspayRequest(`/payments/${encodeURIComponent(paymentId)}/verify/`);
    const raw = paymentRawWithSasPay(record.raw, verified);
    if (paymentIsSuccessful(verified)){
      await updatePaymentRecord(tx, { status:'ACCEPTED', raw, verified_at:new Date().toISOString() });
      const sub = await activateSubscription({ phone:req.phone, txRef:tx, provider:'SASPAY' });
      return res.json({ ok:true, active:true, status:'premium', expiresAt:sub.expiresAt, txRef:tx, provider:'SASPAY' });
    }
    await updatePaymentRecord(tx, { status:verified?.status || 'PENDING', raw, verified_at:new Date().toISOString() });
    res.json({ ok:true, active:false, paymentStatus:verified?.status || 'PENDING', message:'Paiement non confirmé pour le moment.' });
  }catch(err){ next(err); }
});

app.post('/api/payments/saspay/webhook', async (req, res, next) => {
  try{
    if (!saspaySignatureValid(req)) return res.status(401).send('invalid signature');
    const event = req.body?.event || req.get('X-Webhook-Event');
    const data = req.body?.data || {};
    const paymentId = data?.id;
    if (!paymentId) return res.status(400).send('payment id missing');
    const record = await findPaymentBySasPayId(paymentId);
    if (!record) return res.status(202).send('unknown payment');

    if (event === 'transaction.success' || String(data.status).toUpperCase() === 'SUCCESS'){
      const verified = await saspayRequest(`/payments/${encodeURIComponent(paymentId)}/verify/`);
      const raw = paymentRawWithSasPay(record.raw, verified);
      if (paymentIsSuccessful(verified)){
        await updatePaymentRecord(record.tx || record.tx_ref, { status:'ACCEPTED', raw, verified_at:new Date().toISOString() });
        await activateSubscription({ phone:record.phone, txRef:record.tx || record.tx_ref, provider:'SASPAY' });
        return res.send('OK');
      }
    }

    if (event === 'transaction.failed'){
      await updatePaymentRecord(record.tx || record.tx_ref, { status:'FAILED', raw:paymentRawWithSasPay(record.raw, data), verified_at:new Date().toISOString() });
    }
    res.send('IGNORED');
  }catch(err){ next(err); }
});

function safeQuestion(row){
  return {
    id: row.id,
    category: row.category,
    level: row.level,
    question_text: row.question_text,
    option_a: row.option_a,
    option_b: row.option_b,
    option_c: row.option_c,
    option_d: row.option_d,
    correct_answer: row.correct_answer,
    explanation: row.explanation || '',
    is_premium: Boolean(row.is_premium)
  };
}

app.get('/api/questions', async (req, res, next) => {
  try{
    let premiumAllowed = false;
    const sessionData = await getSessionFromRequest(req).catch(() => null);
    if (sessionData?.profile?.phone){
      const sub = await getActiveSubscription(sessionData.profile.phone);
      premiumAllowed = Boolean(sub);
    }

    const localBank = loadLocalQcmBank();
    if (localBank.length){
      const filtered = premiumAllowed ? localBank : localBank.filter(q => !q.is_premium);
      return res.json({
        ok:true,
        source:'local_bank_5000_v1',
        premiumIncluded:premiumAllowed,
        questions:filtered.map(safeLocalQuestion)
      });
    }

    if (!supabaseReady()) return res.status(503).json({ message:'Supabase service_role non configuré dans Vercel' });
    const premiumFilter = premiumAllowed ? '' : '&is_premium=eq.false';
    const rows = await supabaseRequest(`questions?is_active=eq.true${premiumFilter}&select=id,category,level,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium&order=created_at.asc`);
    res.json({ ok:true, source:'supabase', premiumIncluded:premiumAllowed, questions:Array.isArray(rows) ? rows.map(safeQuestion) : [] });
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
