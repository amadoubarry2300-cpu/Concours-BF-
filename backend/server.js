import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'url';

const app = express();
const PORT = Number(process.env.PORT || 8080);
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;
const CINETPAY_APIKEY = process.env.CINETPAY_APIKEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;
const CINETPAY_CURRENCY = process.env.CINETPAY_CURRENCY || 'XOF';
const SUBSCRIPTION_PLANS = {
  premium_monthly: { id:'premium_monthly', label:'Mensuel', amount:1500, days:30, description:'Réussite Concours BF Premium - abonnement mensuel' },
  premium_annual: { id:'premium_annual', label:'Annuel', amount:10000, days:365, description:'Réussite Concours BF Premium - abonnement annuel' }
};
const PLAN_AMOUNT = SUBSCRIPTION_PLANS.premium_monthly.amount;
const SASPAY_API_KEY = process.env.SASPAY_API_KEY || '';
const SASPAY_WEBHOOK_SECRET = process.env.SASPAY_WEBHOOK_SECRET || '';
const SASPAY_BASE_URL = (process.env.SASPAY_BASE_URL || 'https://api.saspay.me/api/v1').replace(/\/$/, '');
const SASPAY_COUNTRY = process.env.SASPAY_COUNTRY || 'BF';
const SASPAY_CURRENCY = process.env.SASPAY_CURRENCY || 'XOF';
const SASPAY_NETWORKS = {
  ORANGE_MONEY: process.env.SASPAY_NETWORK_ORANGE || 'orange_bf',
  MOOV_MONEY: process.env.SASPAY_NETWORK_MOOV || 'moov_bf'
};
const ADMIN_PHONES = String(process.env.ADMIN_PHONES || '')
  .split(',')
  .map(normalizePhone)
  .filter(Boolean);

// Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://scnhrcjhxqzetkrhhong.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
const SESSION_SECRET = process.env.SESSION_SECRET || SUPABASE_SERVICE_ROLE_KEY || 'dev-session-secret-change-me';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const LOGIN_MAX_FAILED = Number(process.env.LOGIN_MAX_FAILED || 5);
const LOGIN_LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);
const RESOURCE_BUCKET = process.env.SUPABASE_RESOURCE_BUCKET || 'reussite-concours-resources';
const RESOURCE_INDEX_PATH = 'resources/index.json';
const NEWS_INDEX_PATH = 'news/index.json';
const MAX_RESOURCE_FILE_BYTES = Number(process.env.MAX_RESOURCE_FILE_BYTES || 4 * 1024 * 1024);
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || SMTP_FROM || '';
const SMS_API_URL = process.env.SMS_API_URL || '';
const SMS_API_TOKEN = process.env.SMS_API_TOKEN || '';
const SMS_SENDER = process.env.SMS_SENDER || 'ConcoursBF';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
const OFFICIAL_NEWS_SOURCES = process.env.OFFICIAL_NEWS_SOURCES || '';
const AI_DAILY_INDEX_PATH = 'ai-daily/index.json';
const AI_DAILY_DEFAULT_CATEGORIES = ['Burkina Faso','Culture générale','Histoire-Géo','Mathématiques','Psychotechnique','Français','SVT','Greffier / Droit'];
const AI_DAILY_DEFAULT_LEVELS = ['Concours','BEPC','BAC','CEP','Licence'];
const AI_DAILY_QCM_COUNT = Math.min(20, Math.max(1, Number(process.env.AI_DAILY_QCM_COUNT || 20)));
const AI_DAILY_GROUP_MODE = ['module','niveau'].includes(String(process.env.AI_DAILY_GROUP_MODE || '').toLowerCase()) ? String(process.env.AI_DAILY_GROUP_MODE).toLowerCase() : 'module';
const AI_DAILY_CATEGORIES = parseEnvList(process.env.AI_DAILY_QCM_CATEGORIES, AI_DAILY_DEFAULT_CATEGORIES);
const AI_DAILY_LEVELS = parseEnvList(process.env.AI_DAILY_QCM_LEVELS, AI_DAILY_DEFAULT_LEVELS);
const AI_DAILY_IS_PREMIUM = /^true|1|yes|oui$/i.test(String(process.env.AI_DAILY_QCM_PREMIUM || 'false'));
const AI_DAILY_CRON_SECRET = process.env.AI_DAILY_CRON_SECRET || process.env.CRON_SECRET || '';
const premiumNotificationTxSent = new Set();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOCAL_QCM_BANK_PATH = path.join(__dirname, 'data', 'qcm_bank_5000_v1.json');
let localQcmBankCache = null;

function parseEnvList(value, fallback){
  const rows = String(value || '').split(/[,;\n]+/).map(v => v.trim()).filter(Boolean);
  return rows.length ? rows : fallback;
}

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

function storageBaseUrl(){
  return `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1`;
}

function encodeStoragePath(value){
  return String(value || '').split('/').map(part => encodeURIComponent(part)).join('/');
}

function storageHeaders(extra = {}){
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('Stockage indisponible');
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra
  };
}

let resourceBucketReady = false;
async function ensureResourceBucket(){
  if (!supabaseReady()) throw Object.assign(new Error('Stockage indisponible'), { status:503 });
  if (resourceBucketReady) return;
  const url = `${storageBaseUrl()}/bucket/${encodeURIComponent(RESOURCE_BUCKET)}`;
  const check = await fetch(url, { headers:storageHeaders() });
  if (check.ok){ resourceBucketReady = true; return; }
  if (check.status !== 404){
    const msg = await check.text().catch(()=>'');
    throw Object.assign(new Error('Stockage indisponible'), { status:check.status, details:msg });
  }
  const create = await fetch(`${storageBaseUrl()}/bucket`, {
    method:'POST',
    headers:storageHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify({ id:RESOURCE_BUCKET, name:RESOURCE_BUCKET, public:false })
  });
  if (!create.ok && create.status !== 409){
    const msg = await create.text().catch(()=>'');
    throw Object.assign(new Error('Création du stockage impossible'), { status:create.status, details:msg });
  }
  resourceBucketReady = true;
}

async function uploadResourceObject(objectPath, buffer, mimeType){
  await ensureResourceBucket();
  const res = await fetch(`${storageBaseUrl()}/object/${encodeURIComponent(RESOURCE_BUCKET)}/${encodeStoragePath(objectPath)}`, {
    method:'POST',
    headers:storageHeaders({
      'Content-Type': mimeType || 'application/octet-stream',
      'x-upsert':'true',
      'cache-control':'3600'
    }),
    body:buffer
  });
  if (!res.ok){
    const msg = await res.text().catch(()=>'');
    throw Object.assign(new Error('Envoi du fichier impossible'), { status:res.status, details:msg });
  }
}

async function downloadResourceObject(objectPath){
  await ensureResourceBucket();
  const res = await fetch(`${storageBaseUrl()}/object/${encodeURIComponent(RESOURCE_BUCKET)}/${encodeStoragePath(objectPath)}`, {
    headers:storageHeaders()
  });
  if (!res.ok){
    const text = await res.text().catch(()=>'');
    let data = null;
    try{ data = text ? JSON.parse(text) : null; }catch{ data = text; }
    const msg = String(data?.message || data?.error || text || '');
    const missing = res.status === 404 || /not found|does not exist|object.*not|resource.*not|introuvable/i.test(msg);
    const err = new Error(missing ? 'Fichier introuvable' : 'Téléchargement impossible');
    err.status = missing ? 404 : res.status;
    err.details = data;
    throw err;
  }
  const arrayBuffer = await res.arrayBuffer();
  return { buffer:Buffer.from(arrayBuffer), contentType:res.headers.get('content-type') || 'application/octet-stream' };
}

async function deleteResourceObject(objectPath){
  await ensureResourceBucket();
  await fetch(`${storageBaseUrl()}/object/${encodeURIComponent(RESOURCE_BUCKET)}`, {
    method:'DELETE',
    headers:storageHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify({ prefixes:[objectPath] })
  }).catch(()=>{});
}

async function loadResourceIndex(){
  try{
    const file = await downloadResourceObject(RESOURCE_INDEX_PATH);
    const data = JSON.parse(file.buffer.toString('utf8') || '[]');
    return Array.isArray(data) ? data : [];
  }catch(err){
    // Nouveau bucket: l'index resources/index.json n'existe pas encore. On démarre avec une liste vide.
    if (err.status === 404 || /Fichier introuvable|not found|does not exist|object.*not/i.test(String(err.message || err.details?.message || ''))) return [];
    throw err;
  }
}

async function saveResourceIndex(resources){
  const body = Buffer.from(JSON.stringify(resources || [], null, 2), 'utf8');
  await uploadResourceObject(RESOURCE_INDEX_PATH, body, 'application/json; charset=utf-8');
}

async function loadNewsIndex(){
  try{
    const file = await downloadResourceObject(NEWS_INDEX_PATH);
    const data = JSON.parse(file.buffer.toString('utf8') || '[]');
    return Array.isArray(data) ? data : [];
  }catch(err){
    if (err.status === 404 || /Fichier introuvable|not found|does not exist|object.*not/i.test(String(err.message || err.details?.message || ''))) return [];
    throw err;
  }
}

async function saveNewsIndex(news){
  const body = Buffer.from(JSON.stringify(news || [], null, 2), 'utf8');
  await uploadResourceObject(NEWS_INDEX_PATH, body, 'application/json; charset=utf-8');
}

function cleanUrl(value){
  const raw = String(value || '').trim().slice(0, 700);
  if (!raw) return '';
  try{
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  }catch{
    return '';
  }
}

function publicNews(row){
  return {
    id: row.id,
    title: row.title || 'Actualité concours',
    type: row.type || 'Communiqué',
    organization: row.organization || '',
    deadline: row.deadline || '',
    status: row.status || 'Info',
    summary: row.summary || '',
    content: row.content || '',
    sourceUrl: row.source_url || '',
    fileName: row.file_name || '',
    mimeType: row.mime_type || '',
    fileSize: Number(row.size || 0),
    hasPdf: Boolean(row.storage_path),
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function adminNewsPayload(body){
  const payload = {
    title: cleanText(body?.title, 180),
    type: cleanText(body?.type || 'Communiqué', 60),
    organization: cleanText(body?.organization || '', 120),
    deadline: cleanText(body?.deadline || '', 40),
    status: cleanText(body?.status || 'Info', 40),
    summary: cleanText(body?.summary || '', 500),
    content: cleanText(body?.content || '', 6000),
    source_url: cleanUrl(body?.sourceUrl || body?.source_url),
    is_active: body?.is_active === undefined ? true : Boolean(body?.is_active)
  };
  if (payload.title.length < 4) throw Object.assign(new Error('Titre requis'), { status:400 });
  if (payload.content.length < 10 && payload.summary.length < 10) throw Object.assign(new Error('Résumé ou contenu requis'), { status:400 });
  return payload;
}

function headerText(req, name, max=500){
  const raw = String(req.headers[name.toLowerCase()] || '').trim();
  let decoded = raw;
  try{ decoded = decodeURIComponent(raw); }catch{}
  return decoded.slice(0, max).trim();
}

function safeFileName(name){
  const raw = String(name || 'document').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '');
  return (cleaned || 'document').slice(0, 120);
}

function fileKind(fileName, mimeType){
  const name = String(fileName || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)) return 'image';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('word') || mime.includes('officedocument') || /\.(docx?|odt)$/i.test(name)) return 'word';
  return 'document';
}

function isAllowedResourceFile(fileName, mimeType){
  const kind = fileKind(fileName, mimeType);
  return ['image','pdf','word'].includes(kind);
}

function isPdfFile(fileName, mimeType){
  return String(mimeType || '').toLowerCase().includes('pdf') || String(fileName || '').toLowerCase().endsWith('.pdf');
}

function publicResource(row){
  return {
    id: row.id,
    title: row.title || row.file_name || 'Document',
    category: row.category || 'Documents',
    description: row.description || '',
    fileName: row.file_name || 'document',
    mimeType: row.mime_type || 'application/octet-stream',
    kind: row.kind || fileKind(row.file_name, row.mime_type),
    size: Number(row.size || 0),
    is_premium: Boolean(row.is_premium),
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function requestHasPremium(req){
  const sessionData = await getSessionFromRequest(req).catch(() => null);
  if (!sessionData?.profile?.phone) return false;
  const sub = await getActiveSubscription(sessionData.profile.phone);
  return Boolean(sub);
}

function normalizeEmail(value){
  const email = String(value || '').trim().toLowerCase().slice(0, 180);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function htmlEscape(value){
  return String(value || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function profileDisplayName(profile, fallback='candidat'){
  return String(profile?.display_name || `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || fallback).trim();
}

function appEmailFrom(){
  return RESEND_FROM || SMTP_FROM || SMTP_USER || '';
}

async function sendEmailNotification({ to, subject, text, html }){
  const email = normalizeEmail(to);
  if (!email) return false;
  const from = appEmailFrom();
  if (RESEND_API_KEY && from){
    const res = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{ Authorization:`Bearer ${RESEND_API_KEY}`, 'Content-Type':'application/json' },
      body:JSON.stringify({ from, to:email, subject, text, html:html || text })
    });
    if (!res.ok) throw new Error(`Email non envoyé (${res.status})`);
    return true;
  }
  if (SMTP_HOST && SMTP_USER && SMTP_PASS && from){
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host:SMTP_HOST,
      port:SMTP_PORT,
      secure:SMTP_PORT === 465,
      auth:{ user:SMTP_USER, pass:SMTP_PASS }
    });
    await transporter.sendMail({ from, to:email, subject, text, html:html || text });
    return true;
  }
  return false;
}

async function sendSmsNotification({ to, message }){
  const phone = normalizePhone(to);
  const text = String(message || '').trim().slice(0, 480);
  if (!phone || !text) return false;
  if (SMS_API_URL){
    const headers = { 'Content-Type':'application/json' };
    if (SMS_API_TOKEN) headers.Authorization = `Bearer ${SMS_API_TOKEN}`;
    const res = await fetch(SMS_API_URL, {
      method:'POST',
      headers,
      body:JSON.stringify({ to:phone, phone, message:text, text, sender:SMS_SENDER })
    });
    if (!res.ok) throw new Error(`SMS non envoyé (${res.status})`);
    return true;
  }
  if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM){
    const form = new URLSearchParams({ To:phone, From:TWILIO_FROM, Body:text });
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`, {
      method:'POST',
      headers:{ Authorization:`Basic ${auth}`, 'Content-Type':'application/x-www-form-urlencoded' },
      body:form.toString()
    });
    if (!res.ok) throw new Error(`SMS non envoyé (${res.status})`);
    return true;
  }
  return false;
}

async function notifyRegistration(profile, rawEmail){
  const email = normalizeEmail(rawEmail || profile?.email);
  const phone = profile?.phone;
  const name = profileDisplayName(profile, 'candidat');
  const sms = `Bienvenue ${name} sur Réussite Concours BF. Ton compte est créé. Bonne préparation !`;
  const subject = 'Bienvenue sur Réussite Concours BF';
  const text = `Bonjour ${name},\n\nTon compte Réussite Concours BF est bien créé. Tu peux sauvegarder ta progression et préparer tes examens et concours.\n\nBonne préparation !`;
  const html = `<p>Bonjour <b>${htmlEscape(name)}</b>,</p><p>Ton compte <b>Réussite Concours BF</b> est bien créé.</p><p>Tu peux sauvegarder ta progression et préparer tes examens et concours.</p><p>Bonne préparation !</p>`;
  const tasks = [sendSmsNotification({ to:phone, message:sms })];
  if (email) tasks.push(sendEmailNotification({ to:email, subject, text, html }));
  await Promise.allSettled(tasks).then(results => results.forEach(r => { if (r.status === 'rejected') console.warn('Notification inscription:', r.reason?.message || r.reason); }));
}

async function notifyPremiumActivation(profile, sub, rawEmail){
  const email = normalizeEmail(rawEmail || profile?.email);
  const phone = profile?.phone;
  const name = profileDisplayName(profile, 'candidat');
  const endDate = sub?.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) : '';
  const subject = 'Ton Premium est activé';
  const text = `Bonjour ${name},\n\nTon accès Premium Réussite Concours BF est activé${endDate ? ` jusqu'au ${endDate}` : ''}. Tu peux maintenant profiter des contenus Premium.\n\nBonne préparation !`;
  const html = `<p>Bonjour <b>${htmlEscape(name)}</b>,</p><p>Ton accès <b>Premium Réussite Concours BF</b> est activé${endDate ? ` jusqu'au <b>${htmlEscape(endDate)}</b>` : ''}.</p><p>Tu peux maintenant profiter des contenus Premium.</p><p>Bonne préparation !</p>`;
  const sms = `Réussite Concours BF: ton Premium est activé${endDate ? ' jusqu au ' + endDate : ''}. Bonne préparation !`;
  const tasks = [];
  if (email) tasks.push(sendEmailNotification({ to:email, subject, text, html }));
  if (phone) tasks.push(sendSmsNotification({ to:phone, message:sms }));
  await Promise.allSettled(tasks).then(results => results.forEach(r => { if (r.status === 'rejected') console.warn('Notification Premium:', r.reason?.message || r.reason); }));
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

function customerEmailForPhone(phone){
  const digits = String(phone || '').replace(/\D/g, '').slice(-8) || '00000000';
  return `client-${digits}@concoursbf.app`;
}

function addDays(date, days){
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function subscriptionPlan(planId){
  return SUBSCRIPTION_PLANS[planId] || SUBSCRIPTION_PLANS.premium_monthly;
}

function normalizePlanId(value){
  return subscriptionPlan(String(value || 'premium_monthly')).id;
}

function planFromAmount(amount){
  const n = Number(amount || 0);
  return Object.values(SUBSCRIPTION_PLANS).find(plan => Number(plan.amount) === n) || SUBSCRIPTION_PLANS.premium_monthly;
}

function paymentPlanFromRecord(record){
  const raw = record?.raw || {};
  return subscriptionPlan(raw.plan || raw.subscription_plan || raw?.metadata?.plan || raw?.saspay?.metadata?.plan || raw?.saspay_session?.metadata?.plan || planFromAmount(record?.amount).id);
}

function paymentDescription(plan){
  const p = subscriptionPlan(plan?.id || plan);
  return `${p.description} (${p.days} jours)`;
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

async function activateSubscription({ phone, txRef, provider, email, plan:planId, days }){
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Numéro client invalide');

  const plan = subscriptionPlan(planId);
  const durationDays = Math.max(1, Number(days || plan.days || 30));
  const current = subscriptions.get(normalized);
  const sameTxAlreadyInMemory = current?.txRef && txRef && current.txRef === txRef;
  const base = current && new Date(current.expiresAt).getTime() > Date.now()
    ? new Date(current.expiresAt)
    : new Date();
  const expiresAt = addDays(base, durationDays).toISOString();
  const sub = {
    phone: normalized,
    status: 'premium',
    expiresAt,
    txRef,
    provider: provider || 'CINETPAY',
    plan: plan.id,
    days: durationDays,
    updatedAt: new Date().toISOString()
  };
  subscriptions.set(normalized, sub);

  let profile = null;
  let alreadyRecorded = sameTxAlreadyInMemory;
  const cleanEmail = normalizeEmail(email);
  if (supabaseReady()){
    profile = await getProfile(normalized);
    if (txRef){
      const existingRows = await supabaseRequest(`subscriptions?tx_ref=eq.${encodeURIComponent(txRef)}&select=id,expires_at,provider,tx_ref&limit=1`).catch(()=>[]);
      alreadyRecorded = Array.isArray(existingRows) && existingRows.length > 0;
      if (alreadyRecorded && existingRows[0]?.expires_at) sub.expiresAt = existingRows[0].expires_at;
    }
    if (cleanEmail && profile && !profile.email){
      const updated = await saveProfileEmail(normalized, cleanEmail).catch(()=>null);
      if (updated) profile = updated;
      else profile.email = cleanEmail;
    } else if (profile && cleanEmail && !profile.email){
      profile.email = cleanEmail;
    }
    if (!alreadyRecorded){
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
  }

  const notifyKey = txRef || `${normalized}:${expiresAt}`;
  if (!alreadyRecorded && !premiumNotificationTxSent.has(notifyKey)){
    premiumNotificationTxSent.add(notifyKey);
    await notifyPremiumActivation(profile || { phone:normalized, email:cleanEmail }, sub, cleanEmail).catch(err => console.warn('Notification Premium:', err.message));
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


function isAdminProfile(profile){
  if (!profile) return false;
  return profile.role === 'admin' || ADMIN_PHONES.includes(normalizePhone(profile.phone));
}

async function requireAdmin(req, res, next){
  try{
    const sessionData = await getSessionFromRequest(req);
    if (!sessionData) return res.status(401).json({ message:'Session expirée. Reconnecte-toi.' });
    if (!isAdminProfile(sessionData.profile)) return res.status(403).json({ message:'Accès administrateur requis' });
    req.sessionData = sessionData.session;
    req.profile = sessionData.profile;
    req.phone = sessionData.profile.phone;
    next();
  }catch(err){ next(err); }
}

function cleanText(value, max=4000){
  return String(value || '').trim().slice(0, max);
}

function adminQuestionPayload(body){
  const options = Array.isArray(body?.options) ? body.options : [body?.option_a, body?.option_b, body?.option_c, body?.option_d];
  const payload = {
    category: cleanText(body?.category, 80),
    level: cleanText(body?.level || 'BEPC', 40),
    question_text: cleanText(body?.question_text || body?.question, 1200),
    option_a: cleanText(options[0], 500),
    option_b: cleanText(options[1], 500),
    option_c: cleanText(options[2], 500),
    option_d: cleanText(options[3], 500),
    correct_answer: Number(body?.correct_answer),
    explanation: cleanText(body?.explanation, 3000),
    is_premium: Boolean(body?.is_premium),
    is_active: body?.is_active === undefined ? true : Boolean(body?.is_active),
    source: cleanText(body?.source || 'Ajout administrateur', 500)
  };
  if (!payload.category) throw Object.assign(new Error('Catégorie requise'), { status:400 });
  if (payload.question_text.length < 8) throw Object.assign(new Error('Question trop courte'), { status:400 });
  const opts = [payload.option_a, payload.option_b, payload.option_c, payload.option_d];
  if (opts.some(o => !o)) throw Object.assign(new Error('Les 4 options sont obligatoires'), { status:400 });
  if (new Set(opts.map(o => o.toLowerCase())).size !== 4) throw Object.assign(new Error('Les options doivent être différentes'), { status:400 });
  if (!Number.isInteger(payload.correct_answer) || payload.correct_answer < 0 || payload.correct_answer > 3) throw Object.assign(new Error('Bonne réponse invalide'), { status:400 });
  if (payload.explanation.length < 15) throw Object.assign(new Error('Explication trop courte'), { status:400 });
  return payload;
}

function normalizeGeminiModelName(name){
  return String(name || '').replace(/^models\//, '').trim();
}

async function listGeminiModels(){
  if (!GEMINI_API_KEY) return [];
  try{
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`);
    const data = await res.json().catch(()=>({}));
    if (!res.ok || !Array.isArray(data.models)) return [];
    return data.models
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => normalizeGeminiModelName(m.name))
      .filter(Boolean);
  }catch{
    return [];
  }
}

async function geminiModelsToTry(){
  const preferred = [GEMINI_MODEL, 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'].map(normalizeGeminiModelName).filter(Boolean);
  const available = await listGeminiModels();
  const availableSet = new Set(available);
  const prioritized = available.length
    ? preferred.filter(m => availableSet.has(m)).concat(available.filter(m => /flash/i.test(m)), available)
    : preferred;
  return Array.from(new Set(prioritized.map(normalizeGeminiModelName).filter(Boolean)));
}

function extractJsonFromAi(text){
  const raw = String(text || '').trim();
  if (!raw) throw Object.assign(new Error('Réponse IA vide'), { status:502 });
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try{ return JSON.parse(candidate); }catch{}
  const startArray = candidate.indexOf('[');
  const endArray = candidate.lastIndexOf(']');
  if (startArray >= 0 && endArray > startArray){
    return JSON.parse(candidate.slice(startArray, endArray + 1));
  }
  const startObj = candidate.indexOf('{');
  const endObj = candidate.lastIndexOf('}');
  if (startObj >= 0 && endObj > startObj){
    return JSON.parse(candidate.slice(startObj, endObj + 1));
  }
  throw Object.assign(new Error('Réponse IA non lisible'), { status:502 });
}

function normalizeAiQuestion(item, defaults = {}){
  const options = Array.isArray(item?.options) ? item.options : [item?.option_a, item?.option_b, item?.option_c, item?.option_d];
  const correctRaw = item?.correct_answer ?? item?.answer_index ?? item?.answer ?? item?.correctIndex;
  let correct = Number(correctRaw);
  if (!Number.isInteger(correct)){
    const label = String(correctRaw || '').trim().toUpperCase();
    correct = ({A:0, B:1, C:2, D:3})[label] ?? -1;
  }
  return adminQuestionPayload({
    category:item?.category || defaults.category,
    level:item?.level || defaults.level,
    question_text:item?.question_text || item?.question,
    options,
    correct_answer:correct,
    explanation:item?.explanation || item?.correction || item?.reason,
    source:item?.source || 'Créé avec l’aide de l’IA',
    is_premium:defaults.is_premium,
    is_active:false
  });
}

function normalizeAiQuestionList(aiText, defaults, count){
  const parsed = extractJsonFromAi(aiText);
  const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.questions) ? parsed.questions : []);
  const questions = [];
  for (const row of rows){
    try{
      questions.push(normalizeAiQuestion(row, defaults));
    }catch(err){ /* ignore invalid draft */ }
  }
  return questions.slice(0, count);
}

function aiQcmPrompt({ count, category, level, theme, fromPdf = false }){
  const sourceLine = fromPdf
    ? `Lis le PDF joint et génère exactement ${count} QCM en français à partir de son contenu. Si une information n'est pas clairement présente dans le PDF, ne l'invente pas.`
    : `Génère exactement ${count} QCM en français.`;
  return `Tu es un enseignant expert en préparation aux examens et concours au Burkina Faso.\n${sourceLine}\nCatégorie: ${category}. Niveau: ${level}. Thème: ${theme}.\nContraintes importantes:\n- chaque QCM doit être factuel, clair, non ambigu, adapté au Burkina Faso si pertinent;\n- 4 options obligatoires, toutes différentes;\n- une seule bonne réponse;\n- correction détaillée et pédagogique;\n- éviter les affirmations incertaines ou inventées;\n- si le thème concerne un fait officiel récent, rester général et mentionner qu'il faut vérifier la source officielle;\n- les QCM générés doivent être relus par l'administrateur avant publication.\nRéponds uniquement en JSON valide sous cette forme: {"questions":[{"category":"...","level":"...","question_text":"...","options":["...","...","...","..."],"correct_answer":0,"explanation":"...","source":"Créé avec l’aide de l’IA"}]}`;
}

async function callGeminiGenerateParts(parts){
  if (!GEMINI_API_KEY) throw Object.assign(new Error('Service IA indisponible'), { status:503 });
  let lastError = null;
  const models = await geminiModelsToTry();
  for (const model of models){
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    for (const jsonMode of [true, false]){
      const generationConfig = { temperature:0.35, topP:0.9, maxOutputTokens:6000 };
      if (jsonMode) generationConfig.responseMimeType = 'application/json';
      const res = await fetch(url, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({
          contents:[{ role:'user', parts }],
          generationConfig
        })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok){
        lastError = data?.error?.message || `Erreur IA ${res.status}`;
        if (res.status === 400 && jsonMode && /responseMimeType|mime|schema/i.test(lastError || '')) continue;
        break;
      }
      const text = (data?.candidates || [])
        .flatMap(c => c?.content?.parts || [])
        .map(part => part?.text || '')
        .join('\n')
        .trim();
      return { model, text };
    }
  }
  console.warn('Gemini generation failed:', lastError);
  const friendly = /quota|rate|429/i.test(lastError || '')
    ? 'Quota gratuit IA atteint pour le moment. Réessaie plus tard.'
    : 'IA indisponible pour le moment. Réessaie un peu plus tard.';
  const err = new Error(friendly);
  err.status = /quota|rate|429/i.test(lastError || '') ? 429 : 502;
  throw err;
}

async function callGeminiGenerate(prompt){
  return callGeminiGenerateParts([{ text:prompt }]);
}

function todayId(date = new Date()){
  return date.toISOString().slice(0, 10);
}

function daysSinceEpoch(dateId){
  const t = Date.parse(`${dateId}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 864e5) : Math.floor(Date.now() / 864e5);
}

function dailyAiPlan(dateId = todayId(), overrides = {}){
  const count = Math.min(20, Math.max(1, Number(overrides.count || AI_DAILY_QCM_COUNT || 20)));
  const categories = AI_DAILY_CATEGORIES.length ? AI_DAILY_CATEGORIES : AI_DAILY_DEFAULT_CATEGORIES;
  const levels = AI_DAILY_LEVELS.length ? AI_DAILY_LEVELS : AI_DAILY_DEFAULT_LEVELS;
  const day = daysSinceEpoch(dateId);
  const category = cleanText(overrides.category || categories[day % categories.length] || 'Culture générale', 80);
  const level = cleanText(overrides.level || levels[Math.floor(day / Math.max(1, categories.length)) % levels.length] || 'Concours', 40);
  const mode = ['module','niveau'].includes(String(overrides.mode || '').toLowerCase()) ? String(overrides.mode).toLowerCase() : AI_DAILY_GROUP_MODE;
  const isPremium = overrides.is_premium === undefined ? AI_DAILY_IS_PREMIUM : Boolean(overrides.is_premium);
  const theme = cleanText(overrides.theme || (mode === 'niveau'
    ? `Série quotidienne ${dateId} — niveau ${level}, module ${category}`
    : `Série quotidienne ${dateId} — module ${category}, niveau ${level}`), 220);
  return { date:dateId, count, category, level, mode, is_premium:isPremium, theme };
}

async function loadAiDailyIndex(){
  try{
    const file = await downloadResourceObject(AI_DAILY_INDEX_PATH);
    const data = JSON.parse(file.buffer.toString('utf8') || '[]');
    return Array.isArray(data) ? data : [];
  }catch(err){
    if (err.status === 404 || /Fichier introuvable|not found|does not exist|object.*not/i.test(String(err.message || err.details?.message || ''))) return [];
    throw err;
  }
}

async function saveAiDailyIndex(rows){
  const body = Buffer.from(JSON.stringify(rows || [], null, 2), 'utf8');
  await uploadResourceObject(AI_DAILY_INDEX_PATH, body, 'application/json; charset=utf-8');
}

function publicAiDailyDraft(row){
  return {
    id:row.id,
    date:row.date,
    title:safePdfTitle(row.title || 'QCM quotidien'),
    category:row.category,
    level:row.level,
    count:Number(row.count || row.questions?.length || 0),
    is_premium:Boolean(row.is_premium),
    status:row.status || 'draft',
    model:row.model || '',
    fileName:row.file_name || '',
    created_at:row.created_at,
    published_at:row.published_at || '',
    questions:Array.isArray(row.questions) ? row.questions : []
  };
}

function pdfCleanText(value){
  return String(value || '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[•●]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '')
    .trim();
}

function pdfEscape(value){
  return pdfCleanText(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapPdfLine(text, width = 92){
  const words = pdfCleanText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words){
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line){ lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function safePdfTitle(value){
  return pdfCleanText(value || 'QCM quotidien')
    .replace(/\bIA\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/QCM quotidien\s*[-—]\s*/i, 'QCM quotidien — ')
    .trim();
}

function drawPdfHeader(doc, { date, title }){
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const margin = 42;
  doc.save();
  doc.rect(0, 0, pageW, pageH).fill('#f6f8f7');
  doc.roundedRect(margin - 10, 28, pageW - (margin - 10) * 2, 88, 24).fill('#064e3b');
  doc.circle(pageW - 66, 48, 44).fillOpacity(0.16).fill('#fbbf24').fillOpacity(1);
  doc.roundedRect(margin + 2, 43, 56, 56, 18).fill('#ffffff');
  const logoPath = path.join(PUBLIC_DIR, 'img', 'logo.png');
  if (fs.existsSync(logoPath)){
    try{ doc.image(logoPath, margin + 7, 48, { fit:[46, 46] }); }catch{}
  }else{
    doc.fillColor('#057a55').font('Helvetica-Bold').fontSize(12).text('BF', margin + 21, 62, { width:28, align:'center' });
  }
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(19).text('Réussite', margin + 72, 48, { width:220 });
  doc.fillColor('#d1fae5').font('Helvetica-Bold').fontSize(16).text('Concours BF', margin + 72, 70, { width:220 });
  doc.roundedRect(pageW - 175, 51, 104, 28, 14).fill('#ecfdf5');
  doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(10).text(formatDateForPdf(date), pageW - 165, 60, { width:84, align:'center' });
  doc.fillColor('#6b7280').font('Helvetica').fontSize(8).text('Réussite Concours BF — Document de révision', margin, pageH - 34, { width:pageW - margin * 2, align:'center' });
  doc.restore();
  doc.y = 138;
}

function formatDateForPdf(value){
  if (!value) return todayId();
  try{
    return new Intl.DateTimeFormat('fr-FR', { day:'2-digit', month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(`${value}T00:00:00Z`));
  }catch{
    return String(value || todayId());
  }
}

function answerLabel(index){
  return ['A','B','C','D'][Number(index || 0)] || 'A';
}

async function buildQcmDraftPdf({ title, date, category, level, questions }){
  return new Promise((resolve, reject) => {
    const cleanTitle = safePdfTitle(title || `QCM quotidien — ${category || 'Module'} — ${level || 'Niveau'} — ${date || todayId()}`);
    const doc = new PDFDocument({
      size:'A4',
      margin:42,
      info:{
        Title:cleanTitle,
        Author:'Réussite Concours BF',
        Subject:'QCM quotidien à vérifier avant publication'
      }
    });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = 42;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - margin * 2;
    const bottomLimit = pageH - 62;

    function newPage(){
      doc.addPage();
      drawPdfHeader(doc, { date, title:cleanTitle });
    }
    function ensureSpace(height){
      if (doc.y + height > bottomLimit) newPage();
    }
    function chip(x, y, label, value, w){
      doc.roundedRect(x, y, w, 25, 12).fill('#ecfdf5');
      doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(7.5).text(pdfCleanText(label).toUpperCase(), x + 9, y + 5, { width:w - 18 });
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9.2).text(pdfCleanText(value), x + 9, y + 14, { width:w - 18, ellipsis:true });
    }
    function textHeight(text, width, font='Helvetica', size=10, options={}){
      doc.font(font).fontSize(size);
      return doc.heightOfString(pdfCleanText(text), { width, ...options });
    }

    drawPdfHeader(doc, { date, title:cleanTitle });
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(21).text(cleanTitle, margin, doc.y, { width:contentW - 4, lineGap:2 });
    doc.moveDown(0.65);
    const chipY = doc.y;
    chip(margin, chipY, 'Date', formatDateForPdf(date), 128);
    chip(margin + 138, chipY, 'Module', category || 'Module', 150);
    chip(margin + 298, chipY, 'Niveau', level || 'Niveau', 104);
    chip(margin + 412, chipY, 'QCM', String((questions || []).length || 0), 56);
    doc.y = chipY + 42;
    doc.roundedRect(margin, doc.y, contentW, 34, 13).fill('#fff7ed');
    doc.fillColor('#92400e').font('Helvetica-Bold').fontSize(10).text('Document de relecture', margin + 14, doc.y + 8, { width:160 });
    doc.fillColor('#78350f').font('Helvetica').fontSize(9.5).text('Vérifie les questions, les réponses et les corrections avant publication.', margin + 165, doc.y + 8, { width:contentW - 180 });
    doc.y += 52;

    (questions || []).forEach((q, idx) => {
      const opts = [q.option_a, q.option_b, q.option_c, q.option_d].map(pdfCleanText);
      const qText = pdfCleanText(q.question_text || 'Question');
      const explanation = pdfCleanText(q.explanation || 'Correction à vérifier.');
      const questionW = contentW - 68;
      const qH = textHeight(qText, questionW, 'Helvetica-Bold', 11.2, { lineGap:2 });
      const optH = opts.reduce((sum, opt) => sum + Math.max(17, textHeight(opt, contentW - 68, 'Helvetica', 9.7, { lineGap:1 }) + 3), 0);
      const corrH = Math.max(38, textHeight(explanation, contentW - 46, 'Helvetica', 9.3, { lineGap:1 }) + 27);
      const cardH = Math.min(360, Math.max(148, 52 + qH + optH + corrH));
      ensureSpace(cardH + 14);
      const y = doc.y;
      doc.roundedRect(margin, y, contentW, cardH, 16).fill('#ffffff').strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.circle(margin + 24, y + 26, 14).fill('#0e9f6e');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11).text(String(idx + 1), margin + 16, y + 21, { width:16, align:'center' });
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11.2).text(qText, margin + 48, y + 16, { width:questionW, lineGap:2 });
      let cy = Math.max(y + 54, doc.y + 10);
      opts.forEach((opt, optIdx) => {
        const label = ['A','B','C','D'][optIdx];
        const oh = Math.max(17, textHeight(opt, contentW - 68, 'Helvetica', 9.7, { lineGap:1 }) + 3);
        doc.roundedRect(margin + 18, cy - 2, 22, 16, 8).fill('#f3f4f6');
        doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8.7).text(label, margin + 25, cy + 2, { width:8, align:'center' });
        doc.fillColor('#1f2937').font('Helvetica').fontSize(9.7).text(opt, margin + 48, cy, { width:contentW - 68, lineGap:1 });
        cy += oh;
      });
      const answer = answerLabel(q.correct_answer);
      const corrY = Math.min(y + cardH - corrH - 12, cy + 8);
      doc.roundedRect(margin + 14, corrY, contentW - 28, y + cardH - corrY - 12, 12).fill('#ecfdf5');
      doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(9.2).text(`Bonne réponse : ${answer}`, margin + 28, corrY + 9, { width:130 });
      doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(9.2).text('Correction', margin + 28, corrY + 23, { width:90 });
      doc.fillColor('#064e3b').font('Helvetica').fontSize(9.3).text(explanation, margin + 106, corrY + 23, { width:contentW - 146, lineGap:1 });
      doc.y = y + cardH + 14;
    });

    doc.end();
  });
}

async function generateDailyAiQcmDraft({ force=false, overrides={} } = {}){
  if (!GEMINI_API_KEY) throw Object.assign(new Error('Service IA indisponible'), { status:503 });
  if (!supabaseReady()) throw Object.assign(new Error('Stockage Supabase requis pour garder les PDF IA quotidiens'), { status:503 });
  const plan = dailyAiPlan(todayId(), overrides);
  const drafts = await loadAiDailyIndex();
  const existing = drafts.find(d => d.date === plan.date && d.status !== 'deleted');
  if (existing && !force) return { draft:existing, skipped:true, plan };
  const prompt = `${aiQcmPrompt({ count:plan.count, category:plan.category, level:plan.level, theme:plan.theme })}\n\nImportant pour cette generation quotidienne: les corrections doivent etre detaillees mais concises pour tenir dans un PDF de relecture. Source: Brouillon IA quotidien a verifier.`;
  const ai = await callGeminiGenerate(prompt);
  const questions = normalizeAiQuestionList(ai.text, { category:plan.category, level:plan.level, is_premium:plan.is_premium }, plan.count);
  if (!questions.length) throw Object.assign(new Error('Aucun QCM quotidien valide généré'), { status:502 });
  const title = `QCM quotidien — ${plan.category} — ${plan.level} — ${plan.date}`;
  const pdfBuffer = await buildQcmDraftPdf({ title, date:plan.date, category:plan.category, level:plan.level, questions });
  const id = 'daily-' + plan.date.replace(/\D/g, '') + '-' + crypto.randomBytes(4).toString('hex');
  const fileName = safeFileName(`${title}.pdf`);
  const objectPath = `ai-daily/files/${plan.date.slice(0,4)}/${id}-${fileName}`;
  await uploadResourceObject(objectPath, pdfBuffer, 'application/pdf');
  const draft = {
    id,
    date:plan.date,
    title,
    category:plan.category,
    level:plan.level,
    count:questions.length,
    is_premium:plan.is_premium,
    status:'draft',
    model:ai.model,
    file_name:fileName,
    mime_type:'application/pdf',
    size:pdfBuffer.length,
    storage_path:objectPath,
    questions,
    created_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };
  const filtered = drafts.filter(d => d.id !== existing?.id && d.date !== plan.date);
  filtered.unshift(draft);
  await saveAiDailyIndex(filtered.slice(0, 90));
  return { draft, skipped:false, plan };
}

function cronAuthorized(req){
  const expected = AI_DAILY_CRON_SECRET;
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const querySecret = String(req.query?.secret || '').trim();
  if (expected) return auth === expected || querySecret === expected;
  return /vercel-cron/i.test(String(req.headers['user-agent'] || ''));
}


const DEFAULT_OFFICIAL_NEWS_SOURCES = [
  { name:'Ministère de la Fonction publique', url:'https://www.fonction-publique.gov.bf/accueil/actualites' },
  { name:'Ministère de la Fonction publique — Accueil', url:'https://www.fonction-publique.gov.bf/accueil' },
  { name:'Plateforme eConcours', url:'https://www.econcours.gov.bf/' },
  { name:'Plateforme eConcours professionnels', url:'https://www.econcours-pro.gov.bf/' }
];

function officialNewsSources(){
  const custom = String(OFFICIAL_NEWS_SOURCES || '').split(/[,;\r\n]+/).map(v => v.trim()).filter(Boolean).map((entry, idx) => {
    const [name, url] = entry.includes('|') ? entry.split('|').map(x => x.trim()) : [`Source officielle ${idx + 1}`, entry];
    return cleanUrl(url) ? { name:name || `Source officielle ${idx + 1}`, url:cleanUrl(url) } : null;
  }).filter(Boolean);
  return custom.length ? custom : DEFAULT_OFFICIAL_NEWS_SOURCES;
}

function decodeHtmlEntities(value){
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripHtml(value){
  return decodeHtmlEntities(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function absoluteSourceUrl(href, base){
  try{ return new URL(String(href || '').trim(), base).toString(); }catch{ return ''; }
}

function officialNewsKeyword(text){
  return /(concours|recrut|communiqu|résultat|resultat|admissibil|admission|inscription|econcours|e-concours|session|fonction publique|calendrier|ouverture|dépôt|depot)/i.test(String(text || ''));
}

const FRENCH_MONTHS = {
  janvier:0, février:1, fevrier:1, mars:2, avril:3, mai:4, juin:5,
  juillet:6, août:7, aout:7, septembre:8, octobre:9, novembre:10, décembre:11, decembre:11
};

function startOfDay(date = new Date()){
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseOfficialDates(text, now = new Date()){
  const raw = String(text || '').toLowerCase();
  const dates = [];
  let m;
  const add = (year, month, day) => {
    const y = Number(year), mo = Number(month), d = Number(day);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return;
    if (y < 2020 || y > now.getFullYear() + 2 || mo < 1 || mo > 12 || d < 1 || d > 31) return;
    const dt = new Date(y, mo - 1, d);
    if (!Number.isNaN(dt.getTime())) dates.push(dt);
  };
  const numeric = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/g;
  while ((m = numeric.exec(raw))) add(m[3], m[2], m[1]);
  const iso = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = iso.exec(raw))) add(m[1], m[2], m[3]);
  const monthNames = Object.keys(FRENCH_MONTHS).join('|');
  const fr = new RegExp(`\b(\d{1,2})(?:er)?\s+(${monthNames})\s+(20\d{2})\b`, 'gi');
  while ((m = fr.exec(raw))) add(m[3], FRENCH_MONTHS[m[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '')] + 1 || FRENCH_MONTHS[m[2]] + 1, m[1]);
  return dates;
}

function officialYears(text){
  return Array.from(new Set((String(text || '').match(/\b20\d{2}\b/g) || []).map(Number))).filter(Boolean);
}

function hasDeadlineMeaning(text){
  return /(date limite|cl[oô]ture|fin des inscriptions|dernier délai|dernier delai|jusqu(?:'|’|e|au)|du\s+\d{1,2}|au\s+\d{1,2}|inscriptions? en ligne|dépôt des dossiers|depot des dossiers)/i.test(String(text || ''));
}

function isCurrentOfficialCandidate(item, now = new Date()){
  const today = startOfDay(now);
  const currentYear = now.getFullYear();
  const titleText = String(item?.title || '');
  const titleYears = officialYears(titleText);
  if (titleYears.length && Math.max(...titleYears) < currentYear) return false;
  const text = `${item?.title || ''} ${item?.snippet || ''} ${item?.url || ''}`;
  const years = officialYears(text);
  if (years.length && Math.max(...years) < currentYear) return false;
  const dates = parseOfficialDates(text, now);
  if (dates.length){
    const maxDate = dates.reduce((a, b) => a > b ? a : b);
    if (maxDate.getFullYear() < currentYear) return false;
    if (hasDeadlineMeaning(text) && maxDate < today) return false;
    return maxDate.getFullYear() >= currentYear;
  }
  if (years.length) return years.some(y => y >= currentYear);
  // Sans année/date explicite, on évite de proposer un vieux communiqué.
  return false;
}

async function fetchOfficialSource(source){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try{
    const res = await fetch(source.url, {
      signal:controller.signal,
      headers:{
        'User-Agent':'ReussiteConcoursBF/1.0 (+veille concours)',
        'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(`Source indisponible ${res.status}`), { status:res.status });
    return { ...source, html:text.slice(0, 400000) };
  }finally{
    clearTimeout(timer);
  }
}

function extractOfficialCandidates(page, now = new Date()){
  const html = String(page.html || '');
  const cleanPageText = stripHtml(html).slice(0, 9000);
  const candidates = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html)) && candidates.length < 30){
    const url = absoluteSourceUrl(match[1], page.url);
    const title = stripHtml(match[2]).replace(/\s+/g, ' ').trim();
    if (!url || title.length < 8 || title.length > 260) continue;
    const contextStart = Math.max(0, match.index - 900);
    const contextEnd = Math.min(html.length, anchorRe.lastIndex + 900);
    const context = stripHtml(html.slice(contextStart, contextEnd)).replace(/\s+/g, ' ').trim();
    const snippet = cleanText(context || title, 900);
    if (!officialNewsKeyword(title + ' ' + snippet + ' ' + url)) continue;
    const item = { title, url, sourceName:page.name, snippet };
    if (!isCurrentOfficialCandidate(item, now)) continue;
    const key = title.toLowerCase() + '|' + url;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(item);
  }
  if (!candidates.length && officialNewsKeyword(cleanPageText)){
    const pageTitle = stripHtml((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,'Actualités concours'])[1]);
    const item = {
      title:pageTitle || `Actualités — ${page.name}`,
      url:page.url,
      sourceName:page.name,
      snippet:cleanPageText.slice(0, 900)
    };
    if (isCurrentOfficialCandidate(item, now)) candidates.push(item);
  }
  return candidates.map(item => ({ ...item, snippet:String(item.snippet || cleanPageText).slice(0, 900) }));
}

function fallbackOfficialDrafts(candidates, limit){
  return candidates.slice(0, limit).map(item => ({
    title:cleanText(item.title, 180),
    type:/résultat|resultat|admission|admissibil/i.test(item.title) ? 'Résultat' : (/recrut/i.test(item.title) ? 'Recrutement' : 'Communiqué'),
    organization:item.sourceName || 'Source officielle',
    deadline:'',
    status:/ouvert|inscription|ouverture/i.test(item.title) ? 'Ouvert' : 'Info',
    summary:cleanText(item.snippet || item.title, 500),
    content:cleanText(`${item.snippet || item.title}\n\nSource officielle à relire avant publication.`, 4000),
    sourceUrl:item.url,
    sourceName:item.sourceName || 'Source officielle'
  })).filter(item => item.title && item.sourceUrl);
}

function normalizeOfficialNewsDraft(item, fallback = {}){
  return {
    title:cleanText(item?.title || fallback.title, 180),
    type:cleanText(item?.type || fallback.type || 'Communiqué', 60),
    organization:cleanText(item?.organization || fallback.organization || fallback.sourceName || 'Source officielle', 120),
    deadline:cleanText(item?.deadline || '', 40),
    status:cleanText(item?.status || fallback.status || 'Info', 40),
    summary:cleanText(item?.summary || fallback.summary || fallback.snippet || '', 500),
    content:cleanText(item?.content || fallback.content || fallback.snippet || fallback.title || '', 6000),
    sourceUrl:cleanUrl(item?.sourceUrl || item?.source_url || fallback.sourceUrl || fallback.url),
    sourceName:cleanText(item?.sourceName || fallback.sourceName || fallback.organization || 'Source officielle', 120)
  };
}

async function buildOfficialNewsDrafts(limit = 6){
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const currentYear = now.getFullYear();
  const pages = await Promise.allSettled(officialNewsSources().map(fetchOfficialSource));
  const candidates = pages
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => extractOfficialCandidates(r.value, now));
  const unique = [];
  const seen = new Set();
  for (const item of candidates){
    if (!isCurrentOfficialCandidate(item, now)) continue;
    const key = `${String(item.title || '').toLowerCase()}|${item.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  if (!unique.length) return { candidates:[], items:[], today:todayIso, currentYear };
  let items = [];
  if (GEMINI_API_KEY){
    try{
      const prompt = `Tu es assistant de veille pour Réussite Concours BF. Date du jour: ${todayIso}. À partir de cette liste issue de sources officielles, propose au maximum ${limit} propositions d'actualités concours À JOUR UNIQUEMENT. Règles strictes: ne propose aucun communiqué de 2025, 2024 ou année antérieure; ne propose aucune inscription/date limite déjà clôturée avant ${todayIso}; privilégie session ${currentYear}, résultats récents ${currentYear}, ouvertures en cours ou échéances futures; n'invente rien hors des extraits. Si une date limite n'est pas claire, laisse deadline vide et mets status "Info". Réponds uniquement en JSON valide: {"items":[{"title":"...","type":"Concours|Recrutement|Communiqué|Résultat|Calendrier","organization":"...","deadline":"YYYY-MM-DD ou vide","status":"Ouvert|Bientôt|Info|Clôturé","summary":"...","content":"...","sourceUrl":"...","sourceName":"..."}]}\n\nSources filtrées actuelles:\n${JSON.stringify(unique.slice(0, 30), null, 2)}`;
      const ai = await callGeminiGenerate(prompt);
      const parsed = extractJsonFromAi(ai.text);
      const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : []);
      items = rows
        .map(row => normalizeOfficialNewsDraft(row))
        .filter(item => item.title && item.summary && item.sourceUrl && isCurrentOfficialCandidate({ title:item.title, url:item.sourceUrl, snippet:`${item.summary} ${item.content} ${item.deadline}` }, now))
        .slice(0, limit);
    }catch(err){
      console.warn('Veille IA actualités fallback:', err.message);
    }
  }
  if (!items.length){
    items = fallbackOfficialDrafts(unique, limit)
      .map(item => normalizeOfficialNewsDraft(item))
      .filter(item => isCurrentOfficialCandidate({ title:item.title, url:item.sourceUrl, snippet:`${item.summary} ${item.content} ${item.deadline}` }, now));
  }
  return { candidates:unique, items:items.slice(0, limit), today:todayIso, currentYear };
}

function requireCinetPayConfig(){
  if (!CINETPAY_APIKEY || !CINETPAY_SITE_ID){
    const err = new Error('Paiement indisponible pour le moment.');
    err.status = 500;
    throw err;
  }
}


function requireSasPayConfig(){
  if (!SASPAY_API_KEY){
    const err = new Error('Paiement Mobile Money indisponible pour le moment.');
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
    const detail = data?.message || data?.detail || data?.error || data?.code || (data && typeof data === 'object' ? JSON.stringify(data).slice(0, 240) : '');
    const err = new Error(detail ? `SasPay: ${detail}` : `Erreur SasPay ${res.status}`);
    err.status = res.status;
    err.details = data;
    throw err;
  }
  return data;
}


function saspayPayload(value){
  if (value && typeof value === 'object' && value.data && typeof value.data === 'object') return value.data;
  return value || {};
}

function saspayCheckoutUrl(value){
  const data = saspayPayload(value);
  return data.checkout_url || data.payment_url || value?.checkout_url || value?.payment_url || '';
}

function saspayId(value){
  const data = saspayPayload(value);
  return data.id || value?.id || '';
}

function saspayStatus(value){
  const data = saspayPayload(value);
  return data.status || value?.status || 'PENDING';
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
  const payload = saspayPayload(data);
  return { ...(raw || {}), saspay_id: payload?.id || raw?.saspay_id, saspay: payload || raw?.saspay, saspay_response: data || raw?.saspay_response };
}

async function createPaymentRecord({ tx, phone, provider, status='INITIATED', raw, plan:planId, amount }){
  const plan = subscriptionPlan(planId || raw?.plan);
  const finalAmount = Number(amount || plan.amount);
  const finalRaw = { ...(raw || {}), plan:plan.id, amount:finalAmount };
  payments.set(tx, { tx, phone, provider, plan:plan.id, amount: finalAmount, currency:'XOF', status, raw:finalRaw, createdAt:new Date().toISOString() });
  if (!supabaseReady()) return;
  const profile = await getProfile(phone);
  await supabaseRequest('payments?on_conflict=tx_ref', {
    method:'POST',
    prefer:'resolution=merge-duplicates,return=minimal',
    body:[{ profile_id:profile?.id || null, phone, tx_ref:tx, provider, amount:finalAmount, currency:'XOF', status, raw:finalRaw }]
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
    if (item?.raw?.saspay_id === paymentId || item?.raw?.saspay?.id === paymentId || item?.raw?.saspay_session?.transaction?.id === paymentId) return item;
  }
  if (!supabaseReady()) return null;
  const rows = await supabaseRequest('payments?provider=eq.SASPAY&select=*&order=created_at.desc&limit=200');
  return Array.isArray(rows) ? rows.find(r => r?.raw?.saspay_id === paymentId || r?.raw?.saspay?.id === paymentId || r?.raw?.saspay_session?.transaction?.id === paymentId) || null : null;
}

function paymentIsSuccessful(data, planOrId){
  const plan = subscriptionPlan(planOrId?.id || planOrId);
  const payload = saspayPayload(data);
  const status = String(payload?.status || '').toUpperCase();
  const amount = Number(payload?.requested_amount || payload?.amount || payload?.net_amount || 0);
  const currency = String(payload?.currency || '').toUpperCase();
  return ['SUCCESS', 'PAID'].includes(status) && amount === Number(plan.amount) && currency === 'XOF';
}

function checkoutSessionPaid(session, planOrId){
  const plan = subscriptionPlan(planOrId?.id || planOrId);
  const payload = saspayPayload(session);
  const status = String(payload?.status || '').toUpperCase();
  const amount = Number(payload?.amount || 0);
  const currency = String(payload?.currency || '').toUpperCase();
  return (status === 'PAID' || Boolean(payload?.paid_at)) && amount === Number(plan.amount) && currency === 'XOF';
}

function isMissingAvatarColumnError(err){
  const msg = String(err?.message || err?.details?.message || err?.details?.hint || '');
  return /avatar_data|schema cache|column/i.test(msg);
}

function isMissingEmailColumnError(err){
  const msg = String(err?.message || err?.details?.message || err?.details?.hint || '');
  return /email|schema cache|column/i.test(msg);
}

async function saveProfileEmail(phone, email){
  const normalized = normalizePhone(phone);
  const clean = normalizeEmail(email);
  if (!normalized || !clean || !supabaseReady()) return null;
  try{
    const rows = await supabaseRequest(`profiles?phone=eq.${encodeURIComponent(normalized)}&select=*`, {
      method:'PATCH',
      prefer:'return=representation',
      body:{ email:clean }
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }catch(err){
    if (isMissingEmailColumnError(err)) return null;
    throw err;
  }
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
    email: row.email || '',
    avatarData: row.avatar_data || '',
    role: row.role || 'student',
    isAdmin: isAdminProfile(row),
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
    if (!supabaseReady()) return res.status(503).json({ message:'Stockage indisponible pour le moment.' });
    const phone = normalizePhone(req.body?.phone);
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const email = normalizeEmail(req.body?.email);
    const pin = String(req.body?.pin || '').replace(/\D/g, '');
    const avatarData = cleanAvatarData(req.body?.avatarData);
    if (!phone) return res.status(400).json({ message:'Numéro invalide' });
    if (firstName.length < 2 || lastName.length < 2) return res.status(400).json({ message:'Nom et prénom requis' });
    if (!email) return res.status(400).json({ message:'Adresse e-mail invalide' });
    if (pin.length < 4) return res.status(400).json({ message:'PIN invalide' });

    const displayName = `${firstName} ${lastName}`.trim();
    const profilePayload = {
      phone,
      first_name:firstName,
      last_name:lastName,
      display_name:displayName,
      email,
      pin_hash:hashPin(pin),
      last_login_at:new Date().toISOString()
    };
    let rows;
    try{
      rows = await supabaseRequest('profiles?on_conflict=phone&select=*', {
        method:'POST',
        prefer:'resolution=merge-duplicates,return=representation',
        body:[profilePayload]
      });
    }catch(err){
      if (!isMissingEmailColumnError(err)) throw err;
      const { email: _email, ...fallbackPayload } = profilePayload;
      rows = await supabaseRequest('profiles?on_conflict=phone&select=*', {
        method:'POST',
        prefer:'resolution=merge-duplicates,return=representation',
        body:[fallbackPayload]
      });
    }
    let profile = Array.isArray(rows) ? rows[0] : null;
    if (profile && !profile.email) profile.email = email;
    if (avatarData){
      const updated = await saveProfileAvatar(phone, avatarData);
      if (updated) profile = updated;
      else if (profile) profile.avatar_data = avatarData; // visible immédiatement même si la migration n'a pas encore été relancée
    }
    const progress = await ensureProgress(profile);
    const subscription = await getActiveSubscription(phone);
    const session = await createSession(profile, req);
    await notifyRegistration(profile || { phone, first_name:firstName, last_name:lastName, display_name:displayName, email }, email).catch(err => console.warn('Notification inscription:', err.message));
    const user = safeProfile(profile);
    if (user && !user.email) user.email = email;
    res.json({ user, progress, subscription, session });
  }catch(err){ next(err); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Stockage indisponible pour le moment.' });
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
    if (!supabaseReady()) return res.status(503).json({ message:'Stockage indisponible pour le moment.' });
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
    const { amount, currency, transactionId, provider, customer, returnUrl, plan:planId } = req.body || {};
    const phone = normalizePhone(customer?.phone);
    const plan = subscriptionPlan(planId);

    if (Number(amount) !== Number(plan.amount)) return res.status(400).json({ message: 'Montant invalide' });
    if ((currency || CINETPAY_CURRENCY) !== 'XOF') return res.status(400).json({ message: 'Devise invalide' });
    if (!phone) return res.status(400).json({ message: 'Numéro client invalide' });

    const tx = String(transactionId || `FP-${Date.now()}`);
    const metadata = JSON.stringify({ phone, plan: plan.id, provider: provider || 'MOBILE_MONEY' });

    payments.set(tx, { tx, phone, plan:plan.id, amount: plan.amount, currency: 'XOF', status: 'INITIATED', provider: provider || 'MOBILE_MONEY', createdAt: new Date().toISOString(), raw:{ plan:plan.id, amount:plan.amount } });

    if (supabaseReady()){
      const profile = await getProfile(phone);
      await supabaseRequest('payments', {
        method:'POST',
        prefer:'return=minimal',
        body:[{ profile_id:profile?.id || null, phone, tx_ref:tx, provider:provider || 'CINETPAY', amount:plan.amount, currency:'XOF', status:'INITIATED', raw:{ plan:plan.id, amount:plan.amount } }]
      });
    }

    const payload = {
      apikey: CINETPAY_APIKEY,
      site_id: CINETPAY_SITE_ID,
      transaction_id: tx,
      amount: plan.amount,
      currency: 'XOF',
      description: paymentDescription(plan),
      return_url: returnUrl || `${APP_ORIGIN}/#subscription`,
      notify_url: `${PUBLIC_BASE_URL}/api/payments/cinetpay/webhook`,
      channels: 'MOBILE_MONEY',
      metadata,
      customer_name: 'Client',
      customer_surname: 'Réussite Concours BF',
      customer_email: customerEmailForPhone(phone),
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

    const existing = payments.get(tx);
    const meta = (() => { try { return JSON.parse(data.metadata || existing?.metadata || existing?.raw?.metadata || '{}'); } catch { return {}; } })();
    const plan = subscriptionPlan(meta.plan || existing?.plan || existing?.raw?.plan || planFromAmount(data.amount).id);
    const accepted = verified?.code === '00' && String(data.status).toUpperCase() === 'ACCEPTED' && Number(data.amount) === Number(plan.amount);
    const phone = normalizePhone(meta.phone || existing?.phone || data.customer_phone_number);

    if (accepted && phone){
      payments.set(tx, { ...(existing || {}), tx, phone, status:'ACCEPTED', verifiedAt:new Date().toISOString(), raw:data });
      if (supabaseReady()){
        await supabaseRequest(`payments?tx_ref=eq.${encodeURIComponent(tx)}`, { method:'PATCH', prefer:'return=minimal', body:{ status:'ACCEPTED', raw:data, verified_at:new Date().toISOString() } });
      }
      await activateSubscription({ phone, txRef: tx, provider: 'CINETPAY', email:data.customer_email, plan:plan.id, days:plan.days });
      return res.send('OK');
    }

    payments.set(tx, { ...(existing || {}), tx, status:data.status || 'REFUSED', verifiedAt:new Date().toISOString(), raw:data });
    res.send('IGNORED');
  }catch(err){ next(err); }
});

app.post('/api/payments/saspay/init', requireSession, async (req, res, next) => {
  try{
    requireSasPayConfig();
    const { amount, currency, transactionId, provider, customer, returnUrl, plan:planId } = req.body || {};
    const phone = normalizePhone(customer?.phone || req.phone);
    const selectedProvider = provider || 'ORANGE_MONEY';
    const network = saspayNetwork(selectedProvider);
    const plan = subscriptionPlan(planId);

    if (Number(amount) !== Number(plan.amount)) return res.status(400).json({ message:'Montant invalide' });
    if ((currency || SASPAY_CURRENCY) !== 'XOF') return res.status(400).json({ message:'Devise invalide' });
    if (!phone || phone !== req.phone) return res.status(400).json({ message:'Numéro client invalide' });

    const tx = String(transactionId || `RCBF-${Date.now()}`);
    const profile = req.profile || await getProfile(phone);
    const customerEmail = normalizeEmail(customer?.email || profile?.email) || customerEmailForPhone(phone);
    await createPaymentRecord({ tx, phone, provider:'SASPAY', status:'INITIATED', plan:plan.id, amount:plan.amount, raw:{ local_tx_ref:tx, selected_provider:selectedProvider, network, customer_email:customerEmail, plan:plan.id } });

    const firstName = profile?.first_name || profile?.display_name?.split(' ')?.[0] || 'Client';
    const lastName = profile?.last_name || 'Réussite Concours BF';
    const returnTo = returnUrl || `${APP_ORIGIN}/#subscription`;
    const payload = {
      amount: `${plan.amount}.00`,
      currency: 'XOF',
      country: SASPAY_COUNTRY,
      description: paymentDescription(plan),
      customer: {
        email: customerEmail,
        first_name: firstName,
        last_name: lastName,
        phone: publicPhone(phone)
      },
      network,
      metadata: { tx_ref: tx, phone, plan: plan.id, provider: selectedProvider }
    };

    try{
      const data = await saspayRequest('/payments/softpay/', { method:'POST', body:payload, idempotencyKey:tx });
      const payment = saspayPayload(data);
      const paymentUrl = saspayCheckoutUrl(data);
      const raw = paymentRawWithSasPay({ local_tx_ref:tx, selected_provider:selectedProvider, network, customer_email:customerEmail, plan:plan.id, amount:plan.amount }, data);
      await updatePaymentRecord(tx, { status:saspayStatus(data), raw });
      return res.json({
        ok:true,
        mode:paymentUrl ? 'checkout' : 'softpay',
        transactionId: tx,
        paymentId: saspayId(data) || null,
        status: saspayStatus(data),
        paymentUrl,
        message: paymentUrl ? 'Redirection vers la page SasPay pour finaliser le paiement.' : (payment?.message || 'Demande Mobile Money envoyée. Valide sur ton téléphone.')
      });
    }catch(err){
      // Si le push direct échoue côté opérateur ou format, on bascule sur le checkout hébergé SasPay.
      // Le client choisit alors lui-même son réseau et saisit son numéro sur une page SasPay.
      if (err.status !== 422) throw err;
      const sessionPayload = {
        amount: `${plan.amount}.00`,
        currency: 'XOF',
        description: paymentDescription(plan),
        country: SASPAY_COUNTRY,
        customer_email: customerEmail,
        customer_name: `${firstName} ${lastName}`.trim(),
        customer_phone: publicPhone(phone),
        return_url: returnTo,
        metadata: { tx_ref: tx, phone, plan: plan.id, provider: selectedProvider, softpay_error: err.message }
      };
      const sessionResponse = await saspayRequest('/checkout-sessions/', { method:'POST', body:sessionPayload });
      const session = saspayPayload(sessionResponse);
      const paymentUrl = saspayCheckoutUrl(sessionResponse);
      const raw = {
        local_tx_ref:tx,
        selected_provider:selectedProvider,
        network,
        customer_email:customerEmail,
        plan:plan.id,
        amount:plan.amount,
        saspay_session_id:saspayId(sessionResponse),
        saspay_session:session,
        saspay_session_response:sessionResponse,
        softpay_error:err.message
      };
      await updatePaymentRecord(tx, { status:saspayStatus(sessionResponse), raw });
      if (!paymentUrl){
        return res.status(502).json({ message:'SasPay a créé une session sans lien de paiement. Réessaie ou contacte le support SasPay.', mode:'checkout', transactionId:tx, sessionId:saspayId(sessionResponse) || null });
      }
      return res.json({
        ok:true,
        mode:'checkout',
        transactionId: tx,
        sessionId: saspayId(sessionResponse) || null,
        status: saspayStatus(sessionResponse),
        paymentUrl,
        message: 'Redirection vers la page SasPay pour finaliser le paiement.'
      });
    }
  }catch(err){ next(err); }
});

app.get('/api/payments/saspay/status', requireSession, async (req, res, next) => {
  try{
    requireSasPayConfig();
    const tx = String(req.query.transactionId || req.query.tx || '').trim();
    if (!tx) return res.status(400).json({ message:'Référence paiement manquante' });
    const record = await getPaymentRecord(tx);
    if (!record || normalizePhone(record.phone) !== req.phone) return res.status(404).json({ message:'Paiement introuvable' });
    const paymentId = String(req.query.paymentId || record?.raw?.saspay_id || record?.raw?.saspay?.id || record?.raw?.saspay_session?.transaction?.id || '').trim();
    const sessionId = String(req.query.sessionId || record?.raw?.saspay_session_id || record?.raw?.saspay_session?.id || '').trim();
    const plan = paymentPlanFromRecord(record);

    if (paymentId){
      const verified = await saspayRequest(`/payments/${encodeURIComponent(paymentId)}/verify/`);
      const raw = paymentRawWithSasPay(record.raw, verified);
      if (paymentIsSuccessful(verified, plan)){
        await updatePaymentRecord(tx, { status:'ACCEPTED', raw, verified_at:new Date().toISOString() });
        const sub = await activateSubscription({ phone:req.phone, txRef:tx, provider:'SASPAY', email:record?.raw?.customer_email || req.profile?.email, plan:plan.id, days:plan.days });
        return res.json({ ok:true, active:true, status:'premium', expiresAt:sub.expiresAt, txRef:tx, provider:'SASPAY', plan:plan.id });
      }
      await updatePaymentRecord(tx, { status:saspayStatus(verified), raw, verified_at:new Date().toISOString() });
      return res.json({ ok:true, active:false, paymentStatus:saspayStatus(verified), message:'Paiement non confirmé pour le moment.' });
    }

    if (sessionId){
      const sessionResponse = await saspayRequest(`/checkout-sessions/${encodeURIComponent(sessionId)}/`);
      const session = saspayPayload(sessionResponse);
      const raw = { ...(record.raw || {}), saspay_session_id:sessionId, saspay_session:session, saspay_session_response:sessionResponse };
      const transaction = session?.transaction;
      if (checkoutSessionPaid(session, plan) || paymentIsSuccessful(transaction, plan)){
        await updatePaymentRecord(tx, { status:'ACCEPTED', raw, verified_at:new Date().toISOString() });
        const sub = await activateSubscription({ phone:req.phone, txRef:tx, provider:'SASPAY', email:record?.raw?.customer_email || req.profile?.email, plan:plan.id, days:plan.days });
        return res.json({ ok:true, active:true, status:'premium', expiresAt:sub.expiresAt, txRef:tx, provider:'SASPAY', plan:plan.id });
      }
      await updatePaymentRecord(tx, { status:saspayStatus(session), raw, verified_at:new Date().toISOString() });
      return res.json({ ok:true, active:false, paymentStatus:saspayStatus(session), message:'Paiement non confirmé pour le moment.' });
    }

    return res.status(400).json({ message:'Identifiant SasPay manquant' });
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
      const plan = paymentPlanFromRecord(record);
      const verified = await saspayRequest(`/payments/${encodeURIComponent(paymentId)}/verify/`);
      const raw = paymentRawWithSasPay(record.raw, verified);
      if (paymentIsSuccessful(verified, plan)){
        await updatePaymentRecord(record.tx || record.tx_ref, { status:'ACCEPTED', raw, verified_at:new Date().toISOString() });
        await activateSubscription({ phone:record.phone, txRef:record.tx || record.tx_ref, provider:'SASPAY', email:record?.raw?.customer_email, plan:plan.id, days:plan.days });
        return res.send('OK');
      }
    }

    if (event === 'transaction.failed'){
      await updatePaymentRecord(record.tx || record.tx_ref, { status:'FAILED', raw:paymentRawWithSasPay(record.raw, data), verified_at:new Date().toISOString() });
    }
    res.send('IGNORED');
  }catch(err){ next(err); }
});


app.get('/api/admin/me', requireAdmin, async (req, res) => {
  res.json({ ok:true, user:safeProfile(req.profile) });
});

app.get('/api/admin/summary', requireAdmin, async (_req, res, next) => {
  try{
    const localBank = loadLocalQcmBank();
    const localCounts = localBank.reduce((acc, q) => { acc[q.category] = (acc[q.category] || 0) + 1; return acc; }, {});
    let customCount = 0;
    if (supabaseReady()){
      const rows = await supabaseRequest('questions?select=id&limit=10000').catch(()=>[]);
      customCount = Array.isArray(rows) ? rows.length : 0;
    }
    res.json({ ok:true, localTotal:localBank.length, localCounts, customCount });
  }catch(err){ next(err); }
});

app.get('/api/admin/ai/status', requireAdmin, async (_req, res) => {
  res.json({ ok:true, configured:Boolean(GEMINI_API_KEY), model:GEMINI_MODEL });
});

app.get('/api/admin/ai/daily', requireAdmin, async (_req, res, next) => {
  try{
    const drafts = await loadAiDailyIndex().catch(err => {
      if (err.status === 503) return [];
      throw err;
    });
    res.json({
      ok:true,
      configured:Boolean(GEMINI_API_KEY && supabaseReady()),
      settings:{
        count:AI_DAILY_QCM_COUNT,
        mode:AI_DAILY_GROUP_MODE,
        categories:AI_DAILY_CATEGORIES,
        levels:AI_DAILY_LEVELS,
        is_premium:AI_DAILY_IS_PREMIUM,
        cron:'/api/cron/ai-daily-qcm'
      },
      drafts:drafts.slice(0, 30).map(publicAiDailyDraft)
    });
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/daily/run', requireAdmin, async (req, res, next) => {
  try{
    const overrides = {
      count:req.body?.count,
      category:req.body?.category,
      level:req.body?.level,
      mode:req.body?.mode,
      theme:req.body?.theme,
      is_premium:req.body?.is_premium
    };
    const result = await generateDailyAiQcmDraft({ force:Boolean(req.body?.force), overrides });
    res.json({ ok:true, skipped:result.skipped, plan:result.plan, draft:publicAiDailyDraft(result.draft) });
  }catch(err){ next(err); }
});

app.get('/api/admin/ai/daily/:id/pdf', requireAdmin, async (req, res, next) => {
  try{
    const drafts = await loadAiDailyIndex();
    const draft = drafts.find(d => d.id === req.params.id && d.status !== 'deleted');
    if (!draft?.storage_path) return res.status(404).json({ message:'PDF IA introuvable' });
    const file = await downloadResourceObject(draft.storage_path);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(draft.file_name || 'qcm-ia-quotidien.pdf')}"`);
    res.send(file.buffer);
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/daily/:id/publish', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const drafts = await loadAiDailyIndex();
    const idx = drafts.findIndex(d => d.id === req.params.id && d.status !== 'deleted');
    if (idx < 0) return res.status(404).json({ message:'Brouillon IA introuvable' });
    const draft = drafts[idx];
    const questions = Array.isArray(draft.questions) ? draft.questions : [];
    if (!questions.length) return res.status(400).json({ message:'Aucun QCM à publier dans ce brouillon' });
    const payload = questions.map(q => adminQuestionPayload({
      ...q,
      source:safePdfTitle(draft.title || q.source || 'QCM quotidien'),
      is_premium:Boolean(draft.is_premium),
      is_active:true
    }));
    const rows = await supabaseRequest('questions?select=*', {
      method:'POST',
      prefer:'return=representation',
      body:payload
    });
    drafts[idx] = { ...draft, status:'published', published_at:new Date().toISOString(), updated_at:new Date().toISOString(), published_count:Array.isArray(rows) ? rows.length : payload.length };
    await saveAiDailyIndex(drafts);
    res.json({ ok:true, published:Array.isArray(rows) ? rows.length : payload.length, draft:publicAiDailyDraft(drafts[idx]) });
  }catch(err){ next(err); }
});

app.delete('/api/admin/ai/daily/:id', requireAdmin, async (req, res, next) => {
  try{
    const drafts = await loadAiDailyIndex();
    const idx = drafts.findIndex(d => d.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message:'Brouillon IA introuvable' });
    const draft = drafts[idx];
    if (draft.storage_path) await deleteResourceObject(draft.storage_path).catch(()=>{});
    drafts.splice(idx, 1);
    await saveAiDailyIndex(drafts);
    res.json({ ok:true });
  }catch(err){ next(err); }
});

app.get('/api/cron/ai-daily-qcm', async (req, res, next) => {
  try{
    if (!cronAuthorized(req)) return res.status(401).json({ ok:false, message:'Cron IA non autorisé' });
    const result = await generateDailyAiQcmDraft({ force:false });
    res.json({ ok:true, skipped:result.skipped, draft:publicAiDailyDraft(result.draft), plan:result.plan });
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/qcm', requireAdmin, async (req, res, next) => {
  try{
    if (!GEMINI_API_KEY) return res.status(503).json({ message:'Service IA indisponible pour le moment. Réessaie plus tard.' });
    const category = cleanText(req.body?.category || 'Culture générale', 80);
    const level = cleanText(req.body?.level || 'Concours', 40);
    const theme = cleanText(req.body?.theme || category, 200);
    const count = Math.min(10, Math.max(1, Number(req.body?.count || 5)));
    const isPremiumDraft = Boolean(req.body?.is_premium);
    const prompt = aiQcmPrompt({ count, category, level, theme });
    const ai = await callGeminiGenerate(prompt);
    const questions = normalizeAiQuestionList(ai.text, { category, level, is_premium:isPremiumDraft }, count);
    if (!questions.length) return res.status(502).json({ message:'L’IA n’a pas produit de QCM valide. Réessaie avec un thème plus précis.' });
    res.json({ ok:true, model:ai.model, questions });
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/qcm-pdf', requireAdmin, express.raw({ type:() => true, limit:'8mb' }), async (req, res, next) => {
  try{
    if (!GEMINI_API_KEY) return res.status(503).json({ message:'Service IA indisponible pour le moment. Réessaie plus tard.' });
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    const fileName = safeFileName(headerText(req, 'x-file-name', 180) || 'source.pdf');
    const mimeType = String(req.headers['content-type'] || 'application/pdf').split(';')[0].trim() || 'application/pdf';
    if (!buffer.length) return res.status(400).json({ message:'Choisis un PDF source pour générer des QCM.' });
    if (buffer.length > MAX_RESOURCE_FILE_BYTES) return res.status(413).json({ message:`PDF trop lourd. Maximum ${Math.round(MAX_RESOURCE_FILE_BYTES/1024/1024)} Mo.` });
    if (!isPdfFile(fileName, mimeType)) return res.status(400).json({ message:'Seuls les fichiers PDF sont acceptés pour cette option IA.' });

    const category = headerText(req, 'x-ai-category', 80) || 'Culture générale';
    const level = headerText(req, 'x-ai-level', 40) || 'Concours';
    const theme = headerText(req, 'x-ai-theme', 200) || `PDF ${fileName}`;
    const count = Math.min(10, Math.max(1, Number(req.headers['x-ai-count'] || 5)));
    const isPremiumDraft = String(req.headers['x-ai-is-premium'] || '').toLowerCase() === 'true';
    const prompt = aiQcmPrompt({ count, category, level, theme, fromPdf:true });
    const ai = await callGeminiGenerateParts([
      { text:prompt },
      { inline_data:{ mime_type:mimeType || 'application/pdf', data:buffer.toString('base64') } }
    ]);
    const questions = normalizeAiQuestionList(ai.text, { category, level, is_premium:isPremiumDraft }, count);
    if (!questions.length) return res.status(502).json({ message:'L’IA n’a pas pu produire de QCM valide depuis ce PDF. Vérifie que le PDF contient du texte lisible.' });
    res.json({ ok:true, model:ai.model, fileName, questions });
  }catch(err){ next(err); }
});


app.post('/api/admin/ai/news-scan', requireAdmin, async (req, res, next) => {
  try{
    const limit = Math.min(8, Math.max(1, Number(req.body?.limit || 6)));
    const result = await buildOfficialNewsDrafts(limit);
    let notificationSent = false;
    if (result.items.length && emailNotificationsConfigured() && req.profile?.email){
      const text = result.items.map((item, i) => `${i + 1}. ${item.title}\n${item.summary}\nSource: ${item.sourceUrl}`).join('\n\n');
      notificationSent = await sendEmailNotification({
        to:req.profile.email,
        subject:`${result.items.length} nouvelle(s) concours à relire`,
        text:`Réussite Concours BF a détecté des actualités officielles à relire:\n\n${text}`,
        html:`<p>Réussite Concours BF a détecté des actualités officielles à relire :</p><ol>${result.items.map(item => `<li><b>${htmlEscape(item.title)}</b><br>${htmlEscape(item.summary)}<br><a href="${htmlEscape(item.sourceUrl)}">Source officielle</a></li>`).join('')}</ol>`
      }).catch(err => { console.warn('Notification veille IA:', err.message); return false; });
    }
    res.json({ ok:true, sources:officialNewsSources(), found:result.candidates.length, items:result.items, notificationSent, today:result.today, currentYear:result.currentYear, freshness:'current_only' });
  }catch(err){ next(err); }
});

app.get('/api/admin/questions', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
    const search = cleanText(req.query.search, 120);
    const category = cleanText(req.query.category, 80);
    let query = `questions?select=id,category,level,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium,is_active,source,created_at,updated_at&order=created_at.desc&limit=${limit}`;
    if (category) query += `&category=eq.${encodeURIComponent(category)}`;
    if (search) query += `&question_text=ilike.${encodeURIComponent('*' + search + '*')}`;
    const rows = await supabaseRequest(query);
    res.json({ ok:true, questions:Array.isArray(rows) ? rows : [] });
  }catch(err){ next(err); }
});

app.post('/api/admin/questions', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const payload = adminQuestionPayload(req.body || {});
    const rows = await supabaseRequest('questions?select=*', {
      method:'POST',
      prefer:'return=representation',
      body:[payload]
    });
    res.json({ ok:true, question:Array.isArray(rows) ? rows[0] || null : null });
  }catch(err){ next(err); }
});

app.patch('/api/admin/questions/:id', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const payload = adminQuestionPayload(req.body || {});
    const rows = await supabaseRequest(`questions?id=eq.${encodeURIComponent(req.params.id)}&select=*`, {
      method:'PATCH',
      prefer:'return=representation',
      body:payload
    });
    res.json({ ok:true, question:Array.isArray(rows) ? rows[0] || null : null });
  }catch(err){ next(err); }
});

app.patch('/api/admin/questions/:id/status', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const rows = await supabaseRequest(`questions?id=eq.${encodeURIComponent(req.params.id)}&select=*`, {
      method:'PATCH',
      prefer:'return=representation',
      body:{ is_active:Boolean(req.body?.is_active) }
    });
    res.json({ ok:true, question:Array.isArray(rows) ? rows[0] || null : null });
  }catch(err){ next(err); }
});

app.delete('/api/admin/questions/:id', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    await supabaseRequest(`questions?id=eq.${encodeURIComponent(req.params.id)}`, { method:'DELETE', prefer:'return=minimal' });
    res.json({ ok:true });
  }catch(err){ next(err); }
});

app.get('/api/admin/resources', requireAdmin, async (_req, res, next) => {
  try{
    const resources = await loadResourceIndex();
    res.json({ ok:true, resources:resources.map(publicResource) });
  }catch(err){ next(err); }
});

app.post('/api/admin/resources/upload', requireAdmin, express.raw({ type:() => true, limit:'8mb' }), async (req, res, next) => {
  try{
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    const fileName = safeFileName(headerText(req, 'x-file-name', 160));
    const mimeType = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
    const title = headerText(req, 'x-title', 160) || fileName;
    const category = headerText(req, 'x-category', 80) || 'Documents';
    const description = headerText(req, 'x-description', 1000);
    const isPremiumResource = String(req.headers['x-is-premium'] || '').toLowerCase() === 'true';
    const isActiveResource = String(req.headers['x-is-active'] || 'true').toLowerCase() !== 'false';

    if (!buffer.length) return res.status(400).json({ message:'Choisis un fichier à publier' });
    if (buffer.length > MAX_RESOURCE_FILE_BYTES) return res.status(413).json({ message:`Fichier trop lourd. Maximum ${Math.round(MAX_RESOURCE_FILE_BYTES/1024/1024)} Mo.` });
    if (!isAllowedResourceFile(fileName, mimeType)) return res.status(400).json({ message:'Format accepté : image, PDF, Word ou DOCX' });
    if (title.length < 3) return res.status(400).json({ message:'Titre du document requis' });

    const id = crypto.randomUUID();
    const kind = fileKind(fileName, mimeType);
    const objectPath = `resources/files/${new Date().getFullYear()}/${id}-${fileName}`;
    await uploadResourceObject(objectPath, buffer, mimeType);

    const now = new Date().toISOString();
    const resource = {
      id,
      title,
      category,
      description,
      file_name:fileName,
      mime_type:mimeType,
      kind,
      size:buffer.length,
      storage_path:objectPath,
      is_premium:isPremiumResource,
      is_active:isActiveResource,
      author_phone:req.phone,
      created_at:now,
      updated_at:now
    };
    const resources = await loadResourceIndex();
    resources.unshift(resource);
    await saveResourceIndex(resources);
    res.json({ ok:true, resource:publicResource(resource) });
  }catch(err){ next(err); }
});

app.patch('/api/admin/resources/:id', requireAdmin, async (req, res, next) => {
  try{
    const resources = await loadResourceIndex();
    const idx = resources.findIndex(r => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message:'Document introuvable' });
    const current = resources[idx];
    const patch = req.body || {};
    resources[idx] = {
      ...current,
      title: patch.title === undefined ? current.title : cleanText(patch.title, 160),
      category: patch.category === undefined ? current.category : cleanText(patch.category, 80),
      description: patch.description === undefined ? current.description : cleanText(patch.description, 1000),
      is_premium: patch.is_premium === undefined ? Boolean(current.is_premium) : Boolean(patch.is_premium),
      is_active: patch.is_active === undefined ? current.is_active !== false : Boolean(patch.is_active),
      updated_at:new Date().toISOString()
    };
    await saveResourceIndex(resources);
    res.json({ ok:true, resource:publicResource(resources[idx]) });
  }catch(err){ next(err); }
});

app.patch('/api/admin/resources/:id/status', requireAdmin, async (req, res, next) => {
  try{
    const resources = await loadResourceIndex();
    const idx = resources.findIndex(r => r.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message:'Document introuvable' });
    resources[idx] = { ...resources[idx], is_active:Boolean(req.body?.is_active), updated_at:new Date().toISOString() };
    await saveResourceIndex(resources);
    res.json({ ok:true, resource:publicResource(resources[idx]) });
  }catch(err){ next(err); }
});

app.delete('/api/admin/resources/:id', requireAdmin, async (req, res, next) => {
  try{
    const resources = await loadResourceIndex();
    const item = resources.find(r => r.id === req.params.id);
    if (!item) return res.status(404).json({ message:'Document introuvable' });
    await saveResourceIndex(resources.filter(r => r.id !== req.params.id));
    if (item.storage_path) await deleteResourceObject(item.storage_path);
    res.json({ ok:true });
  }catch(err){ next(err); }
});

app.get('/api/news', async (_req, res, next) => {
  try{
    const news = await loadNewsIndex().catch(err => {
      if (err.status === 503 || /Stockage indisponible/i.test(err.message)) return [];
      throw err;
    });
    const visible = news
      .filter(item => item.is_active !== false)
      .map(publicNews)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    res.json({ ok:true, news:visible });
  }catch(err){ next(err); }
});

app.get('/api/admin/news', requireAdmin, async (_req, res, next) => {
  try{
    const news = await loadNewsIndex();
    res.json({ ok:true, news:news.map(publicNews) });
  }catch(err){ next(err); }
});

app.post('/api/admin/news', requireAdmin, async (req, res, next) => {
  try{
    const payload = adminNewsPayload(req.body || {});
    const now = new Date().toISOString();
    const item = { id:crypto.randomUUID(), ...payload, author_phone:req.phone, created_at:now, updated_at:now };
    const news = await loadNewsIndex();
    news.unshift(item);
    await saveNewsIndex(news);
    res.json({ ok:true, item:publicNews(item) });
  }catch(err){ next(err); }
});

app.patch('/api/admin/news/:id', requireAdmin, async (req, res, next) => {
  try{
    const news = await loadNewsIndex();
    const idx = news.findIndex(item => item.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message:'Actualité introuvable' });
    const payload = adminNewsPayload(req.body || {});
    news[idx] = { ...news[idx], ...payload, updated_at:new Date().toISOString() };
    await saveNewsIndex(news);
    res.json({ ok:true, item:publicNews(news[idx]) });
  }catch(err){ next(err); }
});

app.post('/api/admin/news/:id/pdf', requireAdmin, express.raw({ type:() => true, limit:'8mb' }), async (req, res, next) => {
  try{
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    const fileName = safeFileName(headerText(req, 'x-file-name', 180) || 'communique.pdf');
    const mimeType = String(req.headers['content-type'] || 'application/pdf').split(';')[0].trim() || 'application/pdf';
    if (!buffer.length) return res.status(400).json({ message:'Choisis un fichier PDF' });
    if (buffer.length > MAX_RESOURCE_FILE_BYTES) return res.status(413).json({ message:`Fichier trop lourd. Maximum ${Math.round(MAX_RESOURCE_FILE_BYTES/1024/1024)} Mo.` });
    if (!isPdfFile(fileName, mimeType)) return res.status(400).json({ message:'Seuls les communiqués PDF sont acceptés ici' });
    const news = await loadNewsIndex();
    const idx = news.findIndex(item => item.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message:'Actualité introuvable' });
    if (news[idx].storage_path) await deleteResourceObject(news[idx].storage_path).catch(()=>{});
    const objectPath = `news/files/${new Date().getFullYear()}/${req.params.id}-${fileName}`;
    await uploadResourceObject(objectPath, buffer, mimeType || 'application/pdf');
    news[idx] = {
      ...news[idx],
      file_name:fileName,
      mime_type:mimeType || 'application/pdf',
      size:buffer.length,
      storage_path:objectPath,
      updated_at:new Date().toISOString()
    };
    await saveNewsIndex(news);
    res.json({ ok:true, item:publicNews(news[idx]) });
  }catch(err){ next(err); }
});

app.patch('/api/admin/news/:id/status', requireAdmin, async (req, res, next) => {
  try{
    const news = await loadNewsIndex();
    const idx = news.findIndex(item => item.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message:'Actualité introuvable' });
    news[idx] = { ...news[idx], is_active:Boolean(req.body?.is_active), updated_at:new Date().toISOString() };
    await saveNewsIndex(news);
    res.json({ ok:true, item:publicNews(news[idx]) });
  }catch(err){ next(err); }
});

app.delete('/api/admin/news/:id', requireAdmin, async (req, res, next) => {
  try{
    const news = await loadNewsIndex();
    const item = news.find(item => item.id === req.params.id);
    if (!item) return res.status(404).json({ message:'Actualité introuvable' });
    await saveNewsIndex(news.filter(item => item.id !== req.params.id));
    if (item.storage_path) await deleteResourceObject(item.storage_path).catch(()=>{});
    res.json({ ok:true });
  }catch(err){ next(err); }
});

app.get('/api/news/:id/pdf', async (req, res, next) => {
  try{
    const news = await loadNewsIndex();
    const item = news.find(item => item.id === req.params.id && item.is_active !== false && item.storage_path);
    if (!item) return res.status(404).json({ message:'Communiqué PDF introuvable' });
    const file = await downloadResourceObject(item.storage_path);
    const filename = safeFileName(item.file_name || 'communique.pdf');
    res.setHeader('Content-Type', item.mime_type || file.contentType || 'application/pdf');
    res.setHeader('Content-Length', file.buffer.length);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(file.buffer);
  }catch(err){ next(err); }
});

function emailNotificationsConfigured(){
  return Boolean((RESEND_API_KEY && appEmailFrom()) || (SMTP_HOST && SMTP_USER && SMTP_PASS && appEmailFrom()));
}

function smsNotificationsConfigured(){
  return Boolean(SMS_API_URL || (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM));
}

app.get('/api/admin/notifications/status', requireAdmin, async (_req, res) => {
  res.json({
    ok:true,
    emailConfigured:emailNotificationsConfigured(),
    smsConfigured:smsNotificationsConfigured()
  });
});

app.post('/api/admin/notifications/test', requireAdmin, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const phone = normalizePhone(req.body?.phone || req.phone);
  const channel = String(req.body?.channel || 'both');
  const results = { email:{ attempted:false, sent:false, configured:emailNotificationsConfigured() }, sms:{ attempted:false, sent:false, configured:smsNotificationsConfigured() } };

  if ((channel === 'both' || channel === 'email') && email){
    results.email.attempted = true;
    try{
      results.email.sent = await sendEmailNotification({
        to:email,
        subject:'Test Réussite Concours BF',
        text:'Message de vérification : les notifications e-mail de Réussite Concours BF fonctionnent.',
        html:'<p>Message de vérification.</p><p>Les notifications e-mail de <b>Réussite Concours BF</b> fonctionnent.</p>'
      });
    }catch(err){
      results.email.error = 'Envoi e-mail impossible';
      console.warn('Test email admin:', err.message);
    }
  }

  if ((channel === 'both' || channel === 'sms') && phone){
    results.sms.attempted = true;
    try{
      results.sms.sent = await sendSmsNotification({
        to:phone,
        message:'Réussite Concours BF : les notifications SMS fonctionnent.'
      });
    }catch(err){
      results.sms.error = 'Envoi SMS impossible';
      console.warn('Vérification SMS admin:', err.message);
    }
  }

  res.json({ ok:true, results });
});

app.get('/api/resources', async (req, res, next) => {
  try{
    const premiumAllowed = await requestHasPremium(req);
    const resources = await loadResourceIndex().catch(err => {
      if (err.status === 503 || /Stockage indisponible/i.test(err.message)) return [];
      throw err;
    });
    const visible = resources
      .filter(r => r.is_active !== false)
      .filter(r => premiumAllowed || !r.is_premium)
      .map(publicResource);
    res.json({ ok:true, premiumIncluded:premiumAllowed, resources:visible });
  }catch(err){ next(err); }
});

app.get('/api/resources/:id/download', async (req, res, next) => {
  try{
    const resources = await loadResourceIndex();
    const item = resources.find(r => r.id === req.params.id && r.is_active !== false);
    if (!item) return res.status(404).json({ message:'Document introuvable' });
    if (item.is_premium){
      const premiumAllowed = await requestHasPremium(req);
      if (!premiumAllowed) return res.status(402).json({ message:'Ce document est réservé aux comptes Premium' });
    }
    const file = await downloadResourceObject(item.storage_path);
    const filename = safeFileName(item.file_name || item.title || 'document');
    const inline = ['image','pdf'].includes(item.kind || fileKind(filename, item.mime_type));
    res.setHeader('Content-Type', item.mime_type || file.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', file.buffer.length);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(file.buffer);
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
    is_premium: Boolean(row.is_premium),
    source: row.source || '',
    created_at: row.created_at || ''
  };
}

async function premiumAllowedForRequest(req){
  const sessionData = await getSessionFromRequest(req).catch(() => null);
  if (!sessionData?.profile?.phone) return false;
  if (isAdminProfile(sessionData.profile)) return true;
  const sub = await getActiveSubscription(sessionData.profile.phone);
  return Boolean(sub);
}

function publicQcmPublicationTitle(row){
  const date = String(row?.created_at || new Date().toISOString()).slice(0, 10);
  const raw = cleanText(row?.source || '', 180);
  if (!raw || /^généré par ia/i.test(raw) || /^ajout administrateur$/i.test(raw)){
    return `QCM ${row?.category || 'Concours'} — ${date}`;
  }
  return raw;
}

app.get('/api/qcm-publications', async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.json({ ok:true, publications:[], premiumIncluded:false });
    const premiumAllowed = await premiumAllowedForRequest(req);
    const rows = await supabaseRequest('questions?is_active=eq.true&select=id,category,level,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium,source,created_at&order=created_at.desc&limit=800').catch(()=>[]);
    const groups = new Map();
    for (const row of (Array.isArray(rows) ? rows : [])){
      const date = String(row.created_at || new Date().toISOString()).slice(0, 10);
      const name = publicQcmPublicationTitle(row);
      const key = `${name}|${date}|${Boolean(row.is_premium)}|${row.category || ''}|${row.level || ''}`;
      if (!groups.has(key)){
        groups.set(key, {
          id:crypto.createHash('sha1').update(key).digest('hex').slice(0, 16),
          title:name,
          date:row.created_at || date,
          category:row.category || '',
          level:row.level || '',
          is_premium:Boolean(row.is_premium),
          locked:Boolean(row.is_premium) && !premiumAllowed,
          questionCount:0,
          questions:[]
        });
      }
      const group = groups.get(key);
      group.questionCount += 1;
      if (!group.locked) group.questions.push(safeQuestion(row));
    }
    const publications = Array.from(groups.values()).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    res.json({ ok:true, premiumIncluded:premiumAllowed, publications });
  }catch(err){ next(err); }
});

app.get('/api/questions', async (req, res, next) => {
  try{
    const premiumAllowed = await premiumAllowedForRequest(req);

    const localBank = loadLocalQcmBank();
    if (localBank.length){
      const filtered = premiumAllowed ? localBank : localBank.filter(q => !q.is_premium);
      const questions = filtered.map(safeLocalQuestion);
      if (supabaseReady()){
        const premiumFilter = premiumAllowed ? '' : '&is_premium=eq.false';
        const extraRows = await supabaseRequest(`questions?is_active=eq.true${premiumFilter}&select=id,category,level,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium,source,created_at&order=created_at.desc`).catch(()=>[]);
        const seen = new Set(questions.map(q => String(q.question_text || '').toLowerCase().trim()));
        if (Array.isArray(extraRows)){
          extraRows.map(safeQuestion).forEach(q => {
            const key = String(q.question_text || '').toLowerCase().trim();
            if (key && !seen.has(key)){
              seen.add(key);
              questions.push(q);
            }
          });
        }
      }
      return res.json({
        ok:true,
        source:'local_bank_5000_v1',
        premiumIncluded:premiumAllowed,
        questions
      });
    }

    if (!supabaseReady()) return res.status(503).json({ message:'Stockage indisponible pour le moment.' });
    const premiumFilter = premiumAllowed ? '' : '&is_premium=eq.false';
    const rows = await supabaseRequest(`questions?is_active=eq.true${premiumFilter}&select=id,category,level,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium,source,created_at&order=created_at.asc`);
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
