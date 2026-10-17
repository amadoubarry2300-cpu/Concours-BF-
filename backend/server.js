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

function originWithProtocol(value){
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

const CONFIGURED_APP_ORIGIN = originWithProtocol(process.env.APP_ORIGIN);
const VERCEL_PRODUCTION_ORIGIN = originWithProtocol(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL);
const APP_ORIGIN = CONFIGURED_APP_ORIGIN && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(CONFIGURED_APP_ORIGIN)
  ? CONFIGURED_APP_ORIGIN
  : (VERCEL_PRODUCTION_ORIGIN || (process.env.VERCEL ? 'https://concoursbf-fawn.vercel.app' : CONFIGURED_APP_ORIGIN || 'http://localhost:3000'));
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
// Préfixes mobiles publiés pour le Burkina Faso. Le contrôle empêche d'envoyer
// une demande Orange Money vers un numéro Moov (ou inversement).
const BF_MOBILE_OPERATOR_PREFIXES = Object.freeze({
  ORANGE_MONEY: Object.freeze(['04','05','06','07','44','45','46','54','55','56','57','64','65','66','67','74','75','76','77']),
  MOOV_MONEY: Object.freeze(['01','02','03','50','51','52','53','60','61','62','63','70','71','72','73']),
  TELECEL: Object.freeze(['58','68','69','78','79'])
});
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
const REVISION_INDEX_PATH = 'revision-fiches/index.json';
const QCM_ADMIN_ARCHIVE_PATH = 'questions/admin-archive.json';
const MAX_RESOURCE_FILE_BYTES = Number(process.env.MAX_RESOURCE_FILE_BYTES || 4 * 1024 * 1024);
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || SMTP_FROM || '';
const EMAIL_LOGIN_ALERTS = !/^(?:false|0|no|non)$/i.test(String(process.env.EMAIL_LOGIN_ALERTS || 'true'));
const EMAIL_EXPIRY_REMINDER_DAYS = [7, 3, 1];
const EMAIL_CAMPAIGN_RECIPIENTS_PER_RUN = Math.min(100, Math.max(5, Number(process.env.EMAIL_CAMPAIGN_RECIPIENTS_PER_RUN || 10)));
const SMS_API_URL = process.env.SMS_API_URL || '';
const SMS_API_TOKEN = process.env.SMS_API_TOKEN || '';
const SMS_SENDER = process.env.SMS_SENDER || 'ConcoursBF';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
// QCM vérifiés V2 : OpenRouter/Claude en priorité, Gemini en repli automatique.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
const GEMINI_VERIFIER_MODEL = process.env.GEMINI_VERIFIER_MODEL || 'gemini-3.1-pro-preview';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_BASE_URL = String(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-5.5';
const OPENROUTER_VERIFIER_MODEL = process.env.OPENROUTER_VERIFIER_MODEL || 'anthropic/claude-sonnet-5.5';
const OPENROUTER_SEARCH_ENGINE = String(process.env.OPENROUTER_SEARCH_ENGINE || 'parallel').toLowerCase();
const OPENROUTER_SEARCH_MODE = String(process.env.OPENROUTER_SEARCH_MODE || 'basic').toLowerCase();
const OPENROUTER_SEARCH_MAX_USES = 1;
const OPENROUTER_SEARCH_MAX_RESULTS = Math.min(8, Math.max(4, Number(process.env.OPENROUTER_SEARCH_MAX_RESULTS || 6)));
const AI_QCM_PROVIDER_SETTING = String(process.env.AI_QCM_PROVIDER || 'auto').trim().toLowerCase();
const AI_QCM_FALLBACK_ENABLED = !/^(?:false|0|no|non)$/i.test(String(process.env.AI_QCM_FALLBACK_ENABLED || 'true'));
// Mode économique demandé par l'administrateur : une seule IA, Gemini.
// OpenRouter reste configuré dans Vercel mais n'est plus consommé par les QCM.
const AI_QCM_SINGLE_GEMINI_MODE = Boolean(GEMINI_API_KEY)
  && !/^(?:false|0|no|non)$/i.test(String(process.env.AI_QCM_SINGLE_GEMINI_MODE || 'true'));
const AI_QCM_TIMEOUT_MS = Math.min(35000, Math.max(15000, Number(process.env.AI_QCM_TIMEOUT_MS || 35000)));
const AI_QCM_GROUNDING_ENABLED = !/^(?:false|0|no|non)$/i.test(String(process.env.AI_QCM_GROUNDING_ENABLED || 'true'));
const AI_QCM_REQUIRE_VERIFICATION = !/^(?:false|0|no|non)$/i.test(String(process.env.AI_QCM_REQUIRE_VERIFICATION || 'true'));
// Gemini prépare cinq QCM sourcés par appel ; le contrôle déterministe local
// n'effectue aucun second appel payant.
const AI_QCM_BATCH_SIZE = Math.min(5, Math.max(1, Number(process.env.AI_QCM_BATCH_SIZE || 5)));
const AI_QCM_MIN_VERIFICATION_SCORE = Math.min(100, Math.max(70, Number(process.env.AI_QCM_MIN_VERIFICATION_SCORE || 90)));
const AI_QCM_VERIFICATION_VERSION = 'official-sources-v2';
const OFFICIAL_NEWS_SOURCES = process.env.OFFICIAL_NEWS_SOURCES || '';
const AI_DAILY_INDEX_PATH = 'ai-daily/index.json';
const AI_DAILY_DEFAULT_CATEGORIES = ['Burkina Faso','Culture générale','Histoire-Géo','Mathématiques','Physique-Chimie','Psychotechnique','Français','SVT','Greffier / Droit'];
const REVISION_LEVELS = ['Tous niveaux','CEP','BEPC','CAP / BEP','BAC','BAC+2','Licence','Master','Doctorat'];
const AI_DAILY_DEFAULT_LEVELS = ['Concours','BEPC','BAC','CEP','Licence'];
const AI_DAILY_QCM_COUNT = Math.min(50, Math.max(1, Number(process.env.AI_DAILY_QCM_COUNT || 50)));
const AI_QCM_MAX_COUNT = Math.min(50, Math.max(1, Number(process.env.AI_QCM_MAX_COUNT || 50)));
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
const QCM_CORRECTIONS_PATH = path.join(__dirname, 'data', 'qcm_corrections_v3.json');
let localQcmBankCache = null;
let qcmCorrectionsCache = null;
let smtpTransporterCache = null;

function parseEnvList(value, fallback){
  const rows = String(value || '').split(/[,;\n]+/).map(v => v.trim()).filter(Boolean);
  return rows.length ? rows : fallback;
}

const AI_LEVEL_CATEGORY_RULES = {
  CEP:['Français','Mathématiques','SVT','Histoire-Géo','Burkina Faso','Culture générale'],
  BEPC:['Français','Mathématiques','Physique-Chimie','SVT','Histoire-Géo','Burkina Faso','Culture générale'],
  BAC:['Français','Mathématiques','Physique-Chimie','SVT','Histoire-Géo','Burkina Faso','Culture générale'],
  Concours:['Burkina Faso','Culture générale','Histoire-Géo','Mathématiques','Physique-Chimie','Psychotechnique','Français','SVT','Greffier / Droit'],
  Licence:['Burkina Faso','Culture générale','Histoire-Géo','Mathématiques','Physique-Chimie','Psychotechnique','Français','SVT','Greffier / Droit']
};

function normalizedLevelName(value){
  const raw = String(value || '').trim();
  const key = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (key.includes('cep')) return 'CEP';
  if (key.includes('bepc')) return 'BEPC';
  if (key.includes('bac')) return 'BAC';
  if (key.includes('licence')) return 'Licence';
  if (key.includes('concours')) return 'Concours';
  return raw || 'Concours';
}

function levelCategoryMapForClient(){ return AI_LEVEL_CATEGORY_RULES; }

function categoriesForLevel(level, sourceCategories = AI_DAILY_DEFAULT_CATEGORIES){
  const normalized = normalizedLevelName(level);
  const allowed = AI_LEVEL_CATEGORY_RULES[normalized] || sourceCategories || AI_DAILY_DEFAULT_CATEGORIES;
  const source = (sourceCategories && sourceCategories.length ? sourceCategories : AI_DAILY_DEFAULT_CATEGORIES);
  const filtered = source.filter(cat => allowed.includes(cat));
  return filtered.length ? filtered : allowed;
}

function categoryAllowedForLevel(category, level){
  return Boolean(category && categoriesForLevel(level, AI_DAILY_DEFAULT_CATEGORIES).includes(category));
}

function defaultCategoryForLevel(level, dateId = todayId(), sourceCategories = AI_DAILY_CATEGORIES){
  const pool = categoriesForLevel(level, sourceCategories && sourceCategories.length ? sourceCategories : AI_DAILY_DEFAULT_CATEGORIES);
  const day = daysSinceEpoch(dateId);
  return pool[day % Math.max(1, pool.length)] || 'Culture générale';
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

async function uploadResourceObject(objectPath, buffer, mimeType, { cacheControl='3600' } = {}){
  await ensureResourceBucket();
  const res = await fetch(`${storageBaseUrl()}/object/${encodeURIComponent(RESOURCE_BUCKET)}/${encodeStoragePath(objectPath)}`, {
    method:'POST',
    headers:storageHeaders({
      'Content-Type': mimeType || 'application/octet-stream',
      'x-upsert':'true',
      'cache-control':String(cacheControl)
    }),
    body:buffer
  });
  if (!res.ok){
    const msg = await res.text().catch(()=>'');
    throw Object.assign(new Error('Envoi du fichier impossible'), { status:res.status, details:msg });
  }
}

async function downloadResourceObject(objectPath, { fresh=false } = {}){
  await ensureResourceBucket();
  const cacheBust = fresh ? `?t=${Date.now()}-${crypto.randomBytes(3).toString('hex')}` : '';
  const res = await fetch(`${storageBaseUrl()}/object/${encodeURIComponent(RESOURCE_BUCKET)}/${encodeStoragePath(objectPath)}${cacheBust}`, {
    headers:storageHeaders(fresh ? { 'Cache-Control':'no-cache, no-store', Pragma:'no-cache' } : {})
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
  if (!objectPath) return false;
  await ensureResourceBucket();
  const response = await fetch(`${storageBaseUrl()}/object/${encodeURIComponent(RESOURCE_BUCKET)}`, {
    method:'DELETE',
    headers:storageHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify({ prefixes:[objectPath] })
  });
  if (!response.ok && response.status !== 404){
    const data = await response.json().catch(()=>({}));
    const err = new Error(data?.message || data?.error || 'Suppression du fichier impossible');
    err.status = response.status || 502;
    throw err;
  }
  return true;
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

async function loadAdminQuestionArchive(){
  try{
    const file = await downloadResourceObject(QCM_ADMIN_ARCHIVE_PATH);
    const data = JSON.parse(file.buffer.toString('utf8') || '[]');
    const ids = Array.isArray(data) ? data : (Array.isArray(data?.ids) ? data.ids : []);
    return new Set(ids.map(id => cleanText(id, 80)).filter(id => /^[0-9a-f-]{20,80}$/i.test(id)));
  }catch(err){
    if (err.status === 404 || /Fichier introuvable|not found|does not exist|object.*not/i.test(String(err.message || err.details?.message || ''))) return new Set();
    throw err;
  }
}

async function saveAdminQuestionArchive(idSet){
  const ids = Array.from(idSet || []).map(id => cleanText(id, 80)).filter(id => /^[0-9a-f-]{20,80}$/i.test(id)).sort();
  const body = Buffer.from(JSON.stringify(ids, null, 2), 'utf8');
  await uploadResourceObject(QCM_ADMIN_ARCHIVE_PATH, body, 'application/json; charset=utf-8');
  return new Set(ids);
}

async function setAdminQuestionArchived(ids, archived){
  const cleanIds = Array.from(new Set((ids || []).map(id => cleanText(id, 80)).filter(id => /^[0-9a-f-]{20,80}$/i.test(id))));
  const set = await loadAdminQuestionArchive();
  cleanIds.forEach(id => archived ? set.add(id) : set.delete(id));
  return await saveAdminQuestionArchive(set);
}

async function annotateAdminQuestionRows(rows, { promoteInactive = false } = {}){
  const list = Array.isArray(rows) ? rows : [];
  let archived = await loadAdminQuestionArchive().catch(() => new Set());
  const inactiveIds = list.filter(row => row?.id && row.is_active === false).map(row => row.id);
  if (promoteInactive && inactiveIds.length && supabaseReady()){
    inactiveIds.forEach(id => archived.add(id));
    archived = await saveAdminQuestionArchive(archived).catch(() => archived);
    await supabaseRequest(`questions?id=in.(${supabaseInList(inactiveIds)})`, {
      method:'PATCH',
      prefer:'return=minimal',
      body:{ is_active:true }
    }).catch(err => console.warn('Promotion QCM masqués vers archive admin:', err.message));
  }
  return list.map(row => ({
    ...row,
    is_active: promoteInactive && row?.is_active === false ? true : row.is_active,
    admin_archived: archived.has(row.id) || row.admin_archived === true || row.is_active === false
  }));
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

async function loadRevisionIndex(){
  try{
    const file = await downloadResourceObject(REVISION_INDEX_PATH, { fresh:true });
    const data = JSON.parse(file.buffer.toString('utf8') || '[]');
    return Array.isArray(data) ? data : [];
  }catch(err){
    if (err.status === 404 || /Fichier introuvable|not found|does not exist|object.*not/i.test(String(err.message || err.details?.message || ''))) return [];
    throw err;
  }
}

async function saveRevisionIndex(rows){
  const body = Buffer.from(JSON.stringify(rows || [], null, 2), 'utf8');
  await uploadResourceObject(REVISION_INDEX_PATH, body, 'application/json; charset=utf-8');
}

function revisionImage(category){
  const map = {
    'Burkina Faso':'img/subject-burkina.svg',
    'Culture générale':'img/subject-culture.svg',
    'Histoire-Géo':'img/subject-history-geo.svg',
    'Mathématiques':'img/subject-math.svg',
    'Physique-Chimie':'img/subject-exam.svg',
    'Psychotechnique':'img/subject-psychotech.svg',
    'Français':'img/subject-french.svg',
    'SVT':'img/subject-svt.svg',
    'Greffier / Droit':'img/subject-law.svg'
  };
  return map[category] || 'img/study.jpg';
}

function publicRevisionFiche(row){
  return {
    id:row.id,
    cat:row.category || 'Culture générale',
    category:row.category || 'Culture générale',
    img:row.image || revisionImage(row.category),
    title:row.title || 'Fiche de révision',
    time:row.duration || '3 min',
    level:row.level || 'Tous niveaux',
    contentType:row.content_type || 'Fiche de révision',
    competitionType:row.competition_type || 'Concours directs et professionnels',
    points:Array.isArray(row.points) ? row.points.filter(Boolean).slice(0, 6) : [],
    remember:row.remember || '',
    is_premium:Boolean(row.is_premium),
    is_active:row.is_active !== false,
    created_at:row.created_at,
    updated_at:row.updated_at
  };
}

function adminRevisionPayload(body){
  const category = cleanText(body?.category, 80);
  if (!AI_DAILY_DEFAULT_CATEGORIES.includes(category)) throw Object.assign(new Error('Choisis une catégorie de publication.'), { status:400 });
  const points = (Array.isArray(body?.points) ? body.points : String(body?.points || '').split(/\n+/))
    .map(value => cleanText(value, 500)).filter(Boolean).slice(0, 6);
  const contentType = cleanText(body?.contentType || body?.content_type || 'Fiche de révision', 60);
  const competitionType = cleanText(body?.competitionType || body?.competition_type || 'Concours directs et professionnels', 80);
  const level = cleanText(body?.level || 'Tous niveaux', 60);
  if (!['Fiche de révision','Notion importante'].includes(contentType)) throw Object.assign(new Error('Choisis le type de contenu.'), { status:400 });
  if (!['Concours direct','Concours professionnel','Concours directs et professionnels'].includes(competitionType)) throw Object.assign(new Error('Choisis le type de concours.'), { status:400 });
  if (!REVISION_LEVELS.includes(level)) throw Object.assign(new Error('Choisis le niveau requis.'), { status:400 });
  const payload = {
    title:cleanText(body?.title, 180),
    category,
    level,
    duration:cleanText(body?.duration || '3 min', 30),
    content_type:contentType,
    competition_type:competitionType,
    points,
    remember:cleanText(body?.remember, 800),
    is_premium:Boolean(body?.is_premium),
    is_active:body?.is_active === undefined ? true : Boolean(body.is_active)
  };
  if (payload.title.length < 4) throw Object.assign(new Error('Ajoute un titre clair.'), { status:400 });
  if (payload.points.length < 2) throw Object.assign(new Error('Ajoute au moins deux points essentiels.'), { status:400 });
  if (payload.remember.length < 5) throw Object.assign(new Error('Ajoute le point à retenir.'), { status:400 });
  return payload;
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
    admin_archived: Boolean(row.admin_archived),
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

function absoluteAppUrl(pathname=''){
  const base = String(APP_ORIGIN || PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const path = String(pathname || '');
  return `${base}${path.startsWith('/') ? path : '/' + path}`;
}

function brandedEmailHtml({ title, greeting='', paragraphs=[], ctaLabel='', ctaUrl='', footer='' }){
  const safeParagraphs = (Array.isArray(paragraphs) ? paragraphs : [paragraphs]).filter(Boolean);
  const button = ctaLabel && ctaUrl
    ? `<p style="margin:28px 0"><a href="${htmlEscape(ctaUrl)}" style="display:inline-block;background:#07855f;color:#fff;text-decoration:none;font-weight:800;padding:13px 20px;border-radius:12px">${htmlEscape(ctaLabel)}</a></p>`
    : '';
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f3f7f5;font-family:Arial,sans-serif;color:#15231e"><div style="max-width:620px;margin:0 auto;padding:24px 14px"><div style="background:#07855f;color:#fff;padding:22px;border-radius:18px 18px 0 0"><div style="font-size:13px;font-weight:800;letter-spacing:.5px">RÉUSSITE CONCOURS BF</div><h1 style="font-size:24px;margin:8px 0 0">${htmlEscape(title)}</h1></div><div style="background:#fff;padding:24px;border-radius:0 0 18px 18px;border:1px solid #dce9e3">${greeting ? `<p style="font-size:17px"><b>${htmlEscape(greeting)}</b></p>` : ''}${safeParagraphs.map(p => `<p style="font-size:16px;line-height:1.65">${p}</p>`).join('')}${button}<p style="margin-top:30px;color:#557067;font-size:13px;line-height:1.5">${footer || 'Réussite Concours BF — Prépare tes examens et concours avec sérieux.'}</p></div></div></body></html>`;
}

function marketingUnsubscribeToken(email){
  return crypto.createHmac('sha256', SESSION_SECRET).update(`email-unsubscribe:${normalizeEmail(email)}`).digest('hex');
}

function marketingUnsubscribeUrl(email){
  const clean = normalizeEmail(email);
  if (!clean) return '';
  return absoluteAppUrl(`/api/email/unsubscribe?email=${encodeURIComponent(clean)}&token=${marketingUnsubscribeToken(clean)}`);
}

async function smtpTransporter(){
  if (smtpTransporterCache) return smtpTransporterCache;
  const nodemailer = await import('nodemailer');
  smtpTransporterCache = nodemailer.default.createTransport({
    pool:true,
    maxConnections:2,
    maxMessages:50,
    host:SMTP_HOST,
    port:SMTP_PORT,
    secure:SMTP_PORT === 465,
    connectionTimeout:10000,
    greetingTimeout:10000,
    socketTimeout:20000,
    auth:{ user:SMTP_USER, pass:SMTP_PASS }
  });
  return smtpTransporterCache;
}

async function sendEmailNotification({ to, subject, text, html, headers={}, replyTo='' }){
  const email = normalizeEmail(to);
  if (!email) return false;
  const from = appEmailFrom();
  const cleanSubject = String(subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 180);
  if (!cleanSubject) throw new Error('Objet e-mail manquant');
  if (RESEND_API_KEY && from){
    const payload = { from, to:email, subject:cleanSubject, text:String(text || ''), html:html || String(text || '') };
    if (headers && Object.keys(headers).length) payload.headers = headers;
    if (replyTo) payload.reply_to = replyTo;
    const res = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{ Authorization:`Bearer ${RESEND_API_KEY}`, 'Content-Type':'application/json' },
      body:JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`E-mail non envoyé (${res.status})`);
    return true;
  }
  if (SMTP_HOST && SMTP_USER && SMTP_PASS && from){
    const transporter = await smtpTransporter();
    await transporter.sendMail({ from, to:email, subject:cleanSubject, text:String(text || ''), html:html || String(text || ''), headers, replyTo:replyTo || undefined });
    return true;
  }
  return false;
}

async function sendEmailEventOnce({ profile, email:rawEmail, eventType, eventKey, subject, text, html, headers={} }){
  const email = normalizeEmail(rawEmail || profile?.email);
  if (!email || !eventKey || !supabaseReady() || !emailNotificationsConfigured()) return false;
  let event = null;
  try{
    const rows = await supabaseRequest('email_notification_events?on_conflict=event_key&select=*', {
      method:'POST',
      prefer:'resolution=ignore-duplicates,return=representation',
      body:[{ profile_id:profile?.id || null, email, event_type:String(eventType || 'notification').slice(0, 80), event_key:String(eventKey).slice(0, 240), status:'pending' }]
    });
    event = Array.isArray(rows) ? rows[0] || null : null;
  }catch(err){
    console.warn('Journal e-mail indisponible:', err.message);
    return false;
  }
  if (!event) return false;
  try{
    await sendEmailNotification({ to:email, subject, text, html, headers });
    await supabaseRequest(`email_notification_events?id=eq.${encodeURIComponent(event.id)}`, { method:'PATCH', prefer:'return=minimal', body:{ status:'sent', sent_at:new Date().toISOString(), error:null } }).catch(()=>{});
    return true;
  }catch(err){
    await supabaseRequest(`email_notification_events?id=eq.${encodeURIComponent(event.id)}`, { method:'PATCH', prefer:'return=minimal', body:{ status:'failed', error:String(err.message || 'Envoi impossible').slice(0, 500) } }).catch(()=>{});
    throw err;
  }
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
  const html = brandedEmailHtml({
    title:'Bienvenue !',
    greeting:`Bonjour ${name},`,
    paragraphs:['Ton compte <b>Réussite Concours BF</b> est bien créé.', 'Ta progression, tes résultats et ton abonnement seront sauvegardés dans ton espace candidat.'],
    ctaLabel:'Commencer ma préparation',
    ctaUrl:absoluteAppUrl('/')
  });
  const tasks = [sendSmsNotification({ to:phone, message:sms })];
  if (email) tasks.push(sendEmailNotification({ to:email, subject, text, html }));
  await Promise.allSettled(tasks).then(results => results.forEach(r => { if (r.status === 'rejected') console.warn('Notification inscription:', r.reason?.message || r.reason); }));
}

async function notifyPremiumActivation(profile, sub, rawEmail){
  const email = normalizeEmail(rawEmail || profile?.email);
  const phone = profile?.phone;
  const name = profileDisplayName(profile, 'candidat');
  const endDate = sub?.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' }) : '';
  const subject = sub?.renewed ? 'Ton abonnement Premium est renouvelé' : 'Ton accès Premium est activé';
  const text = `Bonjour ${name},\n\nTon accès Premium Réussite Concours BF est ${sub?.renewed ? 'renouvelé' : 'activé'}${endDate ? ` jusqu'au ${endDate}` : ''}. Référence : ${sub?.txRef || 'confirmée'}.\n\nBonne préparation !`;
  const html = brandedEmailHtml({
    title:sub?.renewed ? 'Premium renouvelé' : 'Premium activé',
    greeting:`Bonjour ${name},`,
    paragraphs:[`Ton accès <b>Premium</b> est ${sub?.renewed ? 'renouvelé' : 'activé'}${endDate ? ` jusqu’au <b>${htmlEscape(endDate)}</b>` : ''}.`, sub?.txRef ? `Référence de paiement : <b>${htmlEscape(sub.txRef)}</b>.` : '', 'Tu peux maintenant ouvrir les QCM, examens blancs, statistiques et documents Premium.'],
    ctaLabel:'Accéder à Premium',
    ctaUrl:absoluteAppUrl('/#subscription')
  });
  const sms = `Réussite Concours BF: ton Premium est activé${endDate ? ' jusqu au ' + endDate : ''}. Bonne préparation !`;
  const tasks = [];
  if (email) tasks.push(sendEmailNotification({ to:email, subject, text, html }));
  if (phone) tasks.push(sendSmsNotification({ to:phone, message:sms }));
  await Promise.allSettled(tasks).then(results => results.forEach(r => { if (r.status === 'rejected') console.warn('Notification Premium:', r.reason?.message || r.reason); }));
}

async function notifyLoginSuccess(profile, req){
  if (!EMAIL_LOGIN_ALERTS || !profile?.id || !profile?.email) return false;
  const day = new Date().toISOString().slice(0, 10);
  const name = profileDisplayName(profile, 'candidat');
  const when = new Date().toLocaleString('fr-FR', { dateStyle:'long', timeStyle:'short', timeZone:'Africa/Ouagadougou' });
  const ip = clientIp(req);
  const subject = 'Connexion réussie à ton compte';
  const text = `Bonjour ${name},\n\nUne connexion réussie à ton compte Réussite Concours BF a eu lieu le ${when}${ip ? ` depuis ${ip}` : ''}. Si ce n’était pas toi, réinitialise immédiatement ton PIN.\n`;
  const html = brandedEmailHtml({
    title:'Connexion réussie',
    greeting:`Bonjour ${name},`,
    paragraphs:[`Une connexion à ton compte a réussi le <b>${htmlEscape(when)}</b>.`, ip ? `Adresse réseau : <b>${htmlEscape(ip)}</b>.` : '', 'Si ce n’était pas toi, utilise immédiatement « PIN oublié » pour sécuriser ton compte.'],
    ctaLabel:'Ouvrir mon compte',
    ctaUrl:absoluteAppUrl('/#account')
  });
  return sendEmailEventOnce({ profile, eventType:'login_success', eventKey:`login:${profile.id}:${day}`, subject, text, html }).catch(err => { console.warn('Alerte connexion:', err.message); return false; });
}

async function notifyPinChanged(profile){
  const email = normalizeEmail(profile?.email);
  if (!email) return false;
  const name = profileDisplayName(profile, 'candidat');
  return sendEmailNotification({
    to:email,
    subject:'Ton code PIN a été modifié',
    text:`Bonjour ${name},\n\nLe code PIN de ton compte Réussite Concours BF vient d’être modifié. Si ce n’était pas toi, contacte immédiatement le support.`,
    html:brandedEmailHtml({ title:'PIN modifié', greeting:`Bonjour ${name},`, paragraphs:['Le code PIN de ton compte vient d’être modifié.', 'Si ce n’était pas toi, contacte immédiatement le support Réussite Concours BF.'] })
  });
}

async function queueMarketingCampaign({ kind='promotion', subject, text, html='', ctaLabel='', ctaUrl='', createdBy='' }){
  if (!supabaseReady() || !emailNotificationsConfigured()) return null;
  const cleanSubject = cleanText(subject, 160).replace(/[\r\n]+/g, ' ');
  const cleanBody = cleanText(text, 5000);
  if (!cleanSubject || !cleanBody) return null;
  try{
    const rows = await supabaseRequest('email_campaigns?select=*', {
      method:'POST',
      prefer:'return=representation',
      body:[{
        kind:cleanText(kind, 60) || 'promotion',
        subject:cleanSubject,
        text_body:cleanBody,
        html_body:String(html || '').slice(0, 15000),
        cta_label:cleanText(ctaLabel, 80),
        cta_url:/^https:\/\//i.test(String(ctaUrl || '')) ? String(ctaUrl).slice(0, 1000) : '',
        status:'pending',
        created_by:cleanText(createdBy, 120)
      }]
    });
    return Array.isArray(rows) ? rows[0] || null : null;
  }catch(err){
    console.warn('Campagne e-mail non créée:', err.message);
    return null;
  }
}

function marketingCampaignContent(campaign, profile){
  const email = normalizeEmail(profile?.email);
  const name = profileDisplayName(profile, 'candidat');
  const unsubscribe = marketingUnsubscribeUrl(email);
  const ctaUrl = /^https:\/\//i.test(String(campaign?.cta_url || '')) ? campaign.cta_url : absoluteAppUrl('/');
  const bodyHtml = campaign?.html_body
    ? String(campaign.html_body)
    : String(campaign?.text_body || '').split(/\n{2,}/).map(p => htmlEscape(p).replace(/\n/g, '<br>')).filter(Boolean).join('<br><br>');
  const html = brandedEmailHtml({
    title:campaign?.subject || 'Nouveauté',
    greeting:`Bonjour ${name},`,
    paragraphs:[bodyHtml],
    ctaLabel:campaign?.cta_label || 'Ouvrir Réussite Concours BF',
    ctaUrl,
    footer:`Tu reçois ce message parce que tu as accepté les nouvelles et offres de Réussite Concours BF. <a href="${htmlEscape(unsubscribe)}">Se désabonner</a>.`
  });
  const text = `Bonjour ${name},\n\n${campaign?.text_body || ''}\n\n${campaign?.cta_label || 'Ouvrir'} : ${ctaUrl}\n\nSe désabonner : ${unsubscribe}`;
  return { email, text, html, unsubscribe };
}

async function processNextEmailCampaign(){
  if (!supabaseReady() || !emailNotificationsConfigured()) return { processed:false };
  const campaigns = await supabaseRequest('email_campaigns?status=in.(pending,processing)&select=*&order=created_at.asc&limit=1').catch(()=>[]);
  const campaign = Array.isArray(campaigns) ? campaigns[0] || null : null;
  if (!campaign) return { processed:false };
  await supabaseRequest(`email_campaigns?id=eq.${encodeURIComponent(campaign.id)}`, { method:'PATCH', prefer:'return=minimal', body:{ status:'processing', updated_at:new Date().toISOString() } }).catch(()=>{});
  const cursorFilter = campaign.cursor_profile_id ? `&id=gt.${encodeURIComponent(campaign.cursor_profile_id)}` : '';
  const profiles = await supabaseRequest(`profiles?marketing_email_opt_in=eq.true&marketing_email_unsubscribed_at=is.null&email=not.is.null${cursorFilter}&select=id,email,first_name,last_name,display_name&order=id.asc&limit=${EMAIL_CAMPAIGN_RECIPIENTS_PER_RUN}`).catch(()=>[]);
  const recipients = Array.isArray(profiles) ? profiles : [];
  if (!recipients.length){
    await supabaseRequest(`email_campaigns?id=eq.${encodeURIComponent(campaign.id)}`, { method:'PATCH', prefer:'return=minimal', body:{ status:'completed', completed_at:new Date().toISOString(), updated_at:new Date().toISOString() } }).catch(()=>{});
    return { processed:true, completed:true, sent:0, failed:0 };
  }
  let sent = 0;
  let failed = 0;
  for (let offset=0; offset<recipients.length; offset+=4){
    const group = recipients.slice(offset, offset + 4);
    await Promise.all(group.map(async profile => {
      const email = normalizeEmail(profile.email);
      if (!email) return;
      let delivery = null;
      try{
        const inserted = await supabaseRequest('email_campaign_deliveries?on_conflict=campaign_id,profile_id&select=*', {
          method:'POST',
          prefer:'resolution=ignore-duplicates,return=representation',
          body:[{ campaign_id:campaign.id, profile_id:profile.id, email, status:'pending' }]
        });
        delivery = Array.isArray(inserted) ? inserted[0] || null : null;
        if (!delivery) return;
        const content = marketingCampaignContent(campaign, profile);
        await sendEmailNotification({
          to:email,
          subject:campaign.subject,
          text:content.text,
          html:content.html,
          headers:{ 'List-Unsubscribe':`<${content.unsubscribe}>`, 'List-Unsubscribe-Post':'List-Unsubscribe=One-Click' }
        });
        sent++;
        await supabaseRequest(`email_campaign_deliveries?id=eq.${encodeURIComponent(delivery.id)}`, { method:'PATCH', prefer:'return=minimal', body:{ status:'sent', sent_at:new Date().toISOString(), error:null } }).catch(()=>{});
      }catch(err){
        failed++;
        if (delivery?.id) await supabaseRequest(`email_campaign_deliveries?id=eq.${encodeURIComponent(delivery.id)}`, { method:'PATCH', prefer:'return=minimal', body:{ status:'failed', error:String(err.message || 'Envoi impossible').slice(0, 500) } }).catch(()=>{});
      }
    }));
  }
  const lastProfileId = recipients[recipients.length - 1]?.id || campaign.cursor_profile_id || null;
  const completed = recipients.length < EMAIL_CAMPAIGN_RECIPIENTS_PER_RUN;
  await supabaseRequest(`email_campaigns?id=eq.${encodeURIComponent(campaign.id)}`, {
    method:'PATCH',
    prefer:'return=minimal',
    body:{
      status:completed ? 'completed' : 'pending',
      cursor_profile_id:lastProfileId,
      sent_count:Number(campaign.sent_count || 0) + sent,
      failed_count:Number(campaign.failed_count || 0) + failed,
      updated_at:new Date().toISOString(),
      completed_at:completed ? new Date().toISOString() : null
    }
  }).catch(()=>{});
  return { processed:true, campaignId:campaign.id, completed, sent, failed };
}

async function processExpiryReminderEmails(){
  if (!supabaseReady() || !emailNotificationsConfigured()) return { checked:0, sent:0 };
  const nowMs = Date.now();
  const until = new Date(nowMs + 8 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await supabaseRequest(`subscriptions?status=eq.premium&expires_at=gt.${encodeURIComponent(new Date(nowMs).toISOString())}&expires_at=lte.${encodeURIComponent(until)}&select=id,profile_id,phone,expires_at,tx_ref&order=expires_at.asc&limit=500`).catch(()=>[]);
  const subscriptionsToCheck = Array.isArray(rows) ? rows : [];
  const latestByPhone = new Map();
  let sent = 0;
  for (const sub of subscriptionsToCheck){
    if (sub.phone){
      let latest = latestByPhone.get(sub.phone);
      if (latest === undefined){
        const latestRows = await supabaseRequest(`subscriptions?phone=eq.${encodeURIComponent(sub.phone)}&status=eq.premium&expires_at=gt.${encodeURIComponent(new Date(nowMs).toISOString())}&select=id,expires_at&order=expires_at.desc&limit=1`).catch(()=>[]);
        latest = Array.isArray(latestRows) ? latestRows[0] || null : null;
        latestByPhone.set(sub.phone, latest);
      }
      if (latest?.id && latest.id !== sub.id) continue;
    }
    const remainingDays = Math.ceil((new Date(sub.expires_at).getTime() - nowMs) / 86400000);
    if (!EMAIL_EXPIRY_REMINDER_DAYS.includes(remainingDays)) continue;
    const profiles = sub.profile_id
      ? await supabaseRequest(`profiles?id=eq.${encodeURIComponent(sub.profile_id)}&select=*&limit=1`).catch(()=>[])
      : await supabaseRequest(`profiles?phone=eq.${encodeURIComponent(sub.phone)}&select=*&limit=1`).catch(()=>[]);
    const profile = Array.isArray(profiles) ? profiles[0] || null : null;
    if (!profile?.email) continue;
    const name = profileDisplayName(profile, 'candidat');
    const endDate = new Date(sub.expires_at).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
    const ok = await sendEmailEventOnce({
      profile,
      eventType:'premium_expiry',
      eventKey:`expiry:${sub.id || sub.tx_ref}:${remainingDays}`,
      subject:`Ton Premium expire dans ${remainingDays} jour${remainingDays > 1 ? 's' : ''}`,
      text:`Bonjour ${name},\n\nTon abonnement Premium expire le ${endDate}. Renouvelle-le pour conserver l’accès à tous les QCM et documents.`,
      html:brandedEmailHtml({ title:'Ton Premium arrive à échéance', greeting:`Bonjour ${name},`, paragraphs:[`Ton abonnement Premium expire le <b>${htmlEscape(endDate)}</b>.`, 'Renouvelle-le pour conserver l’accès aux QCM, examens blancs, statistiques et documents Premium.'], ctaLabel:'Renouveler Premium', ctaUrl:absoluteAppUrl('/#subscription') })
    }).catch(()=>false);
    if (ok) sent++;
  }
  return { checked:subscriptionsToCheck.length, sent };
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

function burkinaMobileOperator(phone){
  const local = publicPhone(normalizePhone(phone));
  if (!/^\d{8}$/.test(local)) return 'INVALID';
  const prefix = local.slice(0, 2);
  if (BF_MOBILE_OPERATOR_PREFIXES.ORANGE_MONEY.includes(prefix)) return 'ORANGE_MONEY';
  if (BF_MOBILE_OPERATOR_PREFIXES.MOOV_MONEY.includes(prefix)) return 'MOOV_MONEY';
  if (BF_MOBILE_OPERATOR_PREFIXES.TELECEL.includes(prefix)) return 'TELECEL';
  return 'UNKNOWN';
}

function paymentProviderLabel(provider){
  if (provider === 'ORANGE_MONEY') return 'Orange Money';
  if (provider === 'MOOV_MONEY') return 'Moov Money (Telmob)';
  return 'Mobile Money';
}

function validatePaymentPhoneForProvider(phone, provider){
  const selectedProvider = String(provider || '').toUpperCase();
  if (!['ORANGE_MONEY','MOOV_MONEY'].includes(selectedProvider)){
    throw Object.assign(new Error('Choisis Orange Money ou Moov Money.'), { status:400 });
  }
  const normalized = normalizePhone(phone);
  const local = publicPhone(normalized);
  if (!/^\d{8}$/.test(local)){
    throw Object.assign(new Error('Entre un numéro burkinabè valide de 8 chiffres.'), { status:400 });
  }
  const operator = burkinaMobileOperator(normalized);
  if (operator === 'TELECEL'){
    throw Object.assign(new Error('Ce numéro appartient à Telecel. Seuls Orange Money et Moov Money sont disponibles pour le moment.'), { status:400 });
  }
  if (operator === 'UNKNOWN' || operator === 'INVALID'){
    throw Object.assign(new Error('Ce préfixe mobile n’est pas reconnu pour Orange ou Moov au Burkina Faso.'), { status:400 });
  }
  if (operator !== selectedProvider){
    const detected = paymentProviderLabel(operator);
    throw Object.assign(new Error(`Ce numéro est un numéro ${detected}. Sélectionne ${detected} pour continuer.`), { status:400 });
  }
  return { phone:normalized, local, provider:selectedProvider, operator };
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
  let base = current && new Date(current.expiresAt).getTime() > Date.now()
    ? new Date(current.expiresAt)
    : new Date();
  let expiresAt = addDays(base, durationDays).toISOString();
  const sub = {
    phone: normalized,
    status: 'premium',
    expiresAt,
    txRef,
    provider: provider || 'CINETPAY',
    plan: plan.id,
    days: durationDays,
    renewed:Boolean(current && new Date(current.expiresAt).getTime() > Date.now()),
    updatedAt: new Date().toISOString()
  };

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
    if (!alreadyRecorded){
      const activeRows = await supabaseRequest(`subscriptions?phone=eq.${encodeURIComponent(normalized)}&status=eq.premium&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,expires_at&order=expires_at.desc&limit=1`).catch(()=>[]);
      const active = Array.isArray(activeRows) ? activeRows[0] || null : null;
      if (active?.expires_at){
        base = new Date(active.expires_at);
        expiresAt = addDays(base, durationDays).toISOString();
        sub.expiresAt = expiresAt;
        sub.renewed = true;
      }
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
  subscriptions.set(normalized, sub);

  const notifyKey = txRef || `${normalized}:${sub.expiresAt}`;
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

function toSuperscriptText(value){
  const map = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','−':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ','x':'ˣ' };
  const raw = String(value || '');
  let out = '';
  for (const ch of raw) out += map[ch] || ch;
  return out;
}

function normalizeMathNotationText(value){
  return String(value || '')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/([0-9A-Za-z)\]])\s*\*\s*([0-9A-Za-z(])/g, '$1 × $2')
    .replace(/([0-9A-Za-z)\]])\s*\*\s*([0-9A-Za-z(])/g, '$1 × $2')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
    .replace(/\bplus ou moins\b/gi, '±')
    .replace(/\bsigma\b/gi, 'σ')
    .replace(/\bDelta\b/g, 'Δ')
    .replace(/\bpi\b/g, 'π')
    .replace(/\b([A-Za-z])''(?=[\s)=,+\-−]|$)/g, '$1″')
    .replace(/\b([A-Za-z])'(?=[\s()=,+\-−]|$)/g, '$1′')
    .replace(/(?:\\sqrt|sqrt)\s*\(([^\n]{1,160}?)\)(?=[\s.,;:!?]|$)/gi, '√($1)')
    .replace(/\^\{([^{}]{1,24})\}/g, (_, exp) => toSuperscriptText(exp))
    .replace(/\^\(([^()]{1,24})\)/g, (_, exp) => toSuperscriptText(exp))
    .replace(/\^([+\-−]?\d+(?:[a-zA-Z])?|[a-zA-Z])/g, (_, exp) => toSuperscriptText(exp))
    .replace(/\s+-\s+/g, ' − ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanEducationalText(value, max=4000){
  return normalizeMathNotationText(cleanText(value, max));
}

function adminQuestionPayload(body){
  const options = Array.isArray(body?.options) ? body.options : [body?.option_a, body?.option_b, body?.option_c, body?.option_d];
  const payload = {
    category: cleanText(body?.category, 80),
    level: cleanText(body?.level || 'BEPC', 40),
    question_text: cleanEducationalText(body?.question_text || body?.question, 1200),
    option_a: cleanEducationalText(options[0], 500),
    option_b: cleanEducationalText(options[1], 500),
    option_c: cleanEducationalText(options[2], 500),
    option_d: cleanEducationalText(options[3], 500),
    correct_answer: Number(body?.correct_answer),
    explanation: cleanEducationalText(body?.explanation, 3000),
    is_premium: Boolean(body?.is_premium),
    is_active: true,
    source: cleanText(body?.source || 'Ajout administrateur', 500)
  };
  if (!payload.category) throw Object.assign(new Error('Catégorie requise'), { status:400 });
  if (payload.question_text.length < 8) throw Object.assign(new Error('Question trop courte'), { status:400 });
  const opts = [payload.option_a, payload.option_b, payload.option_c, payload.option_d];
  if (!opts[0] || !opts[1]) throw Object.assign(new Error('Au moins deux options A et B sont obligatoires'), { status:400 });
  if (opts[3] && !opts[2]) throw Object.assign(new Error('Ajoute l’option C avant l’option D'), { status:400 });
  const providedOptions = opts.filter(Boolean);
  if (new Set(providedOptions.map(o => o.toLowerCase())).size !== providedOptions.length) throw Object.assign(new Error('Les options doivent être différentes'), { status:400 });
  if (!Number.isInteger(payload.correct_answer) || payload.correct_answer < 0 || payload.correct_answer > 3 || !opts[payload.correct_answer]) throw Object.assign(new Error('Bonne réponse invalide'), { status:400 });
  if (payload.explanation.length < 15) throw Object.assign(new Error('Explication trop courte'), { status:400 });
  return payload;
}

function aiProviderOrder(preferredProvider = ''){
  const available = [];
  if (OPENROUTER_API_KEY) available.push('openrouter');
  if (GEMINI_API_KEY) available.push('gemini');
  if (!available.length) return [];
  const preferred = ['openrouter','gemini'].includes(String(preferredProvider || '').toLowerCase())
    ? String(preferredProvider).toLowerCase()
    : '';
  const requested = preferred || (['openrouter','gemini'].includes(AI_QCM_PROVIDER_SETTING)
    ? AI_QCM_PROVIDER_SETTING
    : (OPENROUTER_API_KEY ? 'openrouter' : 'gemini'));
  const ordered = [requested, ...available].filter((provider, index, rows) => available.includes(provider) && rows.indexOf(provider) === index);
  return AI_QCM_FALLBACK_ENABLED ? ordered : ordered.slice(0, 1);
}

function aiProviderConfigured(){
  return aiProviderOrder().length > 0;
}

function aiPrimaryProvider(){
  if (AI_QCM_SINGLE_GEMINI_MODE) return 'gemini';
  return aiProviderOrder()[0] || '';
}

function aiGenerationModel(){
  return GEMINI_API_KEY ? GEMINI_MODEL : OPENROUTER_MODEL;
}

function aiVerifierModel(){
  return AI_QCM_SINGLE_GEMINI_MODE ? 'contrôles-déterministes-v2' : (OPENROUTER_API_KEY ? OPENROUTER_VERIFIER_MODEL : GEMINI_VERIFIER_MODEL);
}

function aiProviderStatus(){
  const singleGemini = AI_QCM_SINGLE_GEMINI_MODE;
  const hybrid = !singleGemini && Boolean(OPENROUTER_API_KEY && GEMINI_API_KEY);
  return {
    configured:aiProviderConfigured(),
    provider:aiPrimaryProvider(),
    providers:{ openrouter:Boolean(OPENROUTER_API_KEY), gemini:Boolean(GEMINI_API_KEY) },
    generationProvider:GEMINI_API_KEY ? 'gemini' : 'openrouter',
    verificationProvider:singleGemini ? 'server' : (OPENROUTER_API_KEY ? 'openrouter' : 'gemini'),
    singleProvider:singleGemini,
    hybrid,
    model:aiGenerationModel(),
    verifierModel:aiVerifierModel(),
    fallback:!singleGemini && AI_QCM_FALLBACK_ENABLED && aiProviderOrder().length > 1
  };
}

let aiConnectionCheckCache = { value:null, expiresAt:0 };

async function checkAiProviderConnection(){
  if (aiConnectionCheckCache.value && aiConnectionCheckCache.expiresAt > Date.now()) return aiConnectionCheckCache.value;
  const provider = aiPrimaryProvider();
  if (!provider) return { provider:'', valid:false, checkedAt:new Date().toISOString() };
  let valid = false;
  let status = 0;
  try{
    const url = provider === 'openrouter'
      ? `${OPENROUTER_BASE_URL}/key`
      : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    const headers = provider === 'openrouter' ? { Authorization:`Bearer ${OPENROUTER_API_KEY}` } : {};
    const response = await fetch(url, { headers, signal:AbortSignal.timeout(8000) });
    status = response.status;
    valid = response.ok;
  }catch{
    valid = false;
  }
  const value = { provider, valid, status, checkedAt:new Date().toISOString() };
  aiConnectionCheckCache = { value, expiresAt:Date.now() + 10 * 60 * 1000 };
  return value;
}

function normalizeGeminiModelName(name){
  return String(name || '').replace(/^models\//, '').trim();
}

let geminiModelListCache = { rows:[], expiresAt:0 };

async function listGeminiModels(){
  if (!GEMINI_API_KEY) return [];
  if (geminiModelListCache.expiresAt > Date.now() && geminiModelListCache.rows.length){
    return geminiModelListCache.rows;
  }
  try{
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`, { signal:AbortSignal.timeout(20000) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok || !Array.isArray(data.models)) return [];
    const rows = data.models
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => normalizeGeminiModelName(m.name))
      .filter(Boolean);
    geminiModelListCache = { rows, expiresAt:Date.now() + 10 * 60 * 1000 };
    return rows;
  }catch{
    return [];
  }
}

async function geminiModelsToTry({ verifier=false } = {}){
  const configured = normalizeGeminiModelName(verifier ? GEMINI_VERIFIER_MODEL : GEMINI_MODEL);
  const preferred = [
    configured,
    'gemini-3.7-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-3.6-flash'
  ].map(normalizeGeminiModelName).filter(Boolean);
  // Le nom configuré peut ne plus exister. Le catalogue réel de la clé évite
  // alors d'enchaîner uniquement des 404 et choisit un modèle Flash texte.
  const available = await listGeminiModels();
  const compatible = available
    .filter(name => /^gemini-/i.test(name))
    .filter(name => /flash/i.test(name))
    .filter(name => !/image|tts|audio|live|embedding/i.test(name));
  const availableSet = new Set(available);
  const exactPreferred = preferred.filter(name => availableSet.has(name));
  const discovered = [...exactPreferred, ...compatible];
  const ordered = discovered.length ? discovered : preferred;
  return Array.from(new Set(ordered.map(normalizeGeminiModelName).filter(Boolean)));
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

const AI_QCM_FORBIDDEN_PATTERNS = [
  /\battention\s*(?:[,!:;.-]|c[’']est|ceci|cela)/i,
  /\bI\.?A\.?\b|\bintelligence artificielle\b|\bartificial intelligence\b/i,
  /\bbrouillon\b|avant\s+publication|par\s+l[’\']?administrateur/i,
  /\b(?:à|a)\s+v[ée]rifier\b|\bv[ée]rifiez\b|doit\s+être\s+v[ée]rifi[ée]/i,
  /\bincertain\b|\bje\s+(?:ne\s+)?(?:peux|vais|dois)\b|\ben tant qu\b/i,
  /source officielle\s+(?:à|a)\s+relire/i,
  /pour\s+ce\s+dernier/i,
  /\(\s*(?:attention|note|remarque|v[ée]rifier|source|incertain)[^)]+\)/i
];

const QCM_STOPWORDS = new Set('le la les un une des de du d au aux a à en et ou pour par sur dans avec sans ce ces cet cette qui que quoi dont est sont être etre fait font plus moins comme entre afin alors ainsi donc car ne pas se sa son ses leur leurs niveau module concours question reponse réponse bonne vrai faux'.split(/\s+/));

function normalizeQuestionKey(value){
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    // Les lettres et chiffres isolés sont essentiels dans les suites
    // psychotechniques (A-C-F-J-O, B-D-G-K, 1-4-9...). Les supprimer
    // transformait à tort toutes ces questions en « complète suite ».
    .filter(w => w && !QCM_STOPWORDS.has(w))
    .join(' ')
    .trim();
}

function normalizeQcmOptionKey(value){
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    // Les opérateurs font partie de la réponse : « a × b », « a ÷ b » et
    // « a + b » ne doivent jamais être confondus comme options répétées.
    .replace(/(\d)[,.](\d)/g, '$1 decimal $2')
    .replace(/[×*]/g, ' fois ')
    .replace(/[÷/]/g, ' divisepar ')
    .replace(/\+/g, ' plus ')
    .replace(/[−-]/g, ' moins ')
    .replace(/=/g, ' egal ')
    .replace(/≤/g, ' inferieuregal ')
    .replace(/≥/g, ' superieuregal ')
    .replace(/≠/g, ' different ')
    .replace(/[^\p{L}\p{N}'’]+/gu, '')
    .trim();
}

function questionTokenSet(value){
  return new Set(normalizeQuestionKey(value).split(/\s+/).filter(Boolean));
}

function tokenSimilarity(a, b){
  if (!a?.size || !b?.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  const union = a.size + b.size - common;
  return union ? common / union : 0;
}

function createQuestionDedupeIndex(texts = []){
  const index = { keys:new Set(), samples:[] };
  for (const text of texts) addQuestionToDedupeIndex(text, index);
  return index;
}

function addQuestionToDedupeIndex(text, index){
  if (!index) return;
  const key = normalizeQuestionKey(text);
  if (!key || index.keys.has(key)) return;
  const tokens = questionTokenSet(text);
  index.keys.add(key);
  if (tokens.size) index.samples.push({ key, tokens, size:tokens.size });
}

function isDuplicateQuestionText(text, index){
  if (!index) return false;
  const key = normalizeQuestionKey(text);
  if (!key) return true;
  if (index.keys.has(key)) return true;
  const tokens = questionTokenSet(text);
  if (tokens.size < 4) return false;
  for (const sample of index.samples){
    if (!sample?.tokens?.size) continue;
    if (Math.abs(sample.size - tokens.size) > Math.max(7, Math.ceil(Math.max(sample.size, tokens.size) * 0.45))) continue;
    if (tokenSimilarity(tokens, sample.tokens) >= 0.9) return true;
  }
  return false;
}

function hasForbiddenAiQcmText(value){
  const text = String(value || '');
  return AI_QCM_FORBIDDEN_PATTERNS.some(re => re.test(text));
}

function strictCleanAiQcmText(value, max = 1200){
  return cleanText(value, max)
    .replace(/\s+/g, ' ')
    .replace(/\s+([?.!,;:])/g, '$1')
    .trim();
}

const QCM_OFFICIAL_BF_HOSTS = [
  'presidencedufaso.bf',
  'assembleenationale.bf',
  'legiburkina.bf',
  'insd.bf',
  'cenatrin.bf',
  'aib.media'
];
const QCM_TRUSTED_EDUCATION_HOSTS = [
  'unesco.org', 'un.org', 'who.int', 'worldbank.org', 'afdb.org', 'ecowas.int', 'uemoa.int',
  'au.int', 'oecd.org', 'education.gouv.fr', 'eduscol.education.fr', 'openstax.org', 'khanacademy.org'
];
const QCM_REASONING_CATEGORIES = /math|psychotech|physique|chimie|fran[cç]ais/i;

function qcmContentFingerprint(q){
  const body = [
    q?.question_text, q?.option_a, q?.option_b, q?.option_c, q?.option_d,
    Number(q?.correct_answer), q?.explanation,
    q?.evidence_type, q?.source_title, q?.source_url, q?.source_quote, q?.source_date
  ].map(value => String(value ?? '').trim())
    .join('\n');
  return crypto.createHash('sha256').update(body).digest('hex').slice(0, 24);
}

function cleanQcmSourceUrl(value){
  const raw = cleanText(value, 1200);
  if (/^(?:source-pdf|calculation|language-rule):\/\//i.test(raw)) return raw;
  try{
    const url = new URL(raw);
    return /^https?:$/.test(url.protocol) ? url.toString() : '';
  }catch{
    return '';
  }
}

function qcmSourceHostname(value){
  try{ return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); }catch{ return ''; }
}

function isOfficialBurkinaQcmSource(value){
  const host = qcmSourceHostname(value);
  if (!host) return false;
  return host.endsWith('.gov.bf') || QCM_OFFICIAL_BF_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

function isTrustedEducationalQcmSource(value){
  if (isOfficialBurkinaQcmSource(value)) return true;
  const host = qcmSourceHostname(value);
  if (!host) return false;
  if (/\.(?:gov|gouv\.fr|gov\.uk|gc\.ca|europa\.eu)$/.test(host)) return true;
  return QCM_TRUSTED_EDUCATION_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
}

function qcmRequiresOfficialBurkinaSource(category='', theme='', question=''){
  const categoryKey = normalizeQuestionKey(category);
  if (/burkina|greffier|droit/.test(categoryKey)) return true;
  const text = normalizeQuestionKey(`${theme} ${question}`);
  return /burkina|faso|haute volta|ouagadougou|bobo dioulasso|yaadga|goulmou|guiriko|tannounyan|nakambe|nazinon|kuilse|bankui|djoro/.test(text);
}

function qcmSearchAllowedDomains(category='', theme=''){
  const official = ['gov.bf', ...QCM_OFFICIAL_BF_HOSTS];
  if (qcmRequiresOfficialBurkinaSource(category, theme)) return Array.from(new Set(official));
  return Array.from(new Set([...official, ...QCM_TRUSTED_EDUCATION_HOSTS]));
}

function qcmHistoricalContext(value){
  return /\b(?:ancien(?:ne)?|avant|autrefois|jusqu['’]?en|à\s+l['’]époque|appel[ée]e?\s+alors|ex-r[ée]gion|histoire|historique|19\d{2}|20(?:0\d|1\d|2[0-4]))\b/i.test(String(value || ''));
}

const QCM_OBSOLETE_BF_REGION_PATTERNS = [
  /r[ée]gion\s+(?:des\s+)?Cascades/i,
  /r[ée]gion\s+(?:des\s+)?Hauts[- ]Bassins/i,
  /r[ée]gion\s+du\s+Nord\b/i,
  /r[ée]gion\s+de\s+l['’]Est\b/i,
  /r[ée]gion\s+du\s+Centre[- ]Est\b/i,
  /r[ée]gion\s+du\s+Centre[- ]Nord\b/i,
  /r[ée]gion\s+du\s+Centre[- ]Ouest\b/i,
  /r[ée]gion\s+du\s+Centre[- ]Sud\b/i,
  /r[ée]gion\s+du\s+Plateau[- ]Central\b/i,
  /r[ée]gion\s+du\s+Sud[- ]Ouest\b/i,
  /r[ée]gion\s+du\s+Sahel\b/i,
  /r[ée]gion\s+de\s+la\s+Boucle\s+du\s+Mouhoun\b/i
];

function qcmDeterministicFactIssue(q){
  const question = String(q?.question_text || '');
  const explanation = String(q?.explanation || '');
  const text = `${question} ${explanation}`;
  const questionIsHistorical = qcmHistoricalContext(question);
  const oldRegionIsExplicitContext = /\b(?:ancien(?:ne)?|autrefois|avant|rebaptis[ée]e?|renomm[ée]e?|jusqu['’]?en)\b/i.test(explanation);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text)) return 'Caractère de contrôle interdit';
  if (!questionIsHistorical && !oldRegionIsExplicitContext && QCM_OBSOLETE_BF_REGION_PATTERNS.some(pattern => pattern.test(text))){
    return 'Ancienne dénomination administrative utilisée comme information actuelle';
  }
  if (/\bM[ée]diateur\s+du\s+Faso\b/i.test(text) && !questionIsHistorical && !/suppression|supprim[ée]/i.test(text)){
    return 'Institution supprimée présentée comme actuelle';
  }
  const mentionsAbolishedConsultativeInstitution = /\bConseil\s+[ée]conomique(?:,?\s+social)?(?:\s+et\s+environnemental)?\b/i.test(text)
    || /(?:^|[^\p{L}])(?:CES|CESE)(?=$|[^\p{L}])/u.test(text);
  if (mentionsAbolishedConsultativeInstitution
      && !questionIsHistorical && !/suppression|supprim[ée]/i.test(text)){
    return 'Ancienne institution consultative présentée comme actuelle';
  }
  if (/officier\s+sup[ée]rieur/i.test(question) && /\bcapitaine\b/i.test(text)){
    return 'Le grade de capitaine relève des officiers subalternes';
  }
  if (/Norbert\s+Zongo/i.test(text) && /syndicaliste|homme\s+politique/i.test(question)){
    return 'Norbert Zongo doit être présenté comme journaliste d’investigation';
  }
  if (/Soumane\s+Tour[ée]/i.test(text) && /fondateur\s+du\s+PAI/i.test(text)){
    return 'Soumane Touré ne doit pas être présenté comme fondateur initial du PAI';
  }
  if (/CMRPN/i.test(text) && /Deuxi[èe]me\s+R[ée]publique/i.test(explanation)){
    return 'Le CMRPN a interrompu la Troisième République en 1980';
  }
  if (/Michel\s+Kafando/i.test(text) && /(?:d['’]|depuis\s+)octobre\s+2014/i.test(text)){
    return 'Michel Kafando a été désigné et investi en novembre 2014';
  }
  return '';
}

function normalizeQcmVerification(item, question){
  const evidenceType = strictCleanAiQcmText(item?.evidence_type || item?.verification_method || '', 60).toLowerCase().replace(/\s+/g, '_');
  const score = Number(item?.verification_score ?? item?.factual_score ?? 0);
  const statusRaw = strictCleanAiQcmText(item?.verification_status || '', 40).toLowerCase();
  const sourceUrl = cleanQcmSourceUrl(item?.source_url || item?.sourceUrl || '');
  const verifiedFingerprint = strictCleanAiQcmText(item?.verified_fingerprint || '', 80);
  return {
    evidence_type:evidenceType,
    source_title:strictCleanAiQcmText(item?.source_title || item?.sourceTitle || '', 400),
    source_url:sourceUrl,
    source_quote:strictCleanAiQcmText(item?.source_quote || item?.sourceQuote || '', 1600),
    source_date:strictCleanAiQcmText(item?.source_date || item?.sourceDate || '', 80),
    verification_status:['verified','rejected','stale','generated'].includes(statusRaw) ? statusRaw : 'generated',
    verification_score:Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    verification_reason:strictCleanAiQcmText(item?.verification_reason || item?.reason || '', 1200),
    verified_at:strictCleanAiQcmText(item?.verified_at || '', 80),
    verified_by:strictCleanAiQcmText(item?.verified_by || '', 120),
    verified_fingerprint:verifiedFingerprint || (statusRaw === 'verified' ? qcmContentFingerprint(question) : ''),
    verification_version:strictCleanAiQcmText(item?.verification_version || '', 80)
  };
}

function qcmVerificationIssue(q, { category='', theme='', requireVerified=true } = {}){
  const deterministic = qcmDeterministicFactIssue(q);
  if (deterministic) return deterministic;
  if (!requireVerified) return '';
  if (q?.verification_status !== 'verified') return q?.verification_status === 'rejected'
    ? (q.verification_reason || 'Question rejetée par le contrôle factuel')
    : 'Question non vérifiée factuellement';
  if (Number(q?.verification_score || 0) < AI_QCM_MIN_VERIFICATION_SCORE) return `Score factuel inférieur à ${AI_QCM_MIN_VERIFICATION_SCORE}/100`;
  if (!q?.verified_fingerprint || q.verified_fingerprint !== qcmContentFingerprint(q)) return 'Question modifiée après sa dernière vérification';
  if (q?.verification_version !== AI_QCM_VERIFICATION_VERSION) return 'Vérification factuelle ancienne ou inconnue';
  const evidenceType = String(q?.evidence_type || '');
  const reasoningAllowed = QCM_REASONING_CATEGORIES.test(String(category || q?.category || ''));
  if (evidenceType === 'source_pdf'){
    if (!String(q?.source_url || '').startsWith('source-pdf://') || !q?.source_title || String(q?.source_quote || '').length < 18) return 'Passage justificatif du PDF source manquant';
    if (!q?.source_date) return 'Date du document source manquante (indiquer « non datée » si nécessaire)';
    return '';
  }
  if (['calculation','language_rule'].includes(evidenceType)){
    if (!reasoningAllowed || String(q?.verification_reason || '').length < 25) return 'Démonstration pédagogique insuffisante';
    return '';
  }
  if (!['official_source','trusted_educational_source'].includes(evidenceType)) return 'Type de preuve non reconnu';
  if (!q?.source_url || !q?.source_title || String(q?.source_quote || '').length < 18) return 'Source ou extrait justificatif manquant';
  if (!q?.source_date) return 'Date de la source manquante (indiquer « non datée » si nécessaire)';
  if (qcmRequiresOfficialBurkinaSource(category || q?.category, theme, q?.question_text)){
    if (!isOfficialBurkinaQcmSource(q.source_url)) return 'Une source officielle burkinabè est obligatoire';
  }else if (!isTrustedEducationalQcmSource(q.source_url)){
    return 'La source ne fait pas partie des sources éducatives reconnues';
  }
  return '';
}

function qcmVerificationSummary(questions, context = {}){
  const rows = Array.isArray(questions) ? questions : [];
  const issues = rows.map((question, index) => ({ index, issue:qcmVerificationIssue(question, context) })).filter(row => row.issue);
  return {
    total:rows.length,
    verified:rows.length - issues.length,
    blocked:issues.length,
    publishable:rows.length > 0 && issues.length === 0,
    issues:issues.slice(0, 12)
  };
}

function aiQuestionQualityIssue(q, dedupeIndex){
  const question = strictCleanAiQcmText(q?.question_text, 1200);
  const opts = [q?.option_a, q?.option_b, q?.option_c, q?.option_d].map(v => strictCleanAiQcmText(v, 500));
  const explanation = strictCleanAiQcmText(q?.explanation, 3000);
  if (question.length < 24) return 'Question trop courte';
  if (!opts[0] || !opts[1]) return 'Au moins deux options sont obligatoires';
  if (opts[3] && !opts[2]) return 'L’option D ne peut pas être utilisée sans l’option C';
  const providedOptions = opts.filter(Boolean);
  if (new Set(providedOptions.map(normalizeQcmOptionKey)).size !== providedOptions.length) return 'Options répétées';
  if (!Number.isInteger(Number(q?.correct_answer)) || Number(q.correct_answer) < 0 || Number(q.correct_answer) > 3 || !opts[Number(q.correct_answer)]) return 'Bonne réponse invalide';
  if (explanation.length < 22) return 'Correction trop courte';
  const allText = [question, ...opts, explanation].join(' ');
  if (hasForbiddenAiQcmText(allText)) return 'Contenu interne ou commentaire IA détecté';
  if (/\b(?:toutes?\s+les\s+r[ée]ponses|aucune\s+des\s+r[ée]ponses)\b/i.test(allText)) return 'Option trop vague';
  const factualRuleIssue = qcmDeterministicFactIssue({ ...q, question_text:question, explanation });
  if (factualRuleIssue) return factualRuleIssue;
  if (isDuplicateQuestionText(question, dedupeIndex)) return 'Question déjà existante ou trop proche';
  return '';
}

const PUBLIC_QCM_REVIEW_PATTERNS = [
  /\b(?:attends?|revoyons|refaisons|reprenons|recalculons|ajustons|remplaçons)\b/i,
  /\baucune\s+(?:option|r[ée]ponse)\b.{0,100}\bcorrespond/i,
  /\boption\b.{0,80}\bnon\s+pr[ée]sente\b/i,
  /\boption\s+la\s+plus\s+(?:proche|coh[ée]rente)\b/i,
  /\bsi\s+n[ée]cessaire\b/i,
  /\b(?:corrigeons|modifions)\s+(?:l[’']|la\s+)?(?:[ée]nonc[ée]|option|r[ée]ponse)/i
];

function publicQuestionQualityIssue(q){
  const structuralIssue = aiQuestionQualityIssue(q);
  if (structuralIssue) return structuralIssue;
  const allText = [q?.question_text, q?.option_a, q?.option_b, q?.option_c, q?.option_d, q?.explanation]
    .map(value => strictCleanAiQcmText(value, 3000))
    .join(' ');
  if (PUBLIC_QCM_REVIEW_PATTERNS.some(pattern => pattern.test(allText))){
    return 'Correction contenant une hésitation ou une remarque de relecture';
  }
  return '';
}

function normalizeAiQuestion(item, defaults = {}){
  const options = Array.isArray(item?.options) ? item.options : [item?.option_a, item?.option_b, item?.option_c, item?.option_d];
  const correctRaw = item?.correct_answer ?? item?.answer_index ?? item?.answer ?? item?.correctIndex;
  let correct = Number(correctRaw);
  if (!Number.isInteger(correct)){
    const label = String(correctRaw || '').trim().toUpperCase();
    correct = ({A:0, B:1, C:2, D:3})[label] ?? -1;
  }
  const question = adminQuestionPayload({
    category:strictCleanAiQcmText(item?.category || defaults.category, 80),
    level:strictCleanAiQcmText(item?.level || defaults.level, 40),
    question_text:strictCleanAiQcmText(item?.question_text || item?.question, 1200),
    options:options.map(opt => strictCleanAiQcmText(opt, 500)),
    correct_answer:correct,
    explanation:strictCleanAiQcmText(item?.explanation || item?.correction || item?.reason, 3000),
    source:strictCleanAiQcmText(item?.source || defaults.source || 'Réussite Concours BF', 500),
    is_premium:defaults.is_premium,
    is_active:false
  });
  return { ...question, ...normalizeQcmVerification(item, question) };
}

function normalizeAiQuestionRows(rows, defaults, count, { dedupeIndex } = {}){
  const questions = [];
  const index = dedupeIndex || createQuestionDedupeIndex();
  for (const row of (Array.isArray(rows) ? rows : [])){
    try{
      const q = normalizeAiQuestion(row, defaults);
      const issue = aiQuestionQualityIssue(q, index);
      if (issue) continue;
      questions.push(q);
      addQuestionToDedupeIndex(q.question_text, index);
    }catch(err){ /* ignore invalid draft */ }
    if (questions.length >= count) break;
  }
  return questions;
}

function normalizeAiQuestionList(aiText, defaults, count, options = {}){
  const parsed = extractJsonFromAi(aiText);
  const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.questions) ? parsed.questions : []);
  return normalizeAiQuestionRows(rows, defaults, count, options);
}


function pastedQcmImportMetadata(body = {}){
  const title = cleanText(body?.title || '', 180).replace(/\s+/g, ' ').trim();
  if (title.length < 3) throw Object.assign(new Error('Ajoute un titre pour ce nouveau QCM.'), { status:400 });
  const level = normalizedLevelName(body?.level || 'Concours');
  if (!AI_LEVEL_CATEGORY_RULES[level]) throw Object.assign(new Error('Niveau non reconnu.'), { status:400 });
  const category = cleanText(body?.category || '', 80);
  if (!categoryAllowedForLevel(category, level)) throw Object.assign(new Error('Choisis un module compatible avec le niveau.'), { status:400 });
  const date = cleanText(body?.date || todayId(), 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Object.assign(new Error('Date de publication invalide.'), { status:400 });
  const parsedDate = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date){
    throw Object.assign(new Error('Date de publication invalide.'), { status:400 });
  }
  return {
    title,
    date,
    created_at:parsedDate.toISOString(),
    category,
    level,
    is_premium:Boolean(body?.is_premium)
  };
}

function cleanPastedQcmLine(value){
  return stripHtml(String(value || '')
    .replace(/([0-9])\uFE0F?\u20E3/g, '$1.')
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/\*\*|__|`/g, ''))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pastedQcmAnswerLabels(value){
  const raw = String(value || '').trim();
  if (!raw) return [];
  const prefix = raw.match(/^((?:(?:l['’]?option|option)\s*)?[A-D](?:\s*(?:,|;|\/|\+|&|et|ou)\s*(?:(?:l['’]?option|option)\s*)?[A-D]){0,3})(?=\s*(?:$|[.,):-]))/i)?.[1] || '';
  if (!prefix) return [];
  return [...new Set((prefix.match(/\b[A-D]\b/gi) || []).map(label => label.toUpperCase()))];
}

function pastedQcmHasNoCorrectOption(value){
  const text = cleanPastedQcmLine(value).replace(/[.!?;:]+$/g, '').trim();
  return /^(?:aucune\s+(?:des\s+)?(?:propositions?|options?|r[ée]ponses?|choix)|aucune\s+bonne\s+r[ée]ponse(?:\s+parmi\s+(?:les\s+)?(?:choix|propositions?|options?))?|aucune\s+r[ée]ponse\s+correcte|aucun\s+(?:des\s+)?choix|aucun\s+choix\s+correct|pas\s+de\s+bonne\s+r[ée]ponse)$/i.test(text);
}

function pastedQcmAnswerIndexes(block){
  const explicit = Array.isArray(block?.answerLabels) ? block.answerLabels : [];
  const labels = [...new Set([...explicit, block?.answerLabel].filter(Boolean).map(label => String(label).trim().toUpperCase()))]
    .filter(label => /^[A-D]$/.test(label));
  if (labels.length) return labels.map(label => label.charCodeAt(0) - 65);
  const answer = normalizeQcmOptionKey(String(block?.answerText || '').replace(/^option\s+/i, ''));
  if (!answer) return [];
  const index = (block.options || []).findIndex(option => normalizeQcmOptionKey(option) === answer);
  return index >= 0 ? [index] : [];
}

function pastedQcmAnswerIndex(block){
  return pastedQcmAnswerIndexes(block)[0] ?? -1;
}

function pastedQcmQualityIssue(question, dedupeIndex){
  // Les QCM collés sont rédigés par l’administrateur : une question courte
  // comme « La méiose permet : » est parfaitement valide. On conserve les
  // contrôles utiles sans appliquer la longueur minimale réservée aux textes générés.
  const allText = [question?.question_text, question?.option_a, question?.option_b, question?.option_c, question?.option_d, question?.explanation]
    .map(value => strictCleanAiQcmText(value, 3000))
    .join(' ');
  if (hasForbiddenAiQcmText(allText)) return 'Contenu de relecture non accepté';
  if (/\b(?:toutes?\s+les\s+r[ée]ponses|aucune\s+des\s+r[ée]ponses)\b/i.test(allText)) return 'Choix trop vague';
  const factualRuleIssue = qcmDeterministicFactIssue(question);
  if (factualRuleIssue) return factualRuleIssue;
  if (PUBLIC_QCM_REVIEW_PATTERNS.some(pattern => pattern.test(allText))) return 'Correction à finaliser';
  if (isDuplicateQuestionText(question?.question_text, dedupeIndex)) return 'Question déjà présente ou trop proche';
  return '';
}

function parsePastedQcmText(rawText, defaults = {}, { dedupeIndex, forBook = false } = {}){
  const raw = String(rawText || '');
  if (!raw.trim()) throw Object.assign(new Error('Colle d’abord les QCM numérotés dans la grande case.'), { status:400 });
  const maxTextLength = forBook ? 900000 : 200000;
  if (raw.length > maxTextLength) throw Object.assign(new Error('Le texte collé est trop volumineux.'), { status:413 });
  const lines = raw.replace(/\r\n?/g, '\n').replace(/```(?:json|text|markdown)?/gi, '').split('\n');
  const blocks = [];
  let current = null;
  let ignoredLines = 0;
  const finish = () => {
    if (!current) return;
    current.question = cleanPastedQcmLine(current.question);
    current.options = current.options.map(cleanPastedQcmLine);
    current.explanation = cleanPastedQcmLine(current.explanation);
    blocks.push(current);
    current = null;
  };
  for (const rawLine of lines){
    const line = cleanPastedQcmLine(rawLine);
    if (!line) continue;
    const questionMatch = line.match(/^\s*(?:[-•]\s*)?(?:(?:question|qcm|q)\s*)?(?:n(?:[°ºo])?\s*)?(\d{1,3})(?:\s*[.)]|\s*[:\-–—])\s*(.+)$/i);
    if (questionMatch){
      finish();
      current = {
        number:Number(questionMatch[1]),
        question:questionMatch[2],
        options:['','','',''],
        answerLabel:'',
        answerLabels:[],
        answerText:'',
        explanation:'',
        answerTrailing:'',
        duplicateOption:false,
        part:'question',
        optionIndex:-1
      };
      continue;
    }
    if (!current){ ignoredLines += 1; continue; }
    const optionMatch = line.match(/^\s*(?:[-•]\s*)?([A-D])\s*(?:[.)]|[:\-–—])\s*(.+)$/i);
    if (optionMatch){
      const optionIndex = optionMatch[1].toUpperCase().charCodeAt(0) - 65;
      if (current.options[optionIndex]) current.duplicateOption = true;
      current.options[optionIndex] = optionMatch[2];
      current.optionIndex = optionIndex;
      current.part = 'option';
      continue;
    }
    const answerMatch = line.match(/^\s*(?:(?:bonne(?:s)?\s+)?r[ée]ponse(?:s)?(?:\s+(?:correcte(?:s)?|possible(?:s)?))?|correct\s+answer(?:s)?)\s*(?:est|sont)?\s*(?:[:\-–—]\s*)?(.+)$/i);
    if (answerMatch){
      const answerBody = answerMatch[1].trim();
      const answerLabels = pastedQcmAnswerLabels(answerBody);
      if (answerLabels.length){
        current.answerLabels = answerLabels;
        current.answerLabel = answerLabels[0];
        const prefix = answerBody.match(/^((?:(?:l['’]?option|option)\s*)?[A-D](?:\s*(?:,|;|\/|\+|&|et|ou)\s*(?:(?:l['’]?option|option)\s*)?[A-D]){0,3})(?:\s*[.,):-]\s*)?(.*)$/i);
        current.answerTrailing = cleanPastedQcmLine(prefix?.[2] || '');
      }else{
        current.answerText = answerBody;
      }
      current.part = 'answer';
      current.optionIndex = -1;
      continue;
    }
    const explanationMatch = line.match(/^\s*(?:explication|correction|justification|raison)\s*[:\-–—]\s*(.*)$/i);
    if (explanationMatch){
      const explanationBody = explanationMatch[1].trim();
      const leadingLabel = explanationBody.match(/^(?:l['’]?option\s+|option\s+)?([A-D])(?:\s*[.)]|\s*[:\-–—])\s*(.*)$/i);
      const embeddedLabel = explanationBody.match(/\b(?:bonne\s+r[ée]ponse|r[ée]ponse\s+correcte)\s+(?:est\s+)?(?:l['’]?option\s+|option\s+)?([A-D])\b/i);
      if (!current.answerLabel && leadingLabel) current.answerLabel = leadingLabel[1].toUpperCase();
      if (!current.answerLabel && embeddedLabel) current.answerLabel = embeddedLabel[1].toUpperCase();
      current.explanation = `${current.explanation} ${explanationBody}`.trim();
      current.part = 'explanation';
      current.optionIndex = -1;
      continue;
    }
    if (current.part === 'option' && current.optionIndex >= 0){
      current.options[current.optionIndex] = `${current.options[current.optionIndex]} ${line}`.trim();
    }else if (current.part === 'explanation' || current.part === 'answer'){
      current.explanation = `${current.explanation} ${line}`.trim();
      current.part = 'explanation';
    }else{
      current.question = `${current.question} ${line}`.trim();
    }
  }
  finish();

  const index = dedupeIndex || createQuestionDedupeIndex();
  const questions = [];
  const rejected = [];
  for (const block of blocks){
    if (!forBook && questions.length >= 50){
      rejected.push({ number:block.number, question:block.question, reason:'Limite de 50 QCM par import.' });
      continue;
    }
    try{
      if (!forBook && block.duplicateOption) throw new Error('Une lettre de réponse est répétée dans les options.');
      if (!forBook && (!block.options[0] || !block.options[1])) throw new Error('Ajoute au moins les deux options A et B.');
      if (!forBook && block.options[3] && !block.options[2]) throw new Error('Ajoute l’option C avant l’option D.');
      const noCorrectOption = forBook && pastedQcmHasNoCorrectOption(block.answerText);
      const correctAnswers = pastedQcmAnswerIndexes(block);
      if (!correctAnswers.length && !noCorrectOption){
        throw new Error('Bonne réponse introuvable. Utilise « Réponse : A », « Réponses : A et C » ou « Réponse : aucune des propositions ».' );
      }
      if (correctAnswers.some(answer => !block.options[answer])) throw new Error('Une bonne réponse désigne une option absente.');
      const correctAnswer = noCorrectOption ? -1 : correctAnswers[0];
      let explanation = block.explanation;
      if (!explanation && block.answerTrailing && correctAnswer >= 0){
        const correctOption = normalizeQcmOptionKey(block.options[correctAnswer]);
        if (normalizeQcmOptionKey(block.answerTrailing) !== correctOption) explanation = block.answerTrailing;
      }
      let question;
      if (forBook){
        const options = block.options.map(value => cleanEducationalText(value, 500));
        const questionText = cleanEducationalText(block.question, 1200);
        question = {
          category:cleanText(defaults.category || 'Culture générale', 80),
          level:cleanText(defaults.level || 'Concours', 40),
          question_text:questionText,
          option_a:options[0],
          option_b:options[1],
          option_c:options[2],
          option_d:options[3],
          correct_answer:correctAnswer,
          explanation:cleanEducationalText(explanation, 3000),
          source:cleanText(defaults.title || defaults.source || 'Import administrateur', 500),
          is_premium:Boolean(defaults.is_premium),
          is_active:true,
          no_correct_option:noCorrectOption
        };
      }else{
        question = adminQuestionPayload({
          category:defaults.category || 'Culture générale',
          level:defaults.level || 'Concours',
          question_text:block.question,
          options:block.options,
          correct_answer:correctAnswer,
          explanation,
          source:defaults.title || defaults.source || 'Import administrateur',
          is_premium:Boolean(defaults.is_premium),
          is_active:true
        });
        const issue = pastedQcmQualityIssue(question, index);
        if (issue) throw new Error(issue);
      }
      questions.push({ ...question, correct_answers:correctAnswers, import_number:block.number });
      if (!forBook) addQuestionToDedupeIndex(question.question_text, index);
    }catch(err){
      rejected.push({ number:block.number, question:block.question || `QCM ${block.number}`, reason:err.message || 'Format non reconnu.' });
    }
  }
  if (!blocks.length){
    rejected.push({ number:0, question:'Texte collé', reason:'Aucun QCM numéroté détecté. Commence chaque question par 1., 2., 3., etc.' });
  }
  return { questions, rejected, detected:blocks.length, ignoredLines };
}

async function preparePastedQcmImport(body = {}){
  const metadata = pastedQcmImportMetadata(body);
  const existingTexts = await collectExistingQcmTexts({ includeDaily:false });
  const parsed = parsePastedQcmText(body?.text, metadata, { dedupeIndex:createQuestionDedupeIndex(existingTexts) });
  return { metadata, ...parsed, existingCount:existingTexts.length };
}

function promptAvoidBlock(avoidQuestions = [], existingCount = 0){
  const rows = (avoidQuestions || [])
    .map(q => strictCleanAiQcmText(q, 220))
    .filter(Boolean)
    .slice(0, 35);
  const header = existingCount > 0
    ? `\nLa base de l'application contient déjà environ ${existingCount} QCM. Tu dois créer des questions nouvelles, sans reformuler les anciennes.`
    : '';
  if (!rows.length) return header;
  return `${header}\nQuestions déjà présentes ou déjà préparées à NE PAS répéter ni reformuler:\n${rows.map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
}

function aiQcmPrompt({ count, category, level, theme, publicationName = '', fromPdf = false, avoidQuestions = [], existingCount = 0 }){
  const currentDate = new Date().toISOString().slice(0, 10);
  const officialRequired = qcmRequiresOfficialBurkinaSource(category, theme);
  const sourceLine = fromPdf
    ? `Lis le PDF joint et génère exactement ${count} QCM en français uniquement à partir de passages explicites du document. Pour chaque QCM, recopie un court extrait probant du PDF. Si le document ne prouve pas clairement la réponse, n'utilise pas ce fait.`
    : `Génère exactement ${count} QCM en français. Utilise la recherche web pour contrôler les faits avant de répondre.`;
  const evidenceRules = fromPdf
    ? `- evidence_type doit être "source_pdf"; source_url doit être "source-pdf://uploaded-document"; source_title décrit le PDF; source_quote reproduit le passage exact qui prouve la réponse; source_date reprend la date visible du document ou "non datée".`
    : officialRequired
      ? `- chaque fait doit être appuyé par une page officielle burkinabè: domaine .gov.bf, presidencedufaso.bf, assembleenationale.bf, legiburkina.bf ou insd.bf; evidence_type="official_source"; fournis l'URL directe, le titre et un extrait probant. Aucune source de blog, réseau social, Wikipédia ou média généraliste.`
      : `- chaque fait doit avoir une preuve: source officielle ou éducative reconnue avec URL directe, titre et extrait; pour un calcul démontré utilise evidence_type="calculation"; pour une règle de langue démontrée utilise evidence_type="language_rule".`;
  const nameLine = publicationName ? `Nom du QCM demandé: ${publicationName}.` : '';
  return `Tu es un enseignant expert et rigoureux en préparation aux examens et concours au Burkina Faso. Date de référence: ${currentDate}.\n${sourceLine}\nCatégorie choisie par l'admin: ${category}. Niveau choisi par l'admin: ${level}. Sujet/thème choisi par l'admin: ${theme}. ${nameLine}\nContraintes strictes:\n- respecte le formulaire admin et adapte réellement la difficulté au niveau ${level};\n- produis des faits actuels à la date de référence; une ancienne institution ou dénomination n'est autorisée que dans une question explicitement historique et datée;\n- pour le Burkina Faso en 2026, tiens compte des 17 régions et 47 provinces; les régions actuelles sont Bankui, Djôrô, Goulmou, Guiriko, Kadiogo, Kuilsé, Liptako, Nando, Nakambé, Nazinon, Oubri, Sirba, Soum, Sourou, Tannounyan, Tapoa et Yaadga;\n- ne présente jamais le Médiateur du Faso, le Conseil économique et social ou la Haute Cour de justice comme des institutions actuelles; toute question à leur sujet doit être explicitement historique;\n- chaque QCM doit être clair, non ambigu et ne comporter qu'une seule bonne réponse;\n- l'option correcte doit être explicitement justifiée par la correction et par la preuve;\n- si une preuve manque ou se contredit, abandonne la question au lieu de deviner;\n- ne mélange jamais deux questions en une seule;\n- quatre options obligatoires, toutes différentes et plausibles;\n- correction concise, pédagogique et affirmative;\n- pour les mathématiques et sciences, utilise une notation lisible: x², y′, √(...), σ, Δ, ≤, ≥, ±, ×;\n- aucune remarque interne: ne jamais écrire "attention", "à vérifier", "brouillon", "IA", "je ne peux pas";\n- aucun doublon ni reformulation d'une question existante;\n- avant d'inclure une question, contrôle silencieusement que la bonne réponse est unique, que la correction correspond exactement à cette réponse et que la citation fournie la prouve directement;\n- abandonne toute question dont la preuve n'est pas explicite dans les résultats de recherche; privilégie moins de questions plutôt que des questions fragiles;\n${evidenceRules}\n${promptAvoidBlock(avoidQuestions, existingCount)}\nRéponds uniquement en JSON valide: {"questions":[{"category":"...","level":"...","question_text":"...","options":["...","...","...","..."],"correct_answer":0,"explanation":"...","evidence_type":"official_source|trusted_educational_source|source_pdf|calculation|language_rule","source_title":"...","source_url":"...","source_quote":"...","source_date":"AAAA-MM-JJ ou non datée"}]}`;
}

function questionRowsForVerification(questions){
  return (questions || []).map((q, index) => ({
    index,
    category:q.category,
    level:q.level,
    question_text:q.question_text,
    options:[q.option_a, q.option_b, q.option_c, q.option_d],
    correct_answer:Number(q.correct_answer),
    explanation:q.explanation,
    evidence_type:q.evidence_type || '',
    source_title:q.source_title || '',
    source_url:q.source_url || '',
    source_quote:q.source_quote || '',
    source_date:q.source_date || ''
  }));
}

function qcmSourceWasGrounded(sourceUrl, groundingSources = []){
  const candidate = cleanQcmSourceUrl(sourceUrl);
  if (!candidate) return false;
  try{
    const expected = new URL(candidate);
    return (groundingSources || []).some(row => {
      try{
        const found = new URL(cleanQcmSourceUrl(row?.url || ''));
        if (found.hostname.toLowerCase().replace(/^www\./, '') !== expected.hostname.toLowerCase().replace(/^www\./, '')) return false;
        const a = found.pathname.replace(/\/+$/, '') || '/';
        const b = expected.pathname.replace(/\/+$/, '') || '/';
        return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
      }catch{ return false; }
    });
  }catch{ return false; }
}

function certifyGeminiSinglePassQuestion(question, context = {}){
  const initialIssue = aiQuestionQualityIssue(question)
    || qcmVerificationIssue(question, { ...context, requireVerified:false });
  const externalEvidence = ['official_source','trusted_educational_source'].includes(question?.evidence_type);
  const groundingIssue = externalEvidence && question?.generation_source_grounded === false
    ? 'La source annoncée ne figure pas dans les résultats consultés par Gemini.'
    : '';
  if (initialIssue || groundingIssue) return { question, issue:initialIssue || groundingIssue };
  const certified = {
    ...question,
    verification_status:'verified',
    verification_score:92,
    verification_reason:'Réponse, unicité des options et preuve contrôlées automatiquement après la recherche Gemini.',
    verified_at:new Date().toISOString(),
    verified_by:'gemini-grounded-single-pass',
    verification_version:AI_QCM_VERIFICATION_VERSION
  };
  certified.verified_fingerprint = qcmContentFingerprint(certified);
  const finalIssue = qcmVerificationIssue(certified, { ...context, requireVerified:true });
  return finalIssue ? { question:{ ...certified, verification_status:'rejected' }, issue:finalIssue } : { question:certified, issue:'' };
}

function attachVerificationReview(question, review, model, context = {}){
  const reviewStatus = String(review?.status || '').toUpperCase();
  const score = Number(review?.score ?? review?.factual_score ?? 0);
  const sourceSupports = review?.source_supports_answer === true;
  const answerConsistent = review?.answer_consistent === true;
  const verified = reviewStatus === 'VALIDATED' && sourceSupports && answerConsistent && score >= AI_QCM_MIN_VERIFICATION_SCORE;
  const candidate = {
    ...question,
    evidence_type:strictCleanAiQcmText(review?.evidence_type || question.evidence_type || '', 60).toLowerCase().replace(/\s+/g, '_'),
    source_title:strictCleanAiQcmText(review?.source_title || question.source_title || '', 400),
    source_url:cleanQcmSourceUrl(review?.source_url || question.source_url || ''),
    source_quote:strictCleanAiQcmText(review?.source_quote || question.source_quote || '', 1600),
    source_date:strictCleanAiQcmText(review?.source_date || question.source_date || '', 80),
    verification_status:verified ? 'verified' : 'rejected',
    verification_score:Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
    verification_reason:strictCleanAiQcmText(review?.reason || (verified ? 'Réponse confirmée par la preuve fournie.' : 'Preuve insuffisante ou réponse non confirmée.'), 1200),
    verified_at:new Date().toISOString(),
    verified_by:model || aiVerifierModel(),
    verification_version:AI_QCM_VERIFICATION_VERSION
  };
  candidate.verified_fingerprint = qcmContentFingerprint(candidate);
  const issue = qcmVerificationIssue(candidate, { ...context, requireVerified:true });
  const groundingIssue = context.requireGroundingMatch
    && ['official_source','trusted_educational_source'].includes(candidate.evidence_type)
    && !qcmSourceWasGrounded(candidate.source_url, context.groundingSources)
      ? 'La source annoncée ne figure pas dans les résultats consultés par le vérificateur.'
      : '';
  if (issue || groundingIssue){
    candidate.verification_status = 'rejected';
    candidate.verification_reason = strictCleanAiQcmText(`${candidate.verification_reason} ${issue || groundingIssue}`, 1200);
  }
  return candidate;
}

async function verifyAiQuestionsWithProvider(questions, { category, level, theme, fromPdf=false, extraParts=[] } = {}){
  if (!aiProviderConfigured() || !Array.isArray(questions) || !questions.length){
    return { questions:(questions || []).map(q => ({ ...q, verification_status:'rejected', verification_reason:'Vérificateur indisponible.' })), model:'' };
  }
  const currentDate = new Date().toISOString().slice(0, 10);
  const officialRequired = qcmRequiresOfficialBurkinaSource(category, theme);
  const prompt = `Tu es le second vérificateur indépendant de QCM éducatifs. Date de référence: ${currentDate}. Tu ne dois ni réécrire ni remplacer les questions. Pour chaque index, contrôle séparément l'énoncé, les quatre options, l'indice de réponse, l'explication, l'actualité du fait et la preuve. Utilise la recherche web si le QCM ne vient pas d'un PDF. Pour tout contenu sur le Burkina Faso ou son droit, accepte uniquement une source officielle burkinabè et une dénomination administrative actuelle, sauf contexte historique explicite. Pour un calcul, refais le calcul étape par étape. Pour une règle de français, vérifie la règle. Une URL seule ne suffit pas: l'extrait doit réellement prouver l'option indiquée; indique aussi la date de la source ou « non datée ». Rejette au moindre doute, si plusieurs options sont défendables, si la source est inaccessible/non officielle, ou si l'explication contredit la réponse. Seuil d'exigence: ${AI_QCM_MIN_VERIFICATION_SCORE}/100. Catégorie: ${category}. Niveau: ${level}. Thème: ${theme}. Source PDF: ${fromPdf ? 'oui' : 'non'}. Source officielle burkinabè obligatoire: ${officialRequired ? 'oui' : 'selon le sujet'}. Réponds uniquement en JSON valide: {"reviews":[{"index":0,"status":"VALIDATED|REJECTED","score":0,"answer_consistent":true,"source_supports_answer":true,"reason":"...","evidence_type":"official_source|trusted_educational_source|source_pdf|calculation|language_rule","source_title":"...","source_url":"...","source_quote":"...","source_date":"..."}]}. Retourne exactement un avis par index.\n\nQCM à contrôler:\n${JSON.stringify(questionRowsForVerification(questions))}`;
  const verifyOptions = {
    verifier:true,
    // Vérification indépendante conservée sur Sonnet 5.5 via OpenRouter.
    preferredProvider:'openrouter',
    grounding:AI_QCM_GROUNDING_ENABLED && !fromPdf,
    allowedDomains:qcmSearchAllowedDomains(category, theme),
    temperature:0.05,
    topP:0.7,
    maxOutputTokens:2000
  };
  const ai = extraParts.length
    ? await callAiGenerateParts([{ text:prompt }, ...extraParts], verifyOptions)
    : await callAiGenerate(prompt, verifyOptions);
  let reviews = [];
  try{
    const parsed = extractJsonFromAi(ai.text);
    reviews = Array.isArray(parsed?.reviews) ? parsed.reviews : [];
  }catch{
    reviews = [];
  }
  const byIndex = new Map(reviews.map(review => [Number(review?.index), review]));
  const verifiedQuestions = questions.map((question, index) => attachVerificationReview(
    question,
    byIndex.get(index) || { status:'REJECTED', score:0, answer_consistent:false, source_supports_answer:false, reason:'Avis de vérification manquant.' },
    ai.model,
    {
      category,
      level,
      theme,
      groundingSources:ai.groundingSources || [],
      requireGroundingMatch:Boolean(verifyOptions.grounding && ai.provider === 'openrouter')
    }
  ));
  return { questions:verifiedQuestions, model:ai.model, groundingSources:ai.groundingSources || [] };
}

function rotatingAvoidSample(texts, offset = 0, limit = 70){
  const clean = (texts || []).map(t => strictCleanAiQcmText(t, 220)).filter(Boolean);
  if (clean.length <= limit) return clean;
  const rows = [];
  for (let i = 0; i < limit; i++) rows.push(clean[(offset + i * 37) % clean.length]);
  return rows;
}

async function collectExistingQcmRows({ includeDaily = true } = {}){
  const rows = [];
  loadLocalQcmBank().forEach(q => {
    if (q?.question_text) rows.push({ ...applyQuestionCorrection(q) });
  });
  if (supabaseReady()){
    const extra = await supabaseRequest('questions?select=id,question_text,category,level,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium,is_active,source,created_at&limit=10000').catch(() => []);
    if (Array.isArray(extra)) extra.forEach(q => {
      if (q?.question_text) rows.push({ ...applyQuestionCorrection(q) });
    });
  }
  if (includeDaily){
    const drafts = await loadAiDailyIndex().catch(() => []);
    if (Array.isArray(drafts)){
      drafts.forEach(d => (Array.isArray(d.questions) ? d.questions : []).forEach(q => {
        if (q?.question_text) rows.push({ question_text:q.question_text, category:q.category || d.category || '', level:q.level || d.level || '' });
      }));
    }
  }
  const seen = new Set();
  return rows.filter(row => {
    const text = strictCleanAiQcmText(row.question_text, 1200);
    if (!text) return false;
    const key = normalizeQuestionKey(text);
    if (seen.has(key)) return false;
    seen.add(key);
    row.question_text = text;
    return true;
  });
}

async function collectExistingQcmTexts(options = {}){
  return (await collectExistingQcmRows(options)).map(row => row.question_text);
}

function relevantExistingQcmTexts(rows, category, level){
  const catKey = normalizeQuestionKey(category);
  const levelKey = normalizeQuestionKey(level);
  return (rows || [])
    .filter(row => {
      const rowCat = normalizeQuestionKey(row.category || '');
      const rowLevel = normalizeQuestionKey(row.level || '');
      return (catKey && (rowCat.includes(catKey) || catKey.includes(rowCat))) || (levelKey && rowLevel && rowLevel === levelKey);
    })
    .map(row => row.question_text);
}

function qcmGenerationAngle(category, attempt){
  const cat = normalizeQuestionKey(category);
  const bfAngles = [
    'institutions nationales, hiérarchie administrative et citoyenneté',
    'histoire politique du Burkina Faso, repères chronologiques et acteurs',
    'géographie administrative, régions, provinces, ressources et aménagement du territoire',
    'économie, secteurs productifs, finances publiques et développement local',
    'culture, langues nationales, patrimoine, cohésion sociale et symboles',
    'droit public burkinabè, décentralisation, collectivités territoriales et services publics',
    'actualité institutionnelle formulée de façon générale et durable, sans inventer de date récente',
    'sécurité, environnement, santé publique, éducation et politiques publiques au Burkina Faso'
  ];
  const mathAngles = ['proportionnalité et pourcentages', 'équations et inéquations', 'géométrie plane', 'statistiques et probabilités', 'raisonnement logique numérique'];
  const frenchAngles = ['grammaire', 'orthographe', 'vocabulaire', 'compréhension', 'conjugaison', 'syntaxe'];
  const historyAngles = ['chronologie', 'cartographie', 'décolonisation', 'organisations régionales', 'relations internationales'];
  const psychAngles = ['suites logiques', 'classements', 'analogies', 'raisonnement spatial', 'attention sélective'];
  let angles = ['raisonnement appliqué', 'notions avancées', 'cas pratiques', 'pièges réalistes', 'analyse comparative'];
  if (cat.includes('burkina')) angles = bfAngles;
  else if (cat.includes('math')) angles = mathAngles;
  else if (cat.includes('franc')) angles = frenchAngles;
  else if (cat.includes('histoire') || cat.includes('geo')) angles = historyAngles;
  else if (cat.includes('psych')) angles = psychAngles;
  return angles[attempt % angles.length];
}

function buildAvoidQuestions(existingRows, existingTexts, category, level, questions, attempt){
  const relevant = relevantExistingQcmTexts(existingRows, category, level);
  const avoid = [];
  avoid.push(...rotatingAvoidSample(relevant, attempt * 17, 24));
  avoid.push(...rotatingAvoidSample(existingTexts, attempt * 53, 8));
  avoid.push(...questions.map(q => q.question_text));
  return Array.from(new Set(avoid.map(q => strictCleanAiQcmText(q, 180)).filter(Boolean))).slice(0, 40);
}

async function validateQuestionsForPublication(questions){
  const existingTexts = await collectExistingQcmTexts({ includeDaily:false });
  const dedupeIndex = createQuestionDedupeIndex(existingTexts);
  const accepted = [];
  const rejected = [];
  for (const q of (Array.isArray(questions) ? questions : [])){
    const issue = aiQuestionQualityIssue(q, dedupeIndex);
    if (issue){
      rejected.push({ question:q?.question_text || '', reason:issue });
      continue;
    }
    accepted.push(q);
    addQuestionToDedupeIndex(q.question_text, dedupeIndex);
  }
  return { accepted, rejected, existingCount:existingTexts.length };
}

async function generateUniqueAiQuestions({ count, category, level, theme, publicationName = '', fromPdf = false, extraParts = [], is_premium = false, attemptLimit = 0, skipVerification = false }){
  const target = Math.min(AI_QCM_MAX_COUNT, Math.max(1, Number(count || 1)));
  const existingRows = await collectExistingQcmRows();
  const existingTexts = existingRows.map(row => row.question_text);
  const dedupeIndex = createQuestionDedupeIndex(existingTexts);
  const questions = [];
  const rejected = [];
  let model = '';
  let verificationModel = '';
  const defaults = { category, level, is_premium, source:'Réussite Concours BF' };
  // Petits lots : moins d'inventions, une preuve et un contrôle indépendant pour chaque QCM.
  const maxAttempts = attemptLimit > 0
    ? Math.max(1, Math.min(8, Number(attemptLimit)))
    : Math.max(5, Math.ceil(target / AI_QCM_BATCH_SIZE) * 2 + 4);
  for (let attempt = 0; questions.length < target && attempt < maxAttempts; attempt++){
    const remaining = target - questions.length;
    const batchCount = Math.min(AI_QCM_BATCH_SIZE, remaining);
    const angle = qcmGenerationAngle(category, attempt);
    const avoidQuestions = buildAvoidQuestions(existingRows, existingTexts, category, level, questions, attempt)
      .concat(rejected.slice(-8).map(row => row.question).filter(Boolean))
      .slice(0, 45);
    const batchTheme = `${theme || category}. Angle obligatoire du lot ${attempt + 1}: ${angle}. Chaque réponse doit être prouvée avant d'être proposée.`;
    const prompt = aiQcmPrompt({ count:batchCount, category, level, theme:batchTheme, publicationName, fromPdf, avoidQuestions, existingCount:existingTexts.length });
    const generateOptions = {
      // Gemini Flash prépare rapidement un QCM ; Haiku reste le repli si
      // Gemini rencontre un quota. Sonnet vérifie ensuite indépendamment.
      preferredProvider:'gemini',
      grounding:AI_QCM_GROUNDING_ENABLED && !fromPdf,
      allowedDomains:qcmSearchAllowedDomains(category, batchTheme),
      temperature:0.16,
      topP:0.78,
      maxOutputTokens:5000
    };
    const ai = extraParts.length
      ? await callAiGenerateParts([{ text:prompt }, ...extraParts], generateOptions)
      : await callAiGenerate(prompt, generateOptions);
    model = ai.model || model;
    let candidates = [];
    try{
      candidates = normalizeAiQuestionList(ai.text, defaults, batchCount, { dedupeIndex }).map(question => ({
        ...question,
        generation_source_grounded:fromPdf
          || ['calculation','language_rule','source_pdf'].includes(question.evidence_type)
          || qcmSourceWasGrounded(question.source_url, ai.groundingSources || [])
      }));
    }catch(err){
      rejected.push({ question:'', reason:'Réponse de génération non lisible' });
      continue;
    }
    if (!candidates.length) continue;
    let checkedQuestions = candidates;
    if (AI_QCM_REQUIRE_VERIFICATION && !skipVerification){
      const checked = await verifyAiQuestionsWithProvider(candidates, {
        category,
        level,
        theme:batchTheme,
        fromPdf,
        extraParts:fromPdf ? extraParts : []
      });
      checkedQuestions = checked.questions;
      verificationModel = checked.model || verificationModel;
    }else{
      // Désactiver l'appel automatique ne constitue jamais une vérification :
      // le brouillon reste publiquement bloqué jusqu'à un contrôle explicite.
      checkedQuestions = candidates.map(question => ({
        ...question,
        verification_status:'generated',
        verification_score:0,
        verification_reason:'Vérification factuelle à effectuer avant publication.',
        verified_at:'',
        verified_by:'',
        verified_fingerprint:'',
        verification_version:''
      }));
    }
    for (const question of checkedQuestions){
      const issue = aiQuestionQualityIssue(question) || qcmVerificationIssue(question, { category, level, theme:batchTheme, requireVerified:AI_QCM_REQUIRE_VERIFICATION && !skipVerification });
      if (issue){
        rejected.push({ question:question.question_text, reason:issue });
        continue;
      }
      questions.push(question);
      if (questions.length >= target) break;
    }
  }
  return {
    questions:questions.slice(0, target),
    model,
    verificationModel,
    verification:qcmVerificationSummary(questions.slice(0, target), { category, level, theme, requireVerified:AI_QCM_REQUIRE_VERIFICATION && !skipVerification }),
    rejected:rejected.slice(-20),
    existingCount:existingTexts.length
  };
}

async function verifyExistingQuestionSet(questions, { category, level, theme, fromPdf=false, extraParts=[] } = {}){
  const rows = Array.isArray(questions) ? questions : [];
  const checked = rows.slice();
  const pending = rows
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => Boolean(qcmVerificationIssue(question, { category, level, theme, requireVerified:true })));
  let model = '';
  for (let offset = 0; offset < pending.length; offset += AI_QCM_BATCH_SIZE){
    const indexedBatch = pending.slice(offset, offset + AI_QCM_BATCH_SIZE);
    const result = await verifyAiQuestionsWithProvider(indexedBatch.map(row => row.question), { category, level, theme, fromPdf, extraParts });
    model = result.model || model;
    indexedBatch.forEach((row, index) => { checked[row.index] = result.questions[index]; });
  }
  return {
    questions:checked,
    model,
    verification:qcmVerificationSummary(checked, { category, level, theme, requireVerified:true })
  };
}

function groundingSourcesFromGemini(data){
  const rows = [];
  for (const candidate of (data?.candidates || [])){
    const metadata = candidate?.groundingMetadata || candidate?.grounding_metadata || {};
    for (const chunk of (metadata?.groundingChunks || metadata?.grounding_chunks || [])){
      const web = chunk?.web || {};
      const url = cleanQcmSourceUrl(web?.uri || web?.url || '');
      if (!url) continue;
      rows.push({ url, title:strictCleanAiQcmText(web?.title || '', 300) });
    }
  }
  const seen = new Set();
  return rows.filter(row => !seen.has(row.url) && seen.add(row.url)).slice(0, 30);
}

function openRouterMessageContent(parts = []){
  const content = [];
  for (const part of (Array.isArray(parts) ? parts : [])){
    if (typeof part?.text === 'string' && part.text.trim()){
      content.push({ type:'text', text:part.text });
      continue;
    }
    const inline = part?.inline_data || part?.inlineData;
    if (!inline?.data) continue;
    const mimeType = String(inline.mime_type || inline.mimeType || 'application/octet-stream').toLowerCase();
    if (mimeType === 'application/pdf'){
      content.push({
        type:'file',
        file:{ filename:'source.pdf', file_data:`data:${mimeType};base64,${inline.data}` }
      });
    }else if (mimeType.startsWith('image/')){
      content.push({ type:'image_url', image_url:{ url:`data:${mimeType};base64,${inline.data}` } });
    }
  }
  return content.length === 1 && content[0].type === 'text' ? content[0].text : content;
}

function groundingSourcesFromOpenRouter(data){
  const rows = [];
  for (const choice of (data?.choices || [])){
    const message = choice?.message || {};
    for (const annotation of (Array.isArray(message.annotations) ? message.annotations : [])){
      const citation = annotation?.url_citation || annotation?.urlCitation || annotation;
      const url = cleanQcmSourceUrl(citation?.url || citation?.uri || '');
      if (!url) continue;
      rows.push({
        url,
        title:strictCleanAiQcmText(citation?.title || '', 300),
        quote:strictCleanAiQcmText(citation?.content || citation?.text || '', 1600)
      });
    }
  }
  const seen = new Set();
  return rows.filter(row => !seen.has(row.url) && seen.add(row.url)).slice(0, 40);
}

function openRouterTools(options = {}){
  if (!options.grounding) return [];
  const allowedDomains = Array.from(new Set((options.allowedDomains || []).map(value => String(value || '').trim()).filter(Boolean))).slice(0, 40);
  const searchParameters = {
    engine:OPENROUTER_SEARCH_ENGINE,
    max_results:OPENROUTER_SEARCH_MAX_RESULTS,
    max_uses:OPENROUTER_SEARCH_MAX_USES,
    max_total_results:OPENROUTER_SEARCH_MAX_USES * OPENROUTER_SEARCH_MAX_RESULTS,
    max_characters:1400
  };
  if (OPENROUTER_SEARCH_MODE && ['exa','parallel'].includes(OPENROUTER_SEARCH_ENGINE)) searchParameters.mode = OPENROUTER_SEARCH_MODE;
  if (allowedDomains.length) searchParameters.allowed_domains = allowedDomains;
  // Les extraits de recherche OpenRouter sont des citations extractives. Un
  // second outil web_fetch dans le même appel doublait les boucles et faisait
  // dépasser le délai Vercel sans renforcer le garde-fou de publication.
  return [{ type:'openrouter:web_search', parameters:searchParameters }];
}

async function callOpenRouterGenerateParts(parts, options = {}){
  if (!OPENROUTER_API_KEY) throw Object.assign(new Error('OpenRouter non configuré'), { status:503 });
  const model = options.verifier ? OPENROUTER_VERIFIER_MODEL : OPENROUTER_MODEL;
  const hasPdf = (parts || []).some(part => {
    const inline = part?.inline_data || part?.inlineData;
    return String(inline?.mime_type || inline?.mimeType || '').toLowerCase() === 'application/pdf';
  });
  const tools = openRouterTools(options);
  const requestBody = {
    model,
    messages:[{ role:'user', content:openRouterMessageContent(parts) }],
    max_tokens:Number(options.maxOutputTokens || 10000),
    response_format:{ type:'json_object' },
    provider:{
      allow_fallbacks:true,
      require_parameters:true,
      data_collection:'deny'
    },
    usage:{ include:true }
  };
  // Claude 5.5 utilise la réflexion adaptative et rejette les valeurs non
  // standard de temperature/top_p. L'effort remplace ces anciens réglages.
  if (/^anthropic\/claude-(?:haiku|sonnet|opus)-5\.5$/i.test(model)){
    requestBody.reasoning = { effort:'low' };
  }else{
    requestBody.temperature = Number(options.temperature ?? 0.16);
    requestBody.top_p = Number(options.topP ?? 0.78);
  }
  if (tools.length){
    requestBody.tools = tools;
    requestBody.max_tool_calls = OPENROUTER_SEARCH_MAX_USES;
  }
  if (hasPdf){
    requestBody.plugins = [{ id:'file-parser', pdf:{ engine:'cloudflare-ai' } }];
  }
  let res;
  try{
    res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method:'POST',
      headers:{
        'Authorization':`Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type':'application/json',
        'HTTP-Referer':PUBLIC_BASE_URL,
        'X-OpenRouter-Title':'Réussite Concours BF'
      },
      body:JSON.stringify(requestBody),
      signal:AbortSignal.timeout(AI_QCM_TIMEOUT_MS)
    });
  }catch(err){
    const message = err?.name === 'TimeoutError' ? 'Délai OpenRouter dépassé' : (err?.message || 'Connexion OpenRouter interrompue');
    throw Object.assign(new Error(message), { status:err?.name === 'TimeoutError' ? 504 : 502 });
  }
  const data = await res.json().catch(()=>({}));
  if (!res.ok){
    const message = data?.error?.message || data?.message || `Erreur OpenRouter ${res.status}`;
    const status = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw Object.assign(new Error(message), { status });
  }
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === 'string'
    ? content.trim()
    : (Array.isArray(content) ? content.map(part => part?.text || '').join('\n').trim() : '');
  if (!text) throw Object.assign(new Error('Réponse OpenRouter vide'), { status:502 });
  return {
    provider:'openrouter',
    model:`openrouter:${data?.model || model}`,
    text,
    groundingSources:groundingSourcesFromOpenRouter(data),
    usage:data?.usage || null
  };
}

async function callGeminiGenerateParts(parts, options = {}){
  if (!GEMINI_API_KEY) throw Object.assign(new Error('Service IA indisponible'), { status:503 });
  let lastError = null;
  let lastStatus = 502;
  let quotaFailureSeen = false;
  // Les limites Gemini sont appliquées par modèle. Si le modèle principal a
  // épuisé sa limite, on essaie quelques autres modèles Flash de la même API.
  const models = (await geminiModelsToTry({ verifier:Boolean(options.verifier) })).slice(0, 4);
  modelLoop: for (const model of models){
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
    // Google Search et responseMimeType JSON ne sont pas compatibles sur
    // plusieurs modèles Gemini. Le mode sourcé demande donc du JSON par prompt.
    const jsonModes = options.grounding ? [false] : [true, false];
    for (const jsonMode of jsonModes){
      const generationConfig = {
        temperature:Number(options.temperature ?? 0.16),
        topP:Number(options.topP ?? 0.78),
        maxOutputTokens:Number(options.maxOutputTokens || 10000)
      };
      if (jsonMode) generationConfig.responseMimeType = 'application/json';
      const requestBody = { contents:[{ role:'user', parts }], generationConfig };
      if (options.grounding) requestBody.tools = [{ google_search:{} }];
      let res;
      try{
        res = await fetch(url, {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body:JSON.stringify(requestBody),
          signal:AbortSignal.timeout(AI_QCM_TIMEOUT_MS)
        });
      }catch(err){
        lastStatus = err?.name === 'TimeoutError' ? 504 : 502;
        lastError = err?.name === 'TimeoutError' ? 'Délai Gemini dépassé' : (err?.message || 'Connexion Gemini interrompue');
        break modelLoop;
      }
      const data = await res.json().catch(()=>({}));
      if (!res.ok){
        lastStatus = Number(res.status || 502);
        lastError = data?.error?.message || `Erreur Gemini ${res.status}`;
        if (res.status === 400 && jsonMode && /responseMimeType|mime|schema|structured/i.test(lastError || '')) continue;
        // Une limite 429 peut être propre au modèle. On tente alors le modèle
        // Flash suivant de la même API, sans changer de fournisseur.
        if (res.status === 429){
          quotaFailureSeen = true;
          break;
        }
        if (res.status === 403) break modelLoop;
        break;
      }
      const text = (data?.candidates || [])
        .flatMap(candidate => candidate?.content?.parts || [])
        .map(part => part?.text || '')
        .join('\n')
        .trim();
      if (!text){
        lastStatus = 502;
        const finishReasons = (data?.candidates || []).map(candidate => candidate?.finishReason).filter(Boolean).join(', ');
        lastError = finishReasons ? `Réponse Gemini vide (${finishReasons})` : 'Réponse Gemini vide';
        break;
      }
      return { provider:'gemini', model:`gemini:${model}`, text, groundingSources:groundingSourcesFromGemini(data) };
    }
  }
  const cleanDetail = strictCleanAiQcmText(lastError || 'Aucun modèle Gemini compatible', 300)
    .replace(/AIza[A-Za-z0-9._-]+/g, '[clé masquée]');
  console.warn('Gemini generation failed:', cleanDetail);
  const quotaFailure = quotaFailureSeen || lastStatus === 429 || /quota|rate|resource exhausted|limit/i.test(cleanDetail);
  const friendly = quotaFailure
    ? 'Le quota de création est momentanément atteint. Les QCM déjà enregistrés sont conservés.'
    : options.grounding
      ? 'La recherche des sources est momentanément indisponible. Aucun QCM non sourcé ne sera accepté.'
      : 'La création assistée est momentanément indisponible. Réessaie un peu plus tard.';
  const err = new Error(friendly);
  err.status = quotaFailure ? 429 : (lastStatus >= 400 && lastStatus < 500 ? lastStatus : 502);
  throw err;
}

async function callGeminiGenerate(prompt, options = {}){
  return callGeminiGenerateParts([{ text:prompt }], options);
}

async function callAiGenerateParts(parts, options = {}){
  const preferredProvider = AI_QCM_SINGLE_GEMINI_MODE ? 'gemini' : options.preferredProvider;
  let providers = aiProviderOrder(preferredProvider);
  if (options.singleProvider || AI_QCM_SINGLE_GEMINI_MODE) providers = providers.slice(0, 1);
  if (!providers.length) throw Object.assign(new Error('Service IA indisponible'), { status:503 });
  const failures = [];
  for (const provider of providers){
    const startedAt = Date.now();
    try{
      return provider === 'openrouter'
        ? await callOpenRouterGenerateParts(parts, options)
        : await callGeminiGenerateParts(parts, options);
    }catch(err){
      const status = Number(err?.status || 502);
      failures.push({ provider, status, message:String(err?.message || 'Erreur inconnue') });
      console.warn(`${provider} generation failed:`, err?.message || err);
      // Ne pas enchaîner un deuxième appel long après un délai OpenRouter ou
      // une erreur de compte/requête : cela dépassait la fonction Vercel et
      // provoquait les répétitions « Lot interrompu » pendant plusieurs minutes.
      if (provider === 'openrouter' && (status === 504 || (status >= 400 && status < 500) || Date.now() - startedAt > 20000)) break;
    }
  }
  if (AI_QCM_SINGLE_GEMINI_MODE && failures.length === 1){
    const only = failures[0];
    throw Object.assign(new Error(only.message), { status:only.status });
  }
  const quotaFailure = failures.some(row => [402,429].includes(row.status) || /quota|credit|rate|limit/i.test(row.message));
  const friendly = quotaFailure
    ? 'Crédit ou quota IA atteint pour le moment. Les QCM déjà enregistrés sont conservés.'
    : options.grounding
      ? 'La recherche et la vérification des sources sont indisponibles pour le moment. Aucun QCM non sourcé ne sera accepté.'
      : 'IA indisponible pour le moment. Réessaie un peu plus tard.';
  const detail = failures.map(row => {
    const message = strictCleanAiQcmText(row.message, 260)
      .replace(/(?:sk-or-|sk-ant-|AIza)[A-Za-z0-9._-]+/g, '[clé masquée]');
    return `${row.provider} (${row.status}) : ${message}`;
  }).join(' — ');
  const err = new Error(`${friendly}${detail ? ` Détail fournisseur : ${detail}` : ''}`);
  err.status = quotaFailure ? 429 : 502;
  throw err;
}

async function callAiGenerate(prompt, options = {}){
  return callAiGenerateParts([{ text:prompt }], options);
}

function todayId(date = new Date()){
  return date.toISOString().slice(0, 10);
}

function daysSinceEpoch(dateId){
  const t = Date.parse(`${dateId}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 864e5) : Math.floor(Date.now() / 864e5);
}

function dailyAiPlan(dateId = todayId(), overrides = {}){
  const count = Math.min(AI_QCM_MAX_COUNT, Math.max(1, Number(overrides.count || AI_DAILY_QCM_COUNT || 50)));
  const allCategories = AI_DAILY_CATEGORIES.length ? AI_DAILY_CATEGORIES : AI_DAILY_DEFAULT_CATEGORIES;
  const levels = AI_DAILY_LEVELS.length ? AI_DAILY_LEVELS : AI_DAILY_DEFAULT_LEVELS;
  const day = daysSinceEpoch(dateId);
  const level = cleanText(overrides.level || levels[Math.floor(day / Math.max(1, allCategories.length)) % levels.length] || 'Concours', 40);
  const allowedCategories = categoriesForLevel(level, allCategories);
  const requestedCategory = cleanText(overrides.category || '', 80);
  const category = requestedCategory && allowedCategories.includes(requestedCategory)
    ? requestedCategory
    : (allowedCategories[day % allowedCategories.length] || defaultCategoryForLevel(level, dateId, allCategories));
  const mode = ['module','niveau'].includes(String(overrides.mode || '').toLowerCase()) ? String(overrides.mode).toLowerCase() : AI_DAILY_GROUP_MODE;
  const isPremium = overrides.is_premium === undefined ? AI_DAILY_IS_PREMIUM : Boolean(overrides.is_premium);
  const focus = qcmGenerationAngle(category, day + (level || '').length);
  const theme = cleanText(overrides.theme || (mode === 'niveau'
    ? `Série quotidienne ${dateId} — niveau ${level}, module ${category}. Variation du programme: ${focus}. Évite les mêmes chapitres que les jours précédents.`
    : `Série quotidienne ${dateId} — module ${category}, niveau ${level}. Variation du programme: ${focus}. Évite les mêmes chapitres que les jours précédents.`), 260);
  return { date:dateId, count, category, level, mode, is_premium:isPremium, theme };
}


async function loadAiDailyIndex(){
  try{
    // Cet index change à chaque étape de préparation. Une lecture mise en cache
    // peut faire disparaître le brouillon créé par la requête précédente.
    const file = await downloadResourceObject(AI_DAILY_INDEX_PATH, { fresh:true });
    const data = JSON.parse(file.buffer.toString('utf8') || '[]');
    return Array.isArray(data) ? data : [];
  }catch(err){
    if (err.status === 404 || /Fichier introuvable|not found|does not exist|object.*not/i.test(String(err.message || err.details?.message || ''))) return [];
    throw err;
  }
}

async function saveAiDailyIndex(rows){
  const body = Buffer.from(JSON.stringify(rows || [], null, 2), 'utf8');
  await uploadResourceObject(AI_DAILY_INDEX_PATH, body, 'application/json; charset=utf-8', { cacheControl:'0' });
}

function publicAiDailyDraft(row){
  const questions = Array.isArray(row.questions) ? row.questions : [];
  const verification = qcmVerificationSummary(questions, {
    category:row.category,
    level:row.level,
    theme:row.title,
    requireVerified:true
  });
  return {
    id:row.id,
    date:row.date,
    title:safePdfTitle(row.title || 'QCM quotidien'),
    category:row.category,
    level:row.level,
    count:Number(row.count || questions.length || 0),
    is_premium:Boolean(row.is_premium),
    status:row.status || 'draft',
    model:row.model || '',
    verificationModel:row.verification_model || '',
    verification,
    verificationVersion:AI_QCM_VERIFICATION_VERSION,
    generationTarget:Number(row.generation_target || row.count || questions.length || 0),
    generationProgress:questions.length,
    generating:(row.status || '') === 'generating',
    generationPhase:(Array.isArray(row.pending_questions) && row.pending_questions.length) ? 'verification' : (row.batch_phase || 'generation'),
    pendingCount:Array.isArray(row.pending_questions) ? row.pending_questions.length : 0,
    fileName:row.file_name || '',
    created_at:row.created_at,
    updated_at:row.updated_at || '',
    corrected_at:row.corrected_at || '',
    pdf_revision:Number(row.pdf_revision || 0),
    published_at:row.published_at || '',
    questions,
    orphanResource:Boolean(row.orphan_resource),
    orphanQuestions:Boolean(row.orphan_questions)
  };
}

function dailyDraftResourceId(draft){
  return `daily-pdf-${String(draft?.id || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function resourceDeletionMarkerId(target){
  const key = `${target?.id || ''}|${target?.sourceDraftId || ''}|${target?.title || ''}`;
  return 'deleted-resource-' + crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

function isDailyPdfResourceLike(resource){
  return resource?.source_type === 'daily_qcm_pdf'
    || String(resource?.id || '').startsWith('daily-pdf-')
    || /^QCM\s+quotidien\s*[—-]/i.test(String(resource?.title || resource?.source_title || ''));
}

function resourceDeletionMarker(target = {}){
  const now = new Date().toISOString();
  const title = safePdfTitle(target.title || '');
  const dailyLike = Boolean(target.dailyLike || /^QCM\s+quotidien\s*[—-]/i.test(title) || String(target.id || '').startsWith('daily-pdf-'));
  return {
    id:resourceDeletionMarkerId(target),
    is_deleted:true,
    is_active:false,
    target_id:target.id || '',
    source_draft_id:target.sourceDraftId || '',
    target_title:dailyLike ? title : '',
    source_type:dailyLike ? 'daily_qcm_pdf_deleted' : 'resource_deleted',
    title: title || 'Document supprimé',
    created_at:now,
    updated_at:now
  };
}

function deletedResourceTargetSet(resources = []){
  const set = new Set();
  for (const row of (Array.isArray(resources) ? resources : [])){
    if (!row?.is_deleted) continue;
    if (row.target_id) set.add(String(row.target_id));
    if (row.source_draft_id) set.add(String(row.source_draft_id));
    if (row.target_title) set.add('title:' + safePdfTitle(row.target_title));
  }
  return set;
}

function hiddenResourceTargetSet(resources = []){
  const set = new Set();
  for (const row of (Array.isArray(resources) ? resources : [])){
    if (!row || row.is_deleted || row.is_active !== false || !isDailyPdfResourceLike(row)) continue;
    if (row.id) set.add(String(row.id));
    if (row.source_draft_id) set.add(String(row.source_draft_id));
    if (row.resource_id) set.add(String(row.resource_id));
    const title = safePdfTitle(row.title || row.source_title || '');
    if (title) set.add('title:' + title);
  }
  return set;
}

function resourceBlockedByTargetSet(resource, targets){
  if (!targets?.size || !resource) return false;
  const ids = [resource.id, resource.source_draft_id, resource.resource_id].filter(Boolean).map(String);
  if (ids.some(id => targets.has(id))) return true;
  const title = safePdfTitle(resource.title || resource.source_title || '');
  return Boolean(title && targets.has('title:' + title));
}

function resourceBlockedByDeletion(resource, deletedTargets){
  return resourceBlockedByTargetSet(resource, deletedTargets);
}

function resourceBlockedByHidden(resource, hiddenTargets){
  return resourceBlockedByTargetSet(resource, hiddenTargets);
}

function removeResourceDeletionMarkers(resources = [], target = {}){
  const ids = new Set([target.id, target.sourceDraftId].filter(Boolean).map(String));
  const title = safePdfTitle(target.title || '');
  return (Array.isArray(resources) ? resources : []).filter(row => {
    if (!row?.is_deleted) return true;
    if (row.target_id && ids.has(String(row.target_id))) return false;
    if (row.source_draft_id && ids.has(String(row.source_draft_id))) return false;
    if (title && safePdfTitle(row.target_title || '') === title) return false;
    return true;
  });
}

function visibleResourceRows(resources = []){
  const deletedTargets = deletedResourceTargetSet(resources);
  return (Array.isArray(resources) ? resources : [])
    .filter(r => !r?.is_deleted)
    .filter(r => !resourceBlockedByDeletion(r, deletedTargets));
}

async function ensureDailyDraftResource(draft, { category, level, is_premium, author_phone } = {}){
  if (!draft?.storage_path) return null;
  let resources = await loadResourceIndex().catch(err => {
    if (err.status === 404 || /Fichier introuvable|not found|does not exist|object.*not/i.test(String(err.message || err.details?.message || ''))) return [];
    throw err;
  });
  const id = dailyDraftResourceId(draft);
  const cleanCategory = cleanText(category || draft.category || 'QCM', 80);
  const cleanLevel = cleanText(level || draft.level || 'Concours', 40);
  const cleanDate = cleanText(draft.date || todayId(), 20);
  const title = safePdfTitle(`QCM quotidien — ${cleanCategory} — ${cleanLevel} — ${cleanDate}`);
  resources = removeResourceDeletionMarkers(resources, { id, sourceDraftId:draft.id, title });
  const idx = resources.findIndex(r => !r.is_deleted && (r.id === id || r.source_draft_id === draft.id));
  const existing = idx >= 0 ? resources[idx] : null;
  const fileName = safeFileName(`${title}.pdf`);
  let storagePath = existing?.storage_path || '';
  let size = Number(existing?.size || draft.size || 0);
  let mimeType = existing?.mime_type || 'application/pdf';
  if (!storagePath){
    const file = await downloadResourceObject(draft.storage_path);
    const objectPath = `resources/files/${cleanDate.slice(0,4) || new Date().getFullYear()}/${id}-${fileName}`;
    await uploadResourceObject(objectPath, file.buffer, 'application/pdf');
    storagePath = objectPath;
    size = file.buffer.length;
    mimeType = 'application/pdf';
  }
  const now = new Date().toISOString();
  const resource = {
    ...(existing || {}),
    id,
    title,
    category:'QCM quotidiens',
    description:`${Number(draft.count || draft.questions?.length || 0)} QCM corrigés — ${cleanCategory} · ${cleanLevel}.`,
    file_name:fileName,
    mime_type:mimeType,
    kind:'pdf',
    size,
    storage_path:storagePath,
    is_premium:Boolean(is_premium),
    is_active:true,
    source_draft_id:draft.id,
    source_type:'daily_qcm_pdf',
    author_phone:author_phone || existing?.author_phone || '',
    created_at:existing?.created_at || now,
    updated_at:now
  };
  if (idx >= 0) resources[idx] = resource;
  else resources.unshift(resource);
  await saveResourceIndex(resources);
  return publicResource(resource);
}

async function findPublishedRowsForDailyDraft(draft, { category, level, is_premium } = {}){
  if (!supabaseReady()) return [];
  const sourceTitle = safePdfTitle(draft?.title || `QCM quotidien — ${category || ''} — ${level || ''} — ${draft?.date || ''}`);
  const query = `questions?select=id&source=eq.${encodeURIComponent(sourceTitle)}&category=eq.${encodeURIComponent(category || draft?.category || '')}&level=eq.${encodeURIComponent(level || draft?.level || '')}&is_premium=eq.${Boolean(is_premium)}&limit=1000`;
  return await supabaseRequest(query).catch(() => []);
}

function dailyDraftPublicResource(draft){
  const category = cleanText(draft?.category || 'QCM', 80);
  const level = cleanText(draft?.level || 'Concours', 40);
  const date = cleanText(draft?.date || todayId(), 20);
  return publicResource({
    id:dailyDraftResourceId(draft),
    title:safePdfTitle(`QCM quotidien — ${category} — ${level} — ${date}`),
    category:'QCM quotidiens',
    description:`${Number(draft?.count || draft?.questions?.length || 0)} QCM corrigés — ${category} · ${level}.`,
    file_name:draft?.file_name || safeFileName(`QCM quotidien — ${category} — ${level} — ${date}.pdf`),
    mime_type:draft?.mime_type || 'application/pdf',
    kind:'pdf',
    size:Number(draft?.size || 0),
    storage_path:draft?.storage_path || '',
    is_premium:Boolean(draft?.is_premium),
    is_active:draft?.status === 'published',
    created_at:draft?.published_at || draft?.created_at || '',
    updated_at:draft?.updated_at || draft?.published_at || ''
  });
}

async function loadPublishedDailyPdfResources(){
  const drafts = await loadAiDailyIndex().catch(() => []);
  const resources = await loadResourceIndex().catch(() => []);
  const deletedTargets = deletedResourceTargetSet(resources);
  const publishedDrafts = (Array.isArray(drafts) ? drafts : [])
    .filter(d => d.status === 'published' && d.storage_path)
    .filter(d => !resourceBlockedByDeletion(dailyDraftPublicResource(d), deletedTargets));
  const questionDrafts = await loadPublishedDailyQuestionDrafts(publishedDrafts, deletedTargets).catch(() => []);
  return mergePublicResources(
    publishedDrafts.map(dailyDraftPublicResource),
    questionDrafts.map(dailyDraftPublicResource)
  );
}

function parseDailyResourceTitle(resource){
  const title = String(resource?.title || '');
  const parts = title.split('—').map(p => p.trim()).filter(Boolean);
  const dateMatch = title.match(/\b\d{4}-\d{2}-\d{2}\b/);
  return {
    category:parts.length >= 4 ? parts[1] : 'QCM',
    level:parts.length >= 4 ? parts[2] : 'Concours',
    date:dateMatch ? dateMatch[0] : String(resource?.created_at || todayId()).slice(0, 10)
  };
}

async function loadOrphanDailyResourceDrafts(existingDrafts = []){
  const existingIds = new Set((existingDrafts || []).flatMap(d => [d.id, d.resource_id]).filter(Boolean));
  const resources = await loadResourceIndex().catch(() => []);
  const deletedTargets = deletedResourceTargetSet(resources);
  return visibleResourceRows(resources)
    .filter(r => r.source_type === 'daily_qcm_pdf' || String(r.id || '').startsWith('daily-pdf-'))
    .filter(r => !resourceBlockedByDeletion(r, deletedTargets))
    .filter(r => !existingIds.has(r.source_draft_id) && !existingIds.has(r.id))
    .map(r => {
      const meta = parseDailyResourceTitle(r);
      const count = Number((String(r.description || '').match(/(\d+)\s*QCM/i) || [])[1] || 0);
      return {
        id:r.source_draft_id || r.id,
        date:meta.date,
        title:r.title || `QCM quotidien — ${meta.category} — ${meta.level} — ${meta.date}`,
        category:meta.category,
        level:meta.level,
        count,
        is_premium:Boolean(r.is_premium),
        status:'published',
        model:'',
        file_name:r.file_name || 'qcm-quotidien.pdf',
        mime_type:r.mime_type || 'application/pdf',
        size:Number(r.size || 0),
        storage_path:r.storage_path,
        resource_id:r.id,
        orphan_resource:true,
        questions:[],
        created_at:r.created_at || '',
        updated_at:r.updated_at || '',
        published_at:r.created_at || r.updated_at || ''
      };
    });
}

function dailyQuestionsDraftId(key){
  return 'daily-questions-' + crypto.createHash('sha1').update(String(key || '')).digest('hex').slice(0, 16);
}

function dailyQuestionSourceMatches(source){
  return /^QCM\s+quotidien\s*[—-]/i.test(String(source || '').trim());
}

async function loadPublishedDailyQuestionDrafts(existingDrafts = [], deletedTargets = null){
  if (!supabaseReady()) return [];
  const resources = !deletedTargets ? await loadResourceIndex().catch(() => []) : [];
  const deletionSet = deletedTargets || deletedResourceTargetSet(resources);
  const existingTitles = new Set((existingDrafts || []).map(d => safePdfTitle(d.title || d.source_title || '')).filter(Boolean));
  const query = 'questions?select=id,source,category,level,is_premium,created_at,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation&source=ilike.' + encodeURIComponent('QCM quotidien*') + '&order=created_at.desc&limit=1000';
  const rows = await supabaseRequest(query).catch(() => []);
  const groups = new Map();
  for (const row of (Array.isArray(rows) ? rows : [])){
    if (!dailyQuestionSourceMatches(row.source)) continue;
    const title = safePdfTitle(row.source || 'QCM quotidien');
    const key = `${title}|${row.category || ''}|${row.level || ''}|${Boolean(row.is_premium)}`;
    if (!groups.has(key)) groups.set(key, { key, title, rows:[] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()]
    .filter(group => group.rows.length && !existingTitles.has(group.title))
    .map(group => {
      const first = group.rows[0] || {};
      const meta = parseDailyResourceTitle({ title:group.title, created_at:first.created_at });
      const questions = group.rows.slice().reverse().map(sourceQuestion => {
        const q = applyQuestionCorrection(sourceQuestion);
        return {
          id:q.id,
          question_text:q.question_text,
          option_a:q.option_a,
          option_b:q.option_b,
          option_c:q.option_c,
          option_d:q.option_d,
          correct_answer:q.correct_answer,
          explanation:q.explanation
        };
      });
      return {
        id:dailyQuestionsDraftId(group.key),
        date:meta.date,
        title:group.title,
        source_title:group.title,
        category:first.category || meta.category,
        level:first.level || meta.level,
        count:questions.length,
        is_premium:Boolean(first.is_premium),
        status:'published',
        model:'',
        file_name:'qcm-quotidien.pdf',
        storage_path:'',
        resource_id:'',
        orphan_questions:true,
        questions,
        created_at:first.created_at || '',
        updated_at:first.created_at || '',
        published_at:first.created_at || ''
      };
    })
    .filter(draft => !resourceBlockedByDeletion(dailyDraftPublicResource(draft), deletionSet));
}

async function loadPublishedDailyQuestionDraftById(id){
  const drafts = await loadPublishedDailyQuestionDrafts([]);
  return drafts.find(d => d.id === id) || null;
}

async function loadPublishedDailyQuestionDraftByResourceId(resourceId){
  const drafts = await loadPublishedDailyQuestionDrafts([]);
  return drafts.find(d => dailyDraftResourceId(d) === resourceId) || null;
}

async function loadPublishedDailyQuestionDraftByTitle(title){
  const wanted = safePdfTitle(title || '');
  if (!wanted) return null;
  const drafts = await loadPublishedDailyQuestionDrafts([]);
  return drafts.find(d => safePdfTitle(d.title || d.source_title || '') === wanted) || null;
}

function mergePublicResources(primary = [], secondary = []){
  const out = [];
  const seen = new Set();
  [...primary, ...secondary].forEach(item => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  });
  return out.sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
}

async function findPublishedDailyDraftByResourceId(id){
  const drafts = await loadAiDailyIndex().catch(() => []);
  const resources = await loadResourceIndex().catch(() => []);
  const deletedTargets = deletedResourceTargetSet(resources);
  const draft = (Array.isArray(drafts) ? drafts : []).find(d => d.status === 'published' && d.storage_path && dailyDraftResourceId(d) === id) || null;
  const resource = draft ? dailyDraftPublicResource(draft) : null;
  return draft && !resourceBlockedByDeletion(resource, deletedTargets) ? draft : null;
}

function dailyDraftResourceRecord(draft, overrides = {}){
  const category = cleanText(overrides.category || draft?.category || 'QCM', 80);
  const level = cleanText(overrides.level || draft?.level || 'Concours', 40);
  const date = cleanText(draft?.date || todayId(), 20);
  const title = safePdfTitle(overrides.title || `QCM quotidien — ${category} — ${level} — ${date}`);
  const now = new Date().toISOString();
  return {
    id:overrides.id || dailyDraftResourceId(draft),
    title,
    category:'QCM quotidiens',
    description:`${Number(draft?.count || draft?.questions?.length || 0)} QCM corrigés — ${category} · ${level}.`,
    file_name:draft?.file_name || safeFileName(`${title}.pdf`),
    mime_type:draft?.mime_type || 'application/pdf',
    kind:'pdf',
    size:Number(draft?.size || 0),
    storage_path:draft?.storage_path || '',
    is_premium:overrides.is_premium === undefined ? Boolean(draft?.is_premium) : Boolean(overrides.is_premium),
    is_active:overrides.is_active === undefined ? draft?.status === 'published' : Boolean(overrides.is_active),
    source_draft_id:draft?.id || '',
    source_type:'daily_qcm_pdf',
    author_phone:overrides.author_phone || '',
    created_at:draft?.published_at || draft?.created_at || now,
    updated_at:now
  };
}

async function deleteDailyDraftResource(draft){
  const resources = await loadResourceIndex().catch(err => {
    if (err.status === 404 || /Fichier introuvable|not found|does not exist|object.*not/i.test(String(err.message || err.details?.message || ''))) return [];
    throw err;
  });
  const id = dailyDraftResourceId(draft);
  const ids = new Set([id, draft?.resource_id, draft?.id].filter(Boolean));
  const item = resources.find(r => !r.is_deleted && (ids.has(r.id) || ids.has(r.source_draft_id)));
  if (item?.storage_path) await deleteResourceObject(item.storage_path);
  const title = safePdfTitle(item?.title || draft?.title || `QCM quotidien — ${draft?.category || 'QCM'} — ${draft?.level || 'Concours'} — ${draft?.date || todayId()}`);
  const marker = resourceDeletionMarker({ id, sourceDraftId:draft?.id, title, dailyLike:true });
  const next = removeResourceDeletionMarkers(resources.filter(r => !ids.has(r.id) && !ids.has(r.source_draft_id)), { id, sourceDraftId:draft?.id, title });
  next.unshift(marker);
  await saveResourceIndex(next);
  return Boolean(item);
}

async function deletePublishedDailyQuestions(draft, { category, level, is_premium } = {}){
  if (!supabaseReady()) return 0;
  const sourceTitle = safePdfTitle(draft?.title || `QCM quotidien — ${category || ''} — ${level || ''} — ${draft?.date || ''}`);
  const publishCategory = category || draft?.category || '';
  const publishLevel = level || draft?.level || '';
  const publishPremium = Boolean(is_premium);
  const existing = await findPublishedRowsForDailyDraft(draft, { category:publishCategory, level:publishLevel, is_premium:publishPremium });
  await supabaseRequest(`questions?source=eq.${encodeURIComponent(sourceTitle)}&category=eq.${encodeURIComponent(publishCategory)}&level=eq.${encodeURIComponent(publishLevel)}&is_premium=eq.${publishPremium}`, {
    method:'DELETE',
    prefer:'return=minimal'
  }).catch(() => {});
  return Array.isArray(existing) ? existing.length : 0;
}

function pdfCleanText(value){
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/\s+\n/g, '\n')
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

function questionAnswerIndexes(question = {}){
  const values = Array.isArray(question?.correct_answers) && question.correct_answers.length
    ? question.correct_answers
    : [question?.correct_answer];
  return [...new Set(values.map(Number).filter(index => Number.isInteger(index) && index >= 0 && index <= 3))];
}

function questionAnswerLabels(question = {}){
  if (question?.no_correct_option) return 'Aucune des propositions';
  const labels = questionAnswerIndexes(question).map(answerLabel);
  if (!labels.length) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} et ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} et ${labels.at(-1)}`;
}

function pdfYear(value){
  const raw = String(value || todayId()).slice(0, 4);
  return /^\d{4}$/.test(raw) ? raw : String(new Date().getFullYear());
}

function subjectNumber(date){
  const day = daysSinceEpoch(date || todayId());
  return String((day % 99) + 1).padStart(2, '0');
}

const PDF_THEME_KEYS = [
  'montserrat-concours',
  'open-sans-epure',
  'roboto-classique',
  'tinos-examen'
];

// Chaque nouveau livre reçoit une seule harmonie dominante. Sur une instance
// active, la génération suivante choisit obligatoirement une autre harmonie.
let lastPastedQcmBookToneIndex = -1;

function setupPdfFonts(doc, requestedTheme = ''){
  const bundledFonts = path.join(PUBLIC_DIR, 'fonts');
  const fontFiles = {
    montserrat:{
      family:'Montserrat',
      regular:path.join(bundledFonts, 'Montserrat-Regular.ttf'),
      bold:path.join(bundledFonts, 'Montserrat-ExtraBold.ttf'),
      italic:path.join(bundledFonts, 'Montserrat-Italic.ttf')
    },
    openSans:{
      family:'Open Sans',
      regular:path.join(bundledFonts, 'OpenSans-Regular.ttf'),
      bold:path.join(bundledFonts, 'OpenSans-ExtraBold.ttf'),
      italic:path.join(bundledFonts, 'OpenSans-Italic.ttf')
    },
    roboto:{
      family:'Roboto',
      regular:path.join(bundledFonts, 'Roboto-Regular.ttf'),
      bold:path.join(bundledFonts, 'Roboto-Black.ttf'),
      italic:path.join(bundledFonts, 'Roboto-Italic.ttf')
    },
    tinos:{
      family:'Tinos',
      regular:path.join(bundledFonts, 'Tinos-Regular.ttf'),
      bold:path.join(bundledFonts, 'Tinos-Bold.ttf'),
      italic:path.join(bundledFonts, 'Tinos-Italic.ttf')
    }
  };
  const designs = [
    {
      key:'montserrat-concours', font:'montserrat', variant:'canva-bold', label:'Édition Concours',
      type:{ question:15.8, option:12.5, answer:10.8, explanation:10.3 },
      palette:{ paper:'#ffffff', ink:'#111827', primary:'#075f45', secondary:'#d92532', accent:'#f4b400', muted:'#596273', border:'#cbd5e1', soft:'#f7faf9', correction:'#ffffff', correctionBorder:'#d1d5db', answer:'#087a46' }
    },
    {
      key:'open-sans-epure', font:'openSans', variant:'canva-clean', label:'Édition Épurée',
      type:{ question:16.1, option:13, answer:11, explanation:10.5 },
      palette:{ paper:'#ffffff', ink:'#172033', primary:'#0a7890', secondary:'#ef5b35', accent:'#0e9f6e', muted:'#5f6877', border:'#cfd8df', soft:'#f8fafc', correction:'#ffffff', correctionBorder:'#d5dde3', answer:'#087a46' }
    },
    {
      key:'roboto-classique', font:'roboto', variant:'canva-modern', label:'Édition Classique',
      type:{ question:16.4, option:13.2, answer:11, explanation:10.5 },
      palette:{ paper:'#ffffff', ink:'#17213a', primary:'#173f7a', secondary:'#e54b32', accent:'#0f9d74', muted:'#5b6473', border:'#c9d2dd', soft:'#f8fafc', correction:'#ffffff', correctionBorder:'#d0d7e0', answer:'#0b7655' }
    },
    {
      key:'tinos-examen', font:'tinos', variant:'canva-serif', label:'Édition Examen',
      type:{ question:17.4, option:14, answer:11.4, explanation:11 },
      palette:{ paper:'#ffffff', ink:'#161616', primary:'#6b1f31', secondary:'#b9852e', accent:'#1d6656', muted:'#5f5a57', border:'#cfc7be', soft:'#fffdf8', correction:'#ffffff', correctionBorder:'#d6cec4', answer:'#275c4e' }
    }
  ].map(design => ({ ...design, ...fontFiles[design.font] }))
    .filter(design => fs.existsSync(design.regular) && fs.existsSync(design.bold));
  if (!designs.length){
    throw Object.assign(new Error('Police de document Unicode indisponible pour le PDF.'), { status:500 });
  }
  const requested = cleanText(requestedTheme || process.env.PDF_FONT_THEME, 80).toLowerCase();
  const legacyAliases = {
    'lato-premium':'montserrat-concours',
    'lato-patrimoine':'montserrat-concours',
    'roboto-academie':'roboto-classique',
    'source-sans-moderne':'open-sans-epure',
    'lato-elegance':'tinos-examen',
    'dejavu-serif-edition':'tinos-examen',
    'dejavu-sans-classique':'open-sans-epure'
  };
  const requestedKey = legacyAliases[requested] || requested;
  const selected = designs.find(design => design.key === requestedKey)
    || designs[crypto.randomInt(0, designs.length)];
  doc.registerFont('RCBF-Regular', selected.regular);
  doc.registerFont('RCBF-Bold', selected.bold);
  if (fs.existsSync(selected.italic)) doc.registerFont('RCBF-Italic', selected.italic);
  return {
    regular:'RCBF-Regular',
    bold:'RCBF-Bold',
    italic:fs.existsSync(selected.italic) ? 'RCBF-Italic' : 'RCBF-Regular',
    family:selected.family,
    theme:selected.key,
    variant:selected.variant,
    label:selected.label,
    type:selected.type,
    palette:selected.palette
  };
}

async function buildQcmDraftPdf({ title, date, category, level, questions }){
  const correctedQuestions = (Array.isArray(questions) ? questions : []).map(applyQuestionCorrection);
  return new Promise((resolve, reject) => {
    const cleanTitle = safePdfTitle(title || `QCM quotidien — ${category || 'Module'} — ${level || 'Niveau'} — ${date || todayId()}`);
    const doc = new PDFDocument({
      size:'A4',
      margin:40,
      bufferPages:true,
      info:{
        Title:cleanTitle,
        Author:'Réussite Concours BF',
        Subject:'QCM quotidien corrigé'
      }
    });
    const fonts = setupPdfFonts(doc);
    const palette = fonts.palette;
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const margin = 40;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - margin * 2;
    const logoPath = path.join(PUBLIC_DIR, 'img', 'logo.png');
    const formattedDate = formatDateForPdf(date);
    const year = pdfYear(date);
    const qCount = correctedQuestions.length;
    const moduleName = pdfCleanText(category || 'Module');
    const levelName = pdfCleanText(level || 'Niveau');

    const font = (kind='regular', size=10, color) => {
      doc.font(fonts[kind] || fonts.regular).fontSize(size);
      if (color) doc.fillColor(color);
      return doc;
    };
    const textH = (value, width, kind='regular', size=10, options={}) => {
      doc.font(fonts[kind] || fonts.regular).fontSize(size);
      return doc.heightOfString(pdfCleanText(value), { width, ...options });
    };
    const pill = (x, y, w, h, label, fill, color='#ffffff', size=10) => {
      doc.roundedRect(x, y, w, h, h / 2).fill(fill);
      font('bold', size, color).text(pdfCleanText(label), x + 8, y + (h - size) / 2 - 1, { width:w - 16, align:'center', ellipsis:true });
    };
    const decorativeDots = (x, y, color=palette.border) => {
      doc.save().fillColor(color).opacity(0.45);
      for (let r=0; r<8; r++){
        for (let c=0; c<9; c++) doc.circle(x + c * 9, y + r * 9, 1.35).fill();
      }
      doc.restore();
    };
    const appLogo = (x, y, size=54) => {
      doc.roundedRect(x, y, size, size, 16).fill('#ffffff');
      if (fs.existsSync(logoPath)){
        try{ doc.image(logoPath, x + 4, y + 4, { fit:[size - 8, size - 8] }); return; }catch{}
      }
      font('bold', size * 0.22, palette.answer).text('RCBF', x + 4, y + size * 0.38, { width:size - 8, align:'center' });
    };

    function drawCover(){
      doc.rect(0, 0, pageW, pageH).fill(palette.paper);
      // Grandes courbes colorées, inspirées de documents de formation sans copie exacte.
      doc.save();
      doc.moveTo(0, 0).lineTo(0, 138).bezierCurveTo(120, 70, 205, 40, 345, 0).closePath().fill(palette.primary);
      doc.moveTo(pageW, 0).lineTo(pageW, pageH).lineTo(pageW - 76, pageH).bezierCurveTo(pageW - 20, 610, pageW - 42, 270, pageW, 90).closePath().fill(palette.primary);
      doc.moveTo(pageW - 18, 12).bezierCurveTo(pageW - 86, 150, pageW - 88, 332, pageW - 36, 475).lineWidth(6).stroke(palette.accent);
      doc.moveTo(0, pageH - 52).bezierCurveTo(120, pageH - 12, 245, pageH - 92, 390, pageH - 44).lineWidth(18).stroke(palette.secondary);
      doc.moveTo(0, pageH - 22).bezierCurveTo(142, pageH + 8, 294, pageH - 70, 462, pageH - 24).lineWidth(20).stroke(palette.accent);
      doc.restore();
      decorativeDots(pageW - 118, 30, '#9ca3af');
      decorativeDots(256, 410, '#d1d5db');

      doc.roundedRect(36, 38, 248, 76, 22).fillOpacity(0.96).fill('#ffffff').fillOpacity(1).strokeColor(palette.border).lineWidth(0.8).stroke();
      appLogo(50, 50, 52);
      font('bold', 19, palette.primary).text('Réussite', 112, 55, { width:160 });
      font('bold', 20, palette.accent).text('Concours BF', 112, 79, { width:165 });
      pill(pageW - 190, 54, 120, 30, 'BURKINA FASO', '#ffffff', palette.primary, 9);

      font('bold', 46, palette.primary).text('PRÉPARATION', 118, 146, { width:420, align:'center' });
      font('bold', 9.5, palette.secondary).text(fonts.label.toUpperCase(), 205, 191, { width:220, align:'center', characterSpacing:0.6 });
      doc.save();
      doc.moveTo(150, 210).lineTo(450, 210).lineTo(432, 256).lineTo(132, 256).closePath().fill(palette.secondary);
      font('bold', 31, '#ffffff').text('INTENSIVE', 154, 216, { width:276, align:'center' });
      doc.restore();
      font('bold', 47, palette.answer).text('CONCOURS', 126, 272, { width:390, align:'center' });

      // Illustration simple : livres + diplôme + cible.
      const bx = 66, by = 260;
      const bookColors = [palette.primary,palette.accent,'#f97316',palette.secondary,'#6d28d9'];
      bookColors.forEach((c, i) => {
        doc.roundedRect(bx, by + i * 28, 148, 24, 5).fill(c);
        font('bold', 8.5, '#ffffff').text(['CULTURE GÉNÉRALE','MATHÉMATIQUES','HISTOIRE-GÉO','FRANÇAIS','INSTITUTIONS'][i], bx + 15, by + i * 28 + 7, { width:118, align:'center' });
      });
      doc.roundedRect(74, by + 150, 122, 34, 8).fill('#fef3c7').strokeColor(palette.accent).stroke();
      font('bold', 8, '#92400e').text('QCM CORRIGÉS', 83, by + 161, { width:104, align:'center' });
      doc.circle(382, 379, 30).lineWidth(8).stroke(palette.secondary);
      doc.circle(382, 379, 18).lineWidth(5).stroke(palette.primary);
      doc.moveTo(382,379).lineTo(416,350).lineWidth(3).stroke(palette.accent);

      doc.roundedRect(206, 326, 318, 106, 16).fill(palette.primary);
      font('bold', 72, '#ffffff').text(year, 222, 326, { width:286, align:'center' });
      font('bold', 13, palette.primary).text('UNE PRÉPARATION AUJOURD’HUI,', 212, 454, { width:292, align:'center' });
      font('bold', 15, palette.secondary).text('VOTRE RÉUSSITE DEMAIN !', 212, 473, { width:292, align:'center' });
      doc.moveTo(225, 496).lineTo(495, 496).lineWidth(1.5).stroke(palette.primary);

      const cardY = 548;
      doc.roundedRect(54, cardY, 218, 78, 10).fill('#ffffff').strokeColor(palette.primary).lineWidth(1.2).stroke();
      doc.rect(54, cardY + 43, 218, 35).fill(palette.accent);
      font('bold', 12, palette.accent).text('DATE DU SUJET', 86, cardY + 15, { width:160 });
      font('bold', 14.5, '#ffffff').text(formattedDate.toUpperCase(), 66, cardY + 53, { width:194, align:'center', lineBreak:false });

      doc.roundedRect(322, cardY, 218, 78, 10).fill('#ffffff').strokeColor(palette.secondary).lineWidth(1.2).stroke();
      doc.rect(322, cardY + 43, 218, 35).fill(palette.secondary);
      font('bold', 12, palette.secondary).text('SUJET', 354, cardY + 15, { width:160 });
      font('bold', 17, '#ffffff').text(`N° ${subjectNumber(date)}  •  ${qCount} QCM`, 334, cardY + 53, { width:194, align:'center', lineBreak:false });

      doc.roundedRect(66, 646, 462, 42, 12).fill(palette.primary);
      font('bold', 13, '#ffffff').text(`MODULE : ${moduleName.toUpperCase()}`, 86, 657, { width:215, align:'left', ellipsis:true });
      font('bold', 13, '#fbbf24').text(`NIVEAU : ${levelName.toUpperCase()}`, 304, 657, { width:198, align:'right', ellipsis:true });

      doc.roundedRect(72, 710, 450, 39, 12).fill(palette.correction).strokeColor(palette.accent).lineWidth(1).stroke();
      font('bold', 14, palette.answer).text('QCM corrigés pour entraînement intensif', 88, 721, { width:418, align:'center' });
      font('bold', 13.5, palette.secondary).text('BURKINA FASO', 54, pageH - 72, { width:220, align:'center', lineBreak:false });
      font('regular', 9.2, palette.answer).text('Ouagadougou • reussiteconcoursbf@yahoo.com', 300, pageH - 69, { width:236, align:'left', lineBreak:false });
    }

    function drawPageFrame(){
      doc.rect(0, 0, pageW, pageH).fill(palette.paper);
      doc.rect(0, 0, pageW, 58).fill(palette.primary);
      doc.rect(0, 58, pageW, 5).fill(palette.accent);
      appLogo(40, 14, 34);
      font('bold', 12, '#ffffff').text('Réussite Concours BF', 84, 18, { width:180 });
      font('regular', 8.5, palette.soft).text(`${moduleName} • ${levelName} • ${formattedDate}`, 84, 35, { width:280, ellipsis:true });
      pill(pageW - 152, 18, 112, 24, `Sujet N° ${subjectNumber(date)}`, '#ffffff', palette.primary, 8.5);
      doc.moveTo(margin, pageH - 62).lineTo(pageW - margin, pageH - 62).lineWidth(0.6).stroke(palette.border);
      font('regular', 8, palette.muted).text('Réussite Concours BF — Préparation aux examens et concours', margin, pageH - 54, { width:contentW, align:'center', lineBreak:false });
      doc.y = 86;
    }

    function questionBlock(q, idx){
      const opts = [q.option_a, q.option_b, q.option_c, q.option_d].map(pdfCleanText);
      const qText = pdfCleanText(q.question_text || 'Question');
      const explanation = pdfCleanText(q.explanation || 'Correction à vérifier.');
      const answer = answerLabel(q.correct_answer);
      const qW = contentW - 54;
      const qH = textH(qText, qW, 'bold', 18.4, { lineGap:3 });
      const optH = opts.reduce((sum, opt) => sum + Math.max(28, textH(opt, contentW - 82, 'regular', 15.5, { lineGap:2 }) + 8), 0);
      const corrH = Math.max(52, textH(explanation, contentW - 74, 'regular', 11.8, { lineGap:1.5 }) + 31);
      return Math.max(188, 54 + qH + optH + corrH);
    }

    function drawQuestion(q, idx){
      const blockH = questionBlock(q, idx);
      if (doc.y + blockH > pageH - 82){ doc.addPage(); drawPageFrame(); }
      const startY = doc.y;
      const numW = 36;
      font('bold', 21, palette.ink).text(`${idx + 1}.`, margin, startY + 1, { width:numW, align:'right' });
      font('bold', 18.4, palette.ink).text(pdfCleanText(q.question_text || 'Question'), margin + 52, startY, { width:contentW - 56, lineGap:3 });
      let y = Math.max(startY + 44, doc.y + 10);
      const opts = [q.option_a, q.option_b, q.option_c, q.option_d].map(pdfCleanText);
      opts.forEach((opt, optIdx) => {
        const label = ['A','B','C','D'][optIdx];
        const h = Math.max(28, textH(opt, contentW - 82, 'regular', 15.5, { lineGap:2 }) + 8);
        font('bold', 15.5, palette.ink).text(`${label}.`, margin + 54, y, { width:26 });
        font('regular', 15.5, palette.ink).text(opt, margin + 86, y, { width:contentW - 92, lineGap:2 });
        y += h;
      });
      const answer = answerLabel(q.correct_answer);
      const corrY = y + 6;
      const corrHeight = Math.max(42, blockH - (corrY - startY) - 10);
      doc.moveTo(margin + 54, corrY + 4).lineTo(margin + 54, corrY + corrHeight - 3).lineWidth(1.2).stroke(palette.correctionBorder);
      font('bold', 12.2, palette.answer).text(`Réponse : ${answer}`, margin + 66, corrY + 6, { width:contentW - 78 });
      font('italic', 11.8, palette.muted).text(`Explication : ${pdfCleanText(q.explanation || '')}`, margin + 66, corrY + 25, { width:contentW - 82, lineGap:1.5 });
      doc.y = startY + blockH + 14;
    }

    drawCover();
    doc.addPage();
    drawPageFrame();
    font('bold', 24, palette.primary).text('Questions à choix multiple', margin, doc.y, { width:contentW, align:'center' });
    doc.y += 24;
    correctedQuestions.forEach((q, idx) => drawQuestion(q, idx));
    doc.end();
  });
}


async function buildPastedQcmBookPdf({ metadata = {}, questions = [], theme = '' } = {}){
  const rows = (Array.isArray(questions) ? questions : []).map(applyQuestionCorrection);
  if (!rows.length) throw Object.assign(new Error('Aucun QCM propre à placer dans le PDF.'), { status:400 });
  return new Promise((resolve, reject) => {
    const cleanTitle = safePdfTitle(metadata.title || 'Cahier de QCM corrigés');
    const doc = new PDFDocument({
      size:'A4',
      margin:46,
      bufferPages:true,
      compress:true,
      info:{
        Title:cleanTitle,
        Author:'Réussite Concours BF',
        Subject:'Livre numérique de QCM corrigés',
        Creator:'Réussite Concours BF',
        Keywords:'concours, QCM, Burkina Faso, préparation'
      }
    });
    const fonts = setupPdfFonts(doc, theme);
    const palette = fonts.palette;
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const logoPath = path.join(PUBLIC_DIR, 'img', 'logo.png');
    const moduleName = pdfCleanText(metadata.category || 'Module');
    const levelName = pdfCleanText(metadata.level || 'Niveau');
    const formattedDate = formatDateForPdf(metadata.date || todayId());
    const labels = ['A','B','C','D'];
    const visual = {
      'canva-bold':{ background:'#edf7f2', wash:'#dcefe6', answer:'#e4f6ec', explanation:'#f6fbf8', ink:'#111827' },
      'canva-clean':{ background:'#edf8fa', wash:'#d9f0f4', answer:'#e1f5f3', explanation:'#f5fbfc', ink:'#172033' },
      'canva-modern':{ background:'#eef3fb', wash:'#dce6f5', answer:'#e4f2ed', explanation:'#f5f8fc', ink:'#17213a' },
      'canva-serif':{ background:'#f8f1f3', wash:'#efe0e4', answer:'#e7f2ed', explanation:'#fcf8f5', ink:'#20191b' }
    }[fonts.variant] || { background:'#f2f5f3', wash:'#e2ece7', answer:'#e4f5ec', explanation:'#f8faf9', ink:palette.ink };
    // Un PDF reste entièrement dans une seule famille de couleur. À chaque
    // nouvelle génération, une autre harmonie est choisie automatiquement.
    const pageTones = [
      { primary:'#087a55', secondary:'#075d43', accent:'#39a77d', background:'#edf8f3', wash:'#d8eee5', answer:'#ddf4e8', explanation:'#f5fbf8', answerInk:'#08714f' },
      { primary:'#0b7f91', secondary:'#096271', accent:'#38a9b8', background:'#edf8fa', wash:'#d7edf1', answer:'#def1f3', explanation:'#f4fafb', answerInk:'#096b79' },
      { primary:'#224f91', secondary:'#183d73', accent:'#5078b4', background:'#eef3fb', wash:'#dae4f4', answer:'#e2ebf7', explanation:'#f5f8fc', answerInk:'#1d467f' },
      { primary:'#781f3a', secondary:'#5f172d', accent:'#a04c66', background:'#f8f0f3', wash:'#ecdde2', answer:'#f1e2e7', explanation:'#fcf7f9', answerInk:'#6b1b34' },
      { primary:'#6540a4', secondary:'#4d307f', accent:'#8a68bd', background:'#f4f0fb', wash:'#e5dcf3', answer:'#ebe3f6', explanation:'#faf7fd', answerInk:'#58378f' },
      { primary:'#31449a', secondary:'#263578', accent:'#6171b8', background:'#f0f2fb', wash:'#dde2f4', answer:'#e4e8f7', explanation:'#f8f8fd', answerInk:'#2b3c89' },
      { primary:'#a3491f', secondary:'#7d3718', accent:'#c46e45', background:'#faf2ed', wash:'#f0dfd5', answer:'#f5e6dd', explanation:'#fdf8f4', answerInk:'#8d3e1b' },
      { primary:'#1769aa', secondary:'#105184', accent:'#4c8fc3', background:'#edf5fb', wash:'#d8e8f4', answer:'#e0edf7', explanation:'#f5f9fc', answerInk:'#145d96' }
    ];
    let bookToneIndex;
    if (lastPastedQcmBookToneIndex < 0){
      bookToneIndex = crypto.randomInt(pageTones.length);
    }else{
      const candidate = crypto.randomInt(pageTones.length - 1);
      bookToneIndex = candidate >= lastPastedQcmBookToneIndex ? candidate + 1 : candidate;
    }
    lastPastedQcmBookToneIndex = bookToneIndex;
    const bookTone = pageTones[bookToneIndex];
    const pageTone = () => bookTone;

    const font = (kind='regular', size=10, color=visual.ink) => {
      doc.font(fonts[kind] || fonts.regular).fontSize(size).fillColor(color);
      return doc;
    };
    const height = (value, width, kind='regular', size=10, options={}) => {
      doc.font(fonts[kind] || fonts.regular).fontSize(size);
      return doc.heightOfString(pdfCleanText(value), { width, ...options });
    };
    const fitSize = (value, width, maxHeight, kind, start, min, options={}) => {
      for (let size=start; size>=min; size-=0.5){
        if (height(value, width, kind, size, options) <= maxHeight) return size;
      }
      return min;
    };
    const logo = (x, y, size=52) => {
      if (fs.existsSync(logoPath)){
        try{ doc.image(logoPath, x, y, { fit:[size, size], align:'center', valign:'center' }); return; }catch{}
      }
      font('bold', size * 0.19, palette.primary).text('RCBF', x, y + size * 0.39, { width:size, align:'center' });
    };
    const paper = color => doc.rect(0, 0, pageW, pageH).fill(color);
    const shadowCard = (x, y, w, h, radius=18) => {
      doc.save().opacity(0.09).fillColor('#000000').roundedRect(x + 5, y + 7, w, h, radius).fill().restore();
      doc.roundedRect(x, y, w, h, radius).fill('#ffffff');
    };

    function drawCover(){
      paper(bookTone.background);
      doc.rect(0, 0, pageW, 18).fill(bookTone.primary);
      doc.rect(0, pageH - 14, pageW, 14).fill(bookTone.primary);

      // Décor léger et équilibré : aucun élément ne pousse la page vers un côté.
      doc.save().opacity(0.10).fillColor(bookTone.primary);
      doc.circle(38, 116, 92).fill();
      doc.circle(pageW - 38, pageH - 120, 92).fill();
      doc.restore();

      const cardX = 46;
      const cardW = pageW - cardX * 2;
      shadowCard(cardX, 52, cardW, pageH - 104, 22);

      const logoSize = 68;
      logo((pageW - logoSize) / 2, 86, logoSize);
      font('bold', 21, visual.ink).text('RÉUSSITE CONCOURS BF', cardX + 28, 166, {
        width:cardW - 56,
        align:'center'
      });
      font('regular', 9.5, palette.muted).text('PRÉPARATION AUX EXAMENS ET CONCOURS', cardX + 28, 197, {
        width:cardW - 56,
        align:'center',
        characterSpacing:0.35
      });
      doc.moveTo(cardX + 38, 226).lineTo(cardX + cardW - 38, 226).lineWidth(1).stroke(bookTone.wash);

      const titleWidth = cardW - 76;
      const titleSize = fitSize(cleanTitle.toUpperCase(), titleWidth, 176, 'bold', 38, 23, { lineGap:3, align:'center' });
      font('bold', titleSize, bookTone.primary).text(cleanTitle.toUpperCase(), cardX + 38, 270, {
        width:titleWidth,
        align:'center',
        lineGap:3
      });

      const titleHeight = height(cleanTitle.toUpperCase(), titleWidth, 'bold', titleSize, { lineGap:3, align:'center' });
      const titleAlreadyShowsCount = /\b\d+\s*QCM\b/i.test(cleanTitle);
      const countY = Math.max(408, 270 + titleHeight + 34);
      if (!titleAlreadyShowsCount){
        doc.roundedRect(cardX + 76, countY, cardW - 152, 58, 14).fill(bookTone.primary);
        font('bold', 21, '#ffffff').text(`${rows.length} QCM CORRIGÉS`, cardX + 92, countY + 17, {
          width:cardW - 184,
          align:'center',
          lineBreak:false
        });
      }

      const infoX = cardX + 60;
      const infoW = cardW - 120;
      const infoStartY = titleAlreadyShowsCount ? countY + 28 : countY + 105;
      const infoRows = [
        ['MODULE', moduleName.toUpperCase()],
        ['NIVEAU', levelName.toUpperCase()],
        ['DATE', formattedDate.toUpperCase()]
      ];
      infoRows.forEach((row, index) => {
        const y = infoStartY + index * 50;
        font('bold', 9.5, palette.muted).text(row[0], infoX, y, { width:76 });
        font('bold', index === 2 ? 11.5 : 13.5, visual.ink).text(row[1], infoX + 80, y - 2, {
          width:infoW - 80,
          align:'right',
          ellipsis:true
        });
        doc.moveTo(infoX, y + 27).lineTo(infoX + infoW, y + 27).lineWidth(0.7).stroke(bookTone.wash);
      });

      font('bold', 10, bookTone.primary).text('BURKINA FASO', cardX + 30, pageH - 78, {
        width:cardW - 60,
        align:'center',
        characterSpacing:0.6
      });
    }

    function normalizedOptions(q){
      return [q.option_a, q.option_b, q.option_c, q.option_d].map(pdfCleanText).filter(Boolean);
    }

    function pageLayout(q){
      const qText = pdfCleanText(q.question_text || 'Question');
      const opts = normalizedOptions(q);
      const explanation = pdfCleanText(q.explanation || '');
      // Ces largeurs sont exactement celles utilisées au dessin afin que la
      // question, les choix et l’explication ne puissent jamais se chevaucher.
      const questionW = 419;
      const optionW = 383;
      const explanationW = 393;
      let chosen = null;
      const starts = fonts.variant === 'canva-serif'
        ? [27,26,25,24,23,22,21,20,19,18,17,16]
        : [26,25,24,23,22,21,20,19,18,17,16];
      for (const questionSize of starts){
        const optionSize = Math.max(13.5, Math.min(18, questionSize - 7));
        const answerSize = Math.max(15, optionSize + 0.5);
        const explanationSize = Math.max(11.5, optionSize - 2.2);
        const qH = height(qText, questionW, 'bold', questionSize, { lineGap:2.4 });
        const optionHs = opts.map(value => Math.max(45, height(value, optionW, 'regular', optionSize, { lineGap:1.7 }) + 18));
        const explanationH = explanation ? height(explanation, explanationW, 'regular', explanationSize, { lineGap:2.1 }) : 0;
        const explanationBoxH = explanation ? Math.max(82, explanationH + 48) : 0;
        const totalH = qH + 18 + optionHs.reduce((sum,value) => sum + value, 0) + 18 + 55 + (explanation ? 12 + explanationBoxH : 0);
        chosen = { qText, opts, explanation, questionSize, optionSize, answerSize, explanationSize, qH, optionHs, explanationH, explanationBoxH, totalH };
        if (totalH <= 553) break;
      }
      return chosen;
    }

    function drawQuestionPage(q, index){
      const tone = pageTone(index);
      paper(tone.background);
      doc.rect(0, 0, pageW, 132).fill(tone.primary);
      doc.rect(0, 0, pageW, 8).fill(tone.accent);
      doc.save().opacity(0.10).fillColor('#ffffff');
      doc.circle(pageW - 20, 25, 100).fill();
      doc.circle(pageW - 118, 90, 42).fill();
      doc.restore();

      doc.roundedRect(38, 25, 51, 51, 25.5).fill('#ffffff');
      logo(44, 31, 39);
      font('bold', 14, '#ffffff').text('RÉUSSITE CONCOURS BF', 102, 36, { width:270 });
      font('regular', 9, '#ffffff').text(`${moduleName} • ${levelName}`, 103, 57, { width:320, ellipsis:true, lineBreak:false });
      font('regular', 8.6, '#ffffff').text(formattedDate, pageW - 205, 47, { width:160, align:'right', lineBreak:false });

      shadowCard(31, 99, pageW - 62, 656, 20);
      const questionPillW = 190;
      const questionPillX = (pageW - questionPillW) / 2;
      doc.roundedRect(questionPillX, 119, questionPillW, 34, 17).fill(tone.primary);
      font('bold', 11.3, '#ffffff').text(`QUESTION ${index + 1} SUR ${rows.length}`, questionPillX + 12, 130, { width:questionPillW - 24, align:'center', lineBreak:false, characterSpacing:0.25 });

      const layout = pageLayout(q);
      const contentX = 65;
      const contentW = pageW - 130;
      let y = 174;
      font('bold', layout.questionSize, tone.primary).text(`${index + 1}.`, contentX, y, { width:37, align:'right', lineBreak:false });
      font('bold', layout.questionSize, visual.ink).text(layout.qText, contentX + 46, y, { width:contentW - 46, lineGap:2.4 });
      y += layout.qH + 18;

      layout.opts.forEach((option, optionIndex) => {
        const rowH = layout.optionHs[optionIndex];
        if (optionIndex % 2 === 0){
          doc.save().opacity(0.72).fillColor(tone.explanation).roundedRect(contentX + 32, y - 7, contentW - 32, rowH, 9).fill().restore();
        }
        doc.circle(contentX + 48, y + 11, 15).fill(tone.primary);
        font('bold', 13, '#ffffff').text(labels[optionIndex], contentX + 38, y + 6, { width:20, align:'center', lineBreak:false });
        font('regular', layout.optionSize, visual.ink).text(option, contentX + 75, y, { width:contentW - 82, lineGap:1.7 });
        doc.moveTo(contentX + 75, y + rowH - 8).lineTo(contentX + contentW, y + rowH - 8).lineWidth(0.5).stroke(tone.wash);
        y += rowH;
      });

      const answerIndexes = questionAnswerIndexes(q);
      const answer = questionAnswerLabels(q);
      const multiple = answerIndexes.length > 1;
      y += 10;
      doc.roundedRect(contentX + 32, y, contentW - 32, 55, 12).fill(tone.answer);
      doc.roundedRect(contentX + 32, y, 8, 55, 4).fill(tone.answerInk);
      const answerPrefix = multiple ? 'RÉPONSES' : 'RÉPONSE';
      font('bold', layout.answerSize, visual.ink).text(`${answerPrefix} : ${answer}`, contentX + 54, y + 17, {
        width:contentW - 70,
        align:'left',
        lineBreak:false,
        ellipsis:true
      });
      y += 67;

      if (layout.explanation){
        doc.roundedRect(contentX + 32, y, contentW - 32, layout.explanationBoxH, 12).fill(tone.explanation);
        doc.rect(contentX + 32, y, 5, layout.explanationBoxH).fill(tone.secondary);
        font('bold', 10.5, tone.secondary).text('EXPLICATION', contentX + 52, y + 13, { width:220, characterSpacing:0.45 });
        font('regular', layout.explanationSize, visual.ink).text(layout.explanation, contentX + 52, y + 33, { width:contentW - 72, lineGap:2.1 });
      }

      font('bold', 8.8, tone.primary).text('RÉUSSITE CONCOURS BF', 42, 776, { width:230, lineBreak:false });
      font('bold', 8.8, tone.primary).text(`${index + 1} / ${rows.length}`, pageW - 112, 776, { width:70, align:'right', lineBreak:false });
    }

    drawCover();
    rows.forEach((question, index) => {
      doc.addPage();
      drawQuestionPage(question, index);
    });
    doc.end();
  });
}
async function preparePastedQcmBook(body = {}){
  const metadata = pastedQcmImportMetadata(body);
  // Le livre reprend fidèlement tous les QCM collés. Il accepte les réponses
  // multiples et la mention « aucune des propositions ». Les contrôles propres
  // au quiz interactif ne doivent jamais retirer une question du document PDF.
  const parsed = parsePastedQcmText(body?.text, metadata, { forBook:true });
  return { metadata, ...parsed, existingCount:0 };
}

function normalizePastedQcmBookSource(input = {}){
  const rawMetadata = input?.metadata && typeof input.metadata === 'object' ? input.metadata : input;
  const metadata = pastedQcmImportMetadata(rawMetadata);
  const questions = (Array.isArray(input?.questions) ? input.questions : []).map(question => ({
    category:cleanText(question?.category || metadata.category, 80),
    level:cleanText(question?.level || metadata.level, 40),
    question_text:cleanEducationalText(question?.question_text, 1200),
    option_a:cleanEducationalText(question?.option_a, 500),
    option_b:cleanEducationalText(question?.option_b, 500),
    option_c:cleanEducationalText(question?.option_c, 500),
    option_d:cleanEducationalText(question?.option_d, 500),
    correct_answer:question?.no_correct_option ? -1 : Number(question?.correct_answer),
    correct_answers:question?.no_correct_option ? [] : questionAnswerIndexes(question),
    no_correct_option:Boolean(question?.no_correct_option),
    explanation:cleanEducationalText(question?.explanation, 3000),
  }));
  return { metadata, questions };
}

function signPastedQcmBookSource(source){
  const canonical = JSON.stringify(normalizePastedQcmBookSource(source));
  return crypto.createHmac('sha256', SESSION_SECRET).update(canonical).digest('base64url');
}

function verifyPastedQcmBookSource(source, token){
  const expected = signPastedQcmBookSource(source);
  const received = String(token || '');
  if (!received || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function normalizeEditedDailyQuestions(rows, draft){
  if (!Array.isArray(rows) || !rows.length){
    throw Object.assign(new Error('Le PDF doit contenir au moins un QCM.'), { status:400 });
  }
  if (rows.length > AI_QCM_MAX_COUNT){
    throw Object.assign(new Error(`Le PDF ne peut pas dépasser ${AI_QCM_MAX_COUNT} QCM.`), { status:400 });
  }
  const dedupeIndex = createQuestionDedupeIndex();
  const normalized = [];
  for (let index = 0; index < rows.length; index++){
    let question;
    try{
      question = normalizeAiQuestion(rows[index], {
        category:draft?.category || 'Culture générale',
        level:draft?.level || 'Concours',
        is_premium:Boolean(draft?.is_premium),
        source:safePdfTitle(draft?.title || 'QCM quotidien')
      });
    }catch(err){
      throw Object.assign(new Error(`Question ${index + 1} : ${err.message || 'contenu invalide'}`), { status:400 });
    }
    const issue = aiQuestionQualityIssue(question, dedupeIndex) || publicQuestionQualityIssue(question);
    if (issue){
      throw Object.assign(new Error(`Question ${index + 1} : ${issue}`), { status:400 });
    }
    question.category = cleanText(draft?.category || question.category, 80);
    question.level = cleanText(draft?.level || question.level, 40);
    question.is_premium = Boolean(draft?.is_premium);
    question.source = safePdfTitle(draft?.title || question.source || 'QCM quotidien');
    normalized.push(question);
    addQuestionToDedupeIndex(question.question_text, dedupeIndex);
  }
  return normalized;
}

async function rebuildDailyAiDraftPdf(draft, questions, overrides = {}){
  if (!draft?.id) throw Object.assign(new Error('Brouillon PDF introuvable'), { status:404 });
  const category = cleanText(overrides.category || draft.category || 'Culture générale', 80);
  const level = cleanText(overrides.level || draft.level || 'Concours', 40);
  const isPremium = overrides.is_premium === undefined ? Boolean(draft.is_premium) : Boolean(overrides.is_premium);
  const title = safePdfTitle(overrides.title || `QCM quotidien — ${category} — ${level} — ${draft.date || todayId()}`);
  const normalizedQuestions = (Array.isArray(questions) ? questions : []).map(question => ({
    ...question,
    category,
    level,
    is_premium:isPremium,
    source:title
  }));
  const pdfBuffer = await buildQcmDraftPdf({
    title,
    date:draft.date || todayId(),
    category,
    level,
    questions:normalizedQuestions
  });
  const fileName = safeFileName(`${title}.pdf`);
  const trackCorrection = overrides.trackCorrection !== false;
  const nextRevision = trackCorrection ? Number(draft.pdf_revision || 0) + 1 : Number(draft.pdf_revision || 0);
  const objectPath = `ai-daily/files/${String(draft.date || todayId()).slice(0,4)}/${draft.id}-r${nextRevision}-${Date.now().toString(36)}-${fileName}`;
  await uploadResourceObject(objectPath, pdfBuffer, 'application/pdf');
  const now = new Date().toISOString();
  return {
    ...draft,
    title,
    category,
    level,
    count:normalizedQuestions.length,
    generation_target:normalizedQuestions.length,
    is_premium:isPremium,
    file_name:fileName,
    mime_type:'application/pdf',
    size:pdfBuffer.length,
    storage_path:objectPath,
    questions:normalizedQuestions,
    pdf_revision:nextRevision,
    corrected_at:trackCorrection ? now : (draft.corrected_at || ''),
    updated_at:now
  };
}

function dailyDraftGenerationIssue(draft){
  const questions = Array.isArray(draft?.questions) ? draft.questions : [];
  const target = Number(draft?.generation_target || questions.length || 0);
  if (draft?.status === 'generating' || (target > 0 && questions.length < target)){
    return `Préparation incomplète : ${questions.length}/${target || 50} QCM enregistrés`;
  }
  return '';
}

function dailyDraftMatchesPlan(draft, plan){
  return draft?.status !== 'deleted'
    && String(draft.date || '') === String(plan.date || '')
    && String(draft.category || '') === String(plan.category || '')
    && String(draft.level || '') === String(plan.level || '')
    && Boolean(draft.is_premium) === Boolean(plan.is_premium);
}

async function startDailyAiQcmDraft({ force=false, overrides={} } = {}){
  if (!aiProviderConfigured()) throw Object.assign(new Error('Service IA indisponible'), { status:503 });
  if (!supabaseReady()) throw Object.assign(new Error('Stockage Supabase requis pour garder les PDF IA quotidiens'), { status:503 });
  const plan = dailyAiPlan(todayId(), overrides);
  const drafts = await loadAiDailyIndex();
  const existing = drafts.find(d => dailyDraftMatchesPlan(d, plan));
  if (existing?.status === 'generating'){
    return { draft:existing, skipped:false, resumed:true, plan };
  }
  if (existing && !force){
    return { draft:existing, skipped:true, resumed:false, plan };
  }
  const title = `QCM quotidien — ${plan.category} — ${plan.level} — ${plan.date}`;
  const id = 'daily-' + plan.date.replace(/\D/g, '') + '-' + crypto.randomBytes(4).toString('hex');
  const now = new Date().toISOString();
  const draft = {
    id,
    date:plan.date,
    title,
    category:plan.category,
    level:plan.level,
    count:0,
    generation_target:plan.count,
    is_premium:plan.is_premium,
    status:'generating',
    model:'',
    verification_model:'',
    verification_version:AI_QCM_VERIFICATION_VERSION,
    file_name:'',
    mime_type:'application/pdf',
    size:0,
    storage_path:'',
    questions:[],
    pending_questions:[],
    batch_phase:'generation',
    created_at:now,
    updated_at:now
  };
  const filtered = drafts.filter(d => d.id !== existing?.id);
  filtered.unshift(draft);
  await saveAiDailyIndex(filtered.slice(0, 90));
  return { draft, skipped:false, resumed:false, plan };
}

function recoverDailyAiDraft(draftId, source = {}){
  const id = cleanText(draftId, 120);
  if (!/^daily-\d{8}-[a-z0-9]{6,16}$/i.test(id) || String(source?.id || '') !== id) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(source?.date || '')) ? String(source.date) : todayId();
  const level = normalizedLevelName(source?.level || 'Concours');
  const category = cleanText(source?.category || '', 80);
  if (!category || !categoryAllowedForLevel(category, level)) return null;
  const target = Math.min(AI_QCM_MAX_COUNT, Math.max(1, Number(source?.generationTarget || source?.generation_target || 50)));
  const questions = (Array.isArray(source?.questions) ? source.questions : []).slice(0, target);
  const now = new Date().toISOString();
  return {
    id,
    date,
    title:safePdfTitle(source?.title || `QCM quotidien — ${category} — ${level} — ${date}`),
    category,
    level,
    count:questions.length,
    generation_target:target,
    is_premium:Boolean(source?.is_premium),
    status:'generating',
    model:cleanText(source?.model || '', 160),
    verification_model:cleanText(source?.verificationModel || '', 160),
    verification_version:AI_QCM_VERIFICATION_VERSION,
    file_name:'',
    mime_type:'application/pdf',
    size:0,
    storage_path:'',
    questions,
    pending_questions:[],
    batch_phase:'generation',
    created_at:source?.created_at || now,
    updated_at:now,
    recovered_at:now
  };
}

async function generateDailyAiQcmBatch(draftId, recovery = {}){
  if (!aiProviderConfigured()) throw Object.assign(new Error('Service IA indisponible'), { status:503 });
  if (!supabaseReady()) throw Object.assign(new Error('Stockage requis pour conserver la préparation quotidienne'), { status:503 });
  const drafts = await loadAiDailyIndex();
  let idx = drafts.findIndex(d => d.id === draftId && d.status !== 'deleted');
  if (idx < 0){
    const recovered = recoverDailyAiDraft(draftId, recovery);
    if (!recovered) throw Object.assign(new Error('La préparation a été interrompue. Relance-la pour reprendre automatiquement.'), { status:409 });
    drafts.unshift(recovered);
    idx = 0;
    await saveAiDailyIndex(drafts.slice(0, 90));
  }
  let draft = drafts[idx];
  const questions = Array.isArray(draft.questions) ? draft.questions : [];
  const target = Math.min(AI_QCM_MAX_COUNT, Math.max(1, Number(draft.generation_target || 50)));
  if (draft.status !== 'generating'){
    return { draft, ready:questions.length >= target, added:0, target };
  }
  const remaining = target - questions.length;
  const pendingQuestions = Array.isArray(draft.pending_questions) ? draft.pending_questions : [];
  if (remaining <= 0){
    draft = { ...draft, status:'draft', pending_questions:[], batch_phase:'complete' };
  }else if (pendingQuestions.length){
    // Aucun second appel IA : le serveur contrôle la structure, l'unicité,
    // la source, la citation, les règles Burkina et l'empreinte de chaque QCM.
    const verificationBatch = pendingQuestions.slice(0, AI_QCM_BATCH_SIZE);
    const remainingPending = pendingQuestions.slice(verificationBatch.length);
    const accepted = [];
    const dedupeIndex = createQuestionDedupeIndex(questions.map(q => q.question_text));
    for (const pendingQuestion of verificationBatch){
      const certified = certifyGeminiSinglePassQuestion(pendingQuestion, {
        category:draft.category,
        level:draft.level,
        theme:draft.title
      });
      const question = certified.question;
      const issue = certified.issue || aiQuestionQualityIssue(question, dedupeIndex)
        || qcmVerificationIssue(question, { category:draft.category, level:draft.level, theme:draft.title, requireVerified:true });
      if (issue) continue;
      accepted.push(question);
      addQuestionToDedupeIndex(question.question_text, dedupeIndex);
      if (accepted.length >= remaining) break;
    }
    draft = {
      ...draft,
      questions:questions.concat(accepted).slice(0, target),
      pending_questions:remainingPending,
      count:Math.min(target, questions.length + accepted.length),
      verification_model:'gemini-grounded-single-pass + deterministic-v2',
      verification_version:AI_QCM_VERIFICATION_VERSION,
      batch_phase:remainingPending.length ? 'verification' : 'generation',
      updated_at:new Date().toISOString()
    };
  }else{
    // Cette requête ne fait que la génération. Le lot brut est enregistré
    // avant son contrôle afin qu'une coupure mobile ne le perde jamais.
    const generated = await generateUniqueAiQuestions({
      count:Math.min(AI_QCM_BATCH_SIZE, remaining),
      category:draft.category,
      level:draft.level,
      theme:`${draft.title}. Lot progressif ${Math.floor(questions.length / AI_QCM_BATCH_SIZE) + 1}.`,
      publicationName:draft.title,
      is_premium:Boolean(draft.is_premium),
      attemptLimit:1,
      skipVerification:true
    });
    if (!generated.questions.length){
      throw Object.assign(new Error(`Aucun nouveau QCM n’a pu être préparé. ${questions.length}/${target} sont conservés : relance pour continuer.`), { status:502 });
    }
    draft = {
      ...draft,
      pending_questions:generated.questions,
      model:generated.model || draft.model || '',
      batch_phase:'verification',
      updated_at:new Date().toISOString()
    };
  }
  const complete = draft.questions.length >= target && !(draft.pending_questions || []).length;
  if (complete){
    const pdfBuffer = await buildQcmDraftPdf({
      title:draft.title,
      date:draft.date,
      category:draft.category,
      level:draft.level,
      questions:draft.questions
    });
    const fileName = safeFileName(`${draft.title}.pdf`);
    const objectPath = `ai-daily/files/${String(draft.date || todayId()).slice(0,4)}/${draft.id}-${Date.now().toString(36)}-${fileName}`;
    await uploadResourceObject(objectPath, pdfBuffer, 'application/pdf');
    draft = {
      ...draft,
      status:'draft',
      count:draft.questions.length,
      file_name:fileName,
      mime_type:'application/pdf',
      size:pdfBuffer.length,
      storage_path:objectPath,
      updated_at:new Date().toISOString()
    };
  }
  drafts[idx] = draft;
  await saveAiDailyIndex(drafts);
  return { draft, ready:complete, added:draft.questions.length - questions.length, target };
}

async function generateDailyAiQcmDraft({ force=false, overrides={} } = {}){
  if (!aiProviderConfigured()) throw Object.assign(new Error('Service IA indisponible'), { status:503 });
  if (!supabaseReady()) throw Object.assign(new Error('Stockage Supabase requis pour garder les PDF IA quotidiens'), { status:503 });
  const plan = dailyAiPlan(todayId(), overrides);
  const drafts = await loadAiDailyIndex();
  const existing = drafts.find(d => dailyDraftMatchesPlan(d, plan));
  if (existing && !force) return { draft:existing, skipped:true, plan };
  const generated = await generateUniqueAiQuestions({
    count:plan.count,
    category:plan.category,
    level:plan.level,
    theme:plan.theme,
    is_premium:plan.is_premium
  });
  const questions = generated.questions;
  if (questions.length < plan.count){
    throw Object.assign(new Error(`Seulement ${questions.length}/${plan.count} QCM fiables et non répétitifs ont été validés. Relance la génération avec un thème plus précis.`), { status:502 });
  }
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
    model:generated.model,
    verification_model:generated.verificationModel || '',
    verification_version:AI_QCM_VERIFICATION_VERSION,
    file_name:fileName,
    mime_type:'application/pdf',
    size:pdfBuffer.length,
    storage_path:objectPath,
    questions,
    created_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  };
  const filtered = drafts.filter(d => d.id !== existing?.id);
  filtered.unshift(draft);
  await saveAiDailyIndex(filtered.slice(0, 90));
  return { draft, skipped:false, plan };
}

function cronAuthorized(req){
  const fromVercelCron = /vercel-cron/i.test(String(req.headers['user-agent'] || '')) || String(req.headers['x-vercel-cron'] || '') === '1';
  if (fromVercelCron) return true;
  const expected = AI_DAILY_CRON_SECRET;
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const querySecret = String(req.query?.secret || '').trim();
  if (expected) return auth === expected || querySecret === expected;
  return false;
}


const DEFAULT_OFFICIAL_NEWS_SOURCES = [
  { name:'Ministère de la Fonction publique — Concours', url:'https://www.fonction-publique.gov.bf/accueil/actualites' },
  { name:'Ministère de la Fonction publique — Actualités concours', url:'https://www.fonction-publique.gov.bf/informations/actualites' },
  { name:'Plateforme officielle des concours directs', url:'https://www.econcours.gov.bf/' },
  { name:'Plateforme officielle des concours professionnels', url:'https://www.econcours-pro.gov.bf/' }
];

function officialNewsSources(){
  const custom = String(OFFICIAL_NEWS_SOURCES || '').split(/[,;\r\n]+/).map(v => v.trim()).filter(Boolean).map((entry, idx) => {
    const [name, url] = entry.includes('|') ? entry.split('|').map(x => x.trim()) : [`Source officielle ${idx + 1}`, entry];
    return cleanUrl(url) ? { name:name || `Source officielle ${idx + 1}`, url:cleanUrl(url) } : null;
  }).filter(Boolean);
  const competitionOnly = custom.filter(source => /fonction-publique|e-?concours|concours/i.test(`${source.name} ${source.url}`));
  return competitionOnly.length ? competitionOnly : DEFAULT_OFFICIAL_NEWS_SOURCES;
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
  const decoded = decodeHtmlEntities(decodeHtmlEntities(String(value || '')));
  return decoded
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/(?:^|\s)[\w:-]+\s*=\s*["'][^"']*["']/g, ' ')
    .replace(/(?:^|\s)-?mask["']?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function absoluteSourceUrl(href, base){
  try{ return new URL(String(href || '').trim(), base).toString(); }catch{ return ''; }
}

function normalizeOfficialCompetitionText(value){
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isDirectProfessionalCompetitionNews(subject, officialContext = ''){
  const value = normalizeOfficialCompetitionText(subject);
  const context = normalizeOfficialCompetitionText(officialContext);
  const directOrProfessional = /\bconcours\s+(?:directs?|professionnels?)\b|\b(?:directs?|professionnels?)\s+concours\b/.test(value);
  const eConcoursSource = /\be-?concours(?:-pro)?\b|econcours(?:-pro)?\.gov\.bf/.test(`${value} ${context}`);
  const publicServiceSource = /fonction[ -]publique|fonction-publique\.gov\.bf/.test(`${value} ${context}`);
  const namedCompetition = /\bconcours\b|\be-?concours\b/.test(value);
  const competitionNotice = /admissibilite|admission|candidat|inscription|epreuve|resultat|calendrier/.test(value);
  const explicitlyScoped = directOrProfessional || eConcoursSource || (namedCompetition && publicServiceSource);
  if (!explicitlyScoped || (!namedCompetition && !(eConcoursSource && competitionNotice))) return false;
  const unrelated = /enseignement superieur|universit|conference|colloque|seminaire|atelier|festival|sport|culture|appel d['’ ]offres|marche public|bourse d['’ ]etudes|premier ministre|conseil des ministres|audience|cooperation/.test(value);
  return !unrelated || directOrProfessional;
}

function officialNewsKeyword(subject, officialContext = ''){
  return isDirectProfessionalCompetitionNews(subject, officialContext);
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
  const candidates = [];
  const seen = new Set();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(html)) && candidates.length < 30){
    const url = absoluteSourceUrl(match[1], page.url);
    const title = stripHtml(match[2]).replace(/\s+/g, ' ').trim();
    if (!url || title.length < 8 || title.length > 260) continue;
    // Le titre du lien doit lui-même décrire un concours. Le texte voisin ne
    // sert qu'à récupérer une date; il ne peut jamais rendre un lien pertinent.
    if (!officialNewsKeyword(title, `${page.name} ${page.url} ${url}`)) continue;
    const contextStart = Math.max(0, match.index - 500);
    const contextEnd = Math.min(html.length, anchorRe.lastIndex + 500);
    const context = stripHtml(html.slice(contextStart, contextEnd)).replace(/\s+/g, ' ').trim();
    const snippet = cleanText(context || title, 900);
    const item = { title, url, sourceName:page.name, snippet };
    if (!isCurrentOfficialCandidate(item, now)) continue;
    const key = title.toLowerCase() + '|' + url;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(item);
  }
  return candidates.map(item => ({ ...item, snippet:String(item.snippet || item.title).slice(0, 900) }));
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

function cleanOfficialNewsText(value, max){
  return cleanText(stripHtml(value)
    .replace(/(?:^|\s)-?mask["']?>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim(), max);
}

function normalizeOfficialNewsDraft(item, fallback = {}){
  return {
    title:cleanOfficialNewsText(item?.title || fallback.title, 180),
    type:cleanOfficialNewsText(item?.type || fallback.type || 'Communiqué', 60),
    organization:cleanOfficialNewsText(item?.organization || fallback.organization || fallback.sourceName || 'Source officielle', 120),
    deadline:cleanText(item?.deadline || '', 40),
    status:cleanOfficialNewsText(item?.status || fallback.status || 'Info', 40),
    summary:cleanOfficialNewsText(item?.summary || fallback.summary || fallback.snippet || '', 500),
    content:cleanOfficialNewsText(item?.content || fallback.content || fallback.snippet || fallback.title || '', 6000),
    sourceUrl:cleanUrl(item?.sourceUrl || item?.source_url || fallback.sourceUrl || fallback.url),
    sourceName:cleanOfficialNewsText(item?.sourceName || fallback.sourceName || fallback.organization || 'Source officielle', 120)
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
  if (aiProviderConfigured()){
    try{
      const prompt = `Tu assures une veille strictement limitée aux concours directs et aux concours professionnels de la fonction publique du Burkina Faso. Date du jour: ${todayIso}. À partir de cette liste officielle, retourne au maximum ${limit} informations À JOUR UNIQUEMENT. Interdiction absolue: aucune actualité générale, politique, universitaire, culturelle, conférence, marché public, recrutement hors concours ou communiqué sans lien explicite avec un concours direct/professionnel. S'il n'existe aucune information conforme, retourne {"items":[]}. Ne propose aucun communiqué de 2025, 2024 ou antérieur; aucune échéance clôturée avant ${todayIso}; privilégie la session ${currentYear}, les ouvertures, calendriers, listes de candidats, admissibilités et résultats. N'invente rien. Nettoie tout HTML des résumés. Si une date limite n'est pas claire, laisse deadline vide et mets status "Info". Réponds uniquement en JSON valide: {"items":[{"title":"...","type":"Concours|Communiqué|Résultat|Calendrier","organization":"...","deadline":"YYYY-MM-DD ou vide","status":"Ouvert|Bientôt|Info|Clôturé","summary":"...","content":"...","sourceUrl":"...","sourceName":"..."}]}\n\nSources déjà filtrées:\n${JSON.stringify(unique.slice(0, 30), null, 2)}`;
      const ai = await callAiGenerate(prompt);
      const parsed = extractJsonFromAi(ai.text);
      const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : []);
      items = rows
        .map(row => normalizeOfficialNewsDraft(row))
        .filter(item => item.title && item.summary && item.sourceUrl)
        .filter(item => isDirectProfessionalCompetitionNews(`${item.title} ${item.summary}`, `${item.sourceUrl} ${item.sourceName}`))
        .filter(item => isCurrentOfficialCandidate({ title:item.title, url:item.sourceUrl, snippet:`${item.summary} ${item.content} ${item.deadline}` }, now))
        .slice(0, limit);
    }catch(err){
      console.warn('Veille IA actualités fallback:', err.message);
    }
  }
  if (!items.length){
    items = fallbackOfficialDrafts(unique, limit)
      .map(item => normalizeOfficialNewsDraft(item))
      .filter(item => isDirectProfessionalCompetitionNews(item.title, `${item.sourceUrl} ${item.sourceName}`))
      .filter(item => isCurrentOfficialCandidate({ title:item.title, url:item.sourceUrl, snippet:`${item.summary} ${item.content} ${item.deadline}` }, now));
  }
  return { candidates:unique, items:items.slice(0, limit), today:todayIso, currentYear };
}

function isLikelyPdfUrl(url){
  return /\.pdf(?:[?#].*)?$/i.test(String(url || ''));
}

function officialPdfFileName(url, title = 'communique'){
  let base = '';
  try{
    const pathname = new URL(url).pathname.split('/').pop() || '';
    base = decodeURIComponent(pathname);
  }catch{}
  if (!/\.pdf$/i.test(base)) base = `${safeFileName(title || 'communique')}.pdf`;
  return safeFileName(base || 'communique.pdf');
}

async function fetchOfficialUrl(url, { timeoutMs = 15000, accept = '*/*' } = {}){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try{
    return await fetch(url, {
      signal:controller.signal,
      headers:{
        'User-Agent':'ReussiteConcoursBF/1.0 (+veille officielle Burkina Faso)',
        'Accept':accept
      }
    });
  }finally{
    clearTimeout(timer);
  }
}

function findOfficialPdfUrlInHtml(html, baseUrl, title = ''){
  const rows = [];
  const titleKey = normalizeQuestionKey(title);
  const titleTokens = questionTokenSet(title);
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorRe.exec(String(html || '')))){
    const url = absoluteSourceUrl(match[1], baseUrl);
    if (!url || !isLikelyPdfUrl(url)) continue;
    const label = stripHtml(match[2]).replace(/\s+/g, ' ').trim();
    const context = stripHtml(String(html || '').slice(Math.max(0, match.index - 500), Math.min(String(html || '').length, anchorRe.lastIndex + 500)));
    const haystack = `${label} ${context} ${url}`;
    let score = 1;
    if (/communiqu|concours|recrut|inscription|resultat|résultat|admissibil|calendrier/i.test(haystack)) score += 4;
    if (/pdf|télécharger|telecharger|ci[- ]?joint|arrêté|arrete/i.test(haystack)) score += 2;
    if (titleKey && tokenSimilarity(titleTokens, questionTokenSet(haystack)) > 0.2) score += 3;
    rows.push({ url, score });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows[0]?.url || '';
}

async function resolveOfficialPdfUrl(item){
  const direct = cleanUrl(item?.sourcePdfUrl || item?.pdfUrl || '');
  if (direct && isLikelyPdfUrl(direct)) return direct;
  const sourceUrl = cleanUrl(item?.sourceUrl || item?.url || '');
  if (!sourceUrl) return '';
  if (isLikelyPdfUrl(sourceUrl)) return sourceUrl;
  try{
    const res = await fetchOfficialUrl(sourceUrl, { accept:'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.7' });
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (res.ok && (contentType.includes('pdf') || buffer.slice(0, 4).toString('utf8') === '%PDF')) return sourceUrl;
    if (!res.ok || !/html|text|xml/.test(contentType || 'text/html')) return '';
    const html = buffer.toString('utf8');
    return findOfficialPdfUrlInHtml(html, sourceUrl, item?.title || '');
  }catch(err){
    console.warn('Recherche PDF officiel impossible:', err.message);
    return '';
  }
}

async function downloadOfficialPdfAttachment(item){
  const pdfUrl = await resolveOfficialPdfUrl(item);
  if (!pdfUrl) return null;
  try{
    const res = await fetchOfficialUrl(pdfUrl, { timeoutMs:20000, accept:'application/pdf,*/*;q=0.7' });
    if (!res.ok) return null;
    const contentType = String(res.headers.get('content-type') || 'application/pdf').split(';')[0].trim() || 'application/pdf';
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length || buffer.length > MAX_RESOURCE_FILE_BYTES) return null;
    const looksPdf = contentType.toLowerCase().includes('pdf') || buffer.slice(0, 4).toString('utf8') === '%PDF';
    if (!looksPdf) return null;
    return {
      url:pdfUrl,
      fileName:officialPdfFileName(pdfUrl, item?.title || 'communique'),
      mimeType:'application/pdf',
      buffer
    };
  }catch(err){
    console.warn('Téléchargement PDF officiel impossible:', err.message);
    return null;
  }
}

function stagedNewsDraftPayload(item){
  const normalized = normalizeOfficialNewsDraft(item);
  return adminNewsPayload({
    title:normalized.title,
    type:normalized.type || 'Communiqué',
    organization:normalized.organization || normalized.sourceName || 'Source officielle',
    deadline:normalized.deadline || '',
    status:normalized.status || 'Info',
    summary:normalized.summary || normalized.content,
    content:normalized.content || normalized.summary,
    sourceUrl:normalized.sourceUrl,
    is_active:false
  });
}

async function stageOfficialNewsDrafts(items, authorPhone = 'system'){
  if (!supabaseReady()) throw Object.assign(new Error('Stockage Supabase requis pour préparer les communiqués officiels'), { status:503 });
  const news = await loadNewsIndex();
  const staged = [];
  const now = new Date().toISOString();
  for (const raw of (Array.isArray(items) ? items : [])){
    try{
      const normalized = normalizeOfficialNewsDraft(raw);
      if (!isDirectProfessionalCompetitionNews(`${normalized.title} ${normalized.summary}`, `${normalized.sourceUrl} ${normalized.sourceName}`)) continue;
      const payload = stagedNewsDraftPayload(normalized);
      const titleKey = normalizeQuestionKey(payload.title);
      let idx = news.findIndex(item => payload.source_url && item.source_url === payload.source_url);
      if (idx < 0) idx = news.findIndex(item => normalizeQuestionKey(item.title) === titleKey && titleKey);
      const existing = idx >= 0 ? news[idx] : null;
      const id = existing?.id || crypto.randomUUID();
      let record = {
        ...(existing || {}),
        ...payload,
        id,
        official_draft:true,
        source_name:raw.sourceName || raw.organization || existing?.source_name || 'Source officielle',
        is_active:existing ? existing.is_active !== false : false,
        author_phone:existing?.author_phone || authorPhone || 'system',
        created_at:existing?.created_at || now,
        updated_at:now
      };
      if (!record.storage_path){
        const attachment = await downloadOfficialPdfAttachment({ ...raw, sourceUrl:payload.source_url });
        if (attachment?.buffer?.length){
          const objectPath = `news/files/${new Date().getFullYear()}/${id}-${attachment.fileName}`;
          await uploadResourceObject(objectPath, attachment.buffer, attachment.mimeType || 'application/pdf');
          record = {
            ...record,
            file_name:attachment.fileName,
            mime_type:attachment.mimeType || 'application/pdf',
            size:attachment.buffer.length,
            storage_path:objectPath,
            source_pdf_url:attachment.url,
            updated_at:new Date().toISOString()
          };
        }
      }
      if (!record.storage_path){
        console.warn('Actualité officielle ignorée sans communiqué PDF:', payload.title);
        continue;
      }
      if (idx >= 0){
        news[idx] = record;
        continue;
      }
      news.unshift(record);
      staged.push({
        ...publicNews(record),
        preparedId:id,
        sourceName:record.source_name || raw.sourceName || record.organization || 'Source officielle',
        sourcePdfUrl:record.source_pdf_url || ''
      });
    }catch(err){
      console.warn('Préparation actualité officielle ignorée:', err.message);
    }
  }
  await saveNewsIndex(news);
  return staged;
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

function saspayUsesHostedCheckout(provider){
  return String(provider || '').toUpperCase() === 'MOOV_MONEY';
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

function loadQcmCorrections(){
  if (qcmCorrectionsCache) return qcmCorrectionsCache;
  try{
    const parsed = JSON.parse(fs.readFileSync(QCM_CORRECTIONS_PATH, 'utf8'));
    qcmCorrectionsCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }catch(err){
    console.error('Corrections QCM indisponibles:', err.message);
    qcmCorrectionsCache = {};
  }
  return qcmCorrectionsCache;
}

function applyQuestionCorrection(row){
  if (!row || typeof row !== 'object') return row;
  const correction = loadQcmCorrections()[String(row.id || '')];
  return correction ? { ...row, ...correction } : row;
}

let qcmCorrectionPersistencePromise = null;

function qcmCorrectionStored(row, correction){
  return Object.entries(correction || {}).every(([key, expected]) => {
    const actual = row?.[key];
    if (typeof expected === 'number') return Number(actual) === expected;
    return String(actual ?? '') === String(expected ?? '');
  });
}

async function persistQcmCorrections(){
  if (!supabaseReady()) return { updated:0, total:0, skipped:true };
  const corrections = loadQcmCorrections();
  const ids = Object.keys(corrections).filter(id => /^[0-9a-f-]{36}$/i.test(id));
  if (!ids.length) return { updated:0, total:0, skipped:true };
  const idList = ids.map(id => id.replace(/[^0-9a-f-]/gi, '')).join(',');
  const rows = await supabaseRequest(`questions?id=in.(${idList})&select=*`);
  const found = Array.isArray(rows) ? rows : [];
  const byId = new Map(found.map(row => [String(row.id), row]));
  const missing = ids.filter(id => !byId.has(id));
  if (missing.length) console.warn(`Corrections QCM : ${missing.length} identifiant(s) absent(s) de la base.`);
  const pending = found.filter(row => !qcmCorrectionStored(row, corrections[String(row.id)]));
  if (!pending.length) return { updated:0, total:found.length, missing:missing.length };
  const payload = pending.map(applyQuestionCorrection);
  const updated = await supabaseRequest('questions?on_conflict=id&select=*', {
    method:'POST',
    prefer:'resolution=merge-duplicates,return=representation',
    body:payload
  });
  const updatedRows = Array.isArray(updated) ? updated : [];
  const invalid = updatedRows.filter(row => !qcmCorrectionStored(row, corrections[String(row.id)]));
  if (updatedRows.length !== pending.length || invalid.length){
    throw new Error(`Persistance incomplète des corrections QCM (${updatedRows.length}/${pending.length}).`);
  }
  console.log(`Corrections QCM persistées : ${updatedRows.length}.`);
  return { updated:updatedRows.length, total:found.length, missing:missing.length };
}

function ensureQcmCorrectionsPersisted(){
  if (!qcmCorrectionPersistencePromise){
    qcmCorrectionPersistencePromise = persistQcmCorrections().catch(err => {
      qcmCorrectionPersistencePromise = null;
      throw err;
    });
  }
  return qcmCorrectionPersistencePromise;
}

function localQuestionSemanticKey(row){
  const answerIndex = Number(row?.correct_answer);
  const options = ['option_a','option_b','option_c','option_d'].map(key => String(row?.[key] || '').trim());
  const answer = options[answerIndex] || '';
  const value = `${row?.category || ''}|${answer}|${row?.explanation || ''}`;
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function localQuestionIsTemplate(row){
  const text = String(row?.question_text || '');
  return [
    /un document indique par erreur/i,
    /un tableau attribue/i,
    /une copie associe/i,
    /pour corriger .+réponse erronée proposée/i,
    /(?:dans .+|en préparation .+), une réponse proposée est/i,
    /dans une fiche de révision, la réponse .+ est proposée/i,
    /la réponse .+ est rejetée/i,
    /une proposition erronée indique/i
  ].some(pattern => pattern.test(text));
}

function correctedLocalQuestion(row){
  const question = String(row?.question_text || '');
  if (/quelle est la capitale du pays suivant\s*:\s*afrique du sud/i.test(question)){
    return {
      ...row,
      question_text:'Quelle est la capitale administrative de l’Afrique du Sud ?',
      explanation:'Pretoria est la capitale administrative de l’Afrique du Sud. Le Cap est la capitale législative et Bloemfontein la capitale judiciaire.'
    };
  }
  if (/^pretoria est la capitale de quel pays/i.test(question)){
    return {
      ...row,
      question_text:'Pretoria est la capitale administrative de quel pays ?',
      explanation:'Pretoria est la capitale administrative de l’Afrique du Sud, qui possède aussi une capitale législative au Cap et une capitale judiciaire à Bloemfontein.'
    };
  }
  if (/sur quel continent situe-t-on généralement (?:la )?russie/i.test(question)){
    return {
      ...row,
      question_text:'Sur quels continents s’étend la Russie ?',
      option_a:'Afrique et Asie',
      option_b:'Europe seulement',
      option_c:'Asie seulement',
      option_d:'Europe et Asie',
      correct_answer:3,
      explanation:'La Russie est un État transcontinental : son territoire s’étend en Europe orientale et en Asie septentrionale.'
    };
  }
  if (/sur quel continent situe-t-on généralement (?:la )?turquie/i.test(question)){
    return {
      ...row,
      question_text:'Sur quels continents s’étend la Turquie ?',
      option_a:'Afrique et Asie',
      option_b:'Europe seulement',
      option_c:'Europe et Asie',
      option_d:'Asie seulement',
      correct_answer:2,
      explanation:'La Turquie est un État transcontinental : une partie de son territoire se situe en Europe et la plus grande partie en Asie.'
    };
  }
  if (/quelle langue est principalement utilisée dans l’administration burkinabè/i.test(question)){
    return {
      ...row,
      question_text:'Selon l’article 35 de la Constitution burkinabè révisée en 2023, quelles sont les langues de travail ?',
      option_a:'Le français et l’anglais',
      option_b:'Le français seulement',
      option_c:'Les langues nationales seulement',
      option_d:'L’anglais seulement',
      correct_answer:0,
      explanation:'L’article 35 dispose que le français et l’anglais sont des langues de travail. Les langues nationales officialisées par la loi sont les langues officielles du Burkina Faso.'
    };
  }
  return row;
}

function curateLocalQcmBank(rows){
  const seen = new Set();
  const curated = [];
  for (const source of (Array.isArray(rows) ? rows : [])){
    const row = correctedLocalQuestion(source);
    if (localQuestionIsTemplate(row)) continue;
    const key = localQuestionSemanticKey(row);
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    curated.push(row);
  }
  return curated;
}

function loadLocalQcmBank(){
  if (localQcmBankCache) return localQcmBankCache;
  try{
    const raw = fs.readFileSync(LOCAL_QCM_BANK_PATH, 'utf8');
    const rows = JSON.parse(raw);
    localQcmBankCache = curateLocalQcmBank(rows);
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
    if (item?.raw?.saspay_id === paymentId || item?.raw?.saspay?.id === paymentId || item?.raw?.saspay_session?.transaction?.id === paymentId || item?.raw?.saspay_session_status?.transaction_id === paymentId) return item;
  }
  if (!supabaseReady()) return null;
  const rows = await supabaseRequest('payments?provider=eq.SASPAY&select=*&order=created_at.desc&limit=200');
  return Array.isArray(rows) ? rows.find(r => r?.raw?.saspay_id === paymentId || r?.raw?.saspay?.id === paymentId || r?.raw?.saspay_session?.transaction?.id === paymentId || r?.raw?.saspay_session_status?.transaction_id === paymentId) || null : null;
}

function paymentIsSuccessful(data, planOrId){
  const plan = subscriptionPlan(planOrId?.id || planOrId);
  const payload = saspayPayload(data);
  const status = String(payload?.status || '').toUpperCase();
  const amount = Number(payload?.requested_amount || payload?.amount || payload?.net_amount || 0);
  const currency = String(payload?.currency || '').toUpperCase();
  return ['SUCCESS', 'PAID'].includes(status) && amount === Number(plan.amount) && currency === 'XOF';
}

function checkoutStatusTransactionId(value){
  const payload = saspayPayload(value);
  return String(payload?.transaction_id || payload?.transaction?.id || '').trim();
}

function checkoutStatusLabel(value){
  const payload = saspayPayload(value);
  return String(payload?.transaction_status || payload?.status || 'PENDING').toUpperCase();
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
    marketingEmailOptIn: Boolean(row.marketing_email_opt_in) && !row.marketing_email_unsubscribed_at,
    avatarData: row.avatar_data || '',
    role: row.role || 'student',
    isAdmin: isAdminProfile(row),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}

app.get('/health', async (req, res) => {
  const aiCheck = String(req.query?.ai || '').toLowerCase() === 'check'
    ? await checkAiProviderConnection()
    : undefined;
  res.json({
    ok: true,
    service: 'Réussite Concours BF API',
    supabase: supabaseReady(),
    saspay: Boolean(SASPAY_API_KEY),
    saspayWebhook: Boolean(SASPAY_WEBHOOK_SECRET),
    ai: aiProviderStatus(),
    ...(aiCheck ? { aiCheck } : {}),
    build: 'qcm-pdf-mobile-fit-v25',
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
    const marketingEmailOptIn = Boolean(req.body?.marketingEmailOptIn);
    const avatarData = cleanAvatarData(req.body?.avatarData);
    if (!phone) return res.status(400).json({ message:'Numéro invalide' });
    if (firstName.length < 2 || lastName.length < 2) return res.status(400).json({ message:'Nom et prénom requis' });
    if (!email) return res.status(400).json({ message:'Adresse e-mail invalide' });
    if (pin.length < 4) return res.status(400).json({ message:'PIN invalide' });
    const existingProfile = await getProfile(phone).catch(()=>null);
    if (existingProfile) return res.status(409).json({ message:'Un compte existe déjà avec ce numéro. Connecte-toi ou utilise « PIN oublié ».' });
    const existingEmailRows = await supabaseRequest(`profiles?email=eq.${encodeURIComponent(email)}&select=id&limit=1`).catch(()=>[]);
    if (Array.isArray(existingEmailRows) && existingEmailRows.length) return res.status(409).json({ message:'Cette adresse e-mail est déjà utilisée. Connecte-toi ou utilise « PIN oublié ».' });

    const displayName = `${firstName} ${lastName}`.trim();
    const profilePayload = {
      phone,
      first_name:firstName,
      last_name:lastName,
      display_name:displayName,
      email,
      marketing_email_opt_in:marketingEmailOptIn,
      marketing_email_opt_in_at:marketingEmailOptIn ? new Date().toISOString() : null,
      marketing_email_unsubscribed_at:null,
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
      const msg = String(err?.message || err?.details?.message || err?.details?.hint || '');
      const missingMarketing = /marketing_email_|schema cache/i.test(msg);
      if (missingMarketing){
        const { marketing_email_opt_in, marketing_email_opt_in_at, marketing_email_unsubscribed_at, ...withoutMarketing } = profilePayload;
        try{
          rows = await supabaseRequest('profiles?on_conflict=phone&select=*', {
            method:'POST',
            prefer:'resolution=merge-duplicates,return=representation',
            body:[withoutMarketing]
          });
        }catch(innerErr){
          if (!isMissingEmailColumnError(innerErr)) throw innerErr;
          const { email: _email, ...fallbackPayload } = withoutMarketing;
          rows = await supabaseRequest('profiles?on_conflict=phone&select=*', {
            method:'POST',
            prefer:'resolution=merge-duplicates,return=representation',
            body:[fallbackPayload]
          });
        }
      }else{
        if (!isMissingEmailColumnError(err)) throw err;
        const { email: _email, marketing_email_opt_in, marketing_email_opt_in_at, marketing_email_unsubscribed_at, ...fallbackPayload } = profilePayload;
        rows = await supabaseRequest('profiles?on_conflict=phone&select=*', {
          method:'POST',
          prefer:'resolution=merge-duplicates,return=representation',
          body:[fallbackPayload]
        });
      }
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

app.post('/api/auth/pin-reset/request', async (req, res, next) => {
  try{
    const email = normalizeEmail(req.body?.email);
    const generic = { ok:true, message:'Si cette adresse correspond à un compte, un code de sécurité vient d’être envoyé.' };
    if (!email || !supabaseReady() || !emailNotificationsConfigured()) return res.json(generic);
    const profiles = await supabaseRequest(`profiles?email=eq.${encodeURIComponent(email)}&select=*&limit=1`).catch(()=>[]);
    const profile = Array.isArray(profiles) ? profiles[0] || null : null;
    if (!profile) return res.json(generic);
    const recentAfter = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const recent = await supabaseRequest(`pin_reset_tokens?email=eq.${encodeURIComponent(email)}&created_at=gt.${encodeURIComponent(recentAfter)}&select=id&limit=1`).catch(()=>[]);
    if (Array.isArray(recent) && recent.length) return res.json(generic);
    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = crypto.createHmac('sha256', SESSION_SECRET).update(`pin-reset:${email}:${code}`).digest('hex');
    await supabaseRequest('pin_reset_tokens', {
      method:'POST',
      prefer:'return=minimal',
      body:[{ profile_id:profile.id, email, code_hash:codeHash, expires_at:new Date(Date.now() + 15 * 60 * 1000).toISOString() }]
    });
    const name = profileDisplayName(profile, 'candidat');
    await sendEmailNotification({
      to:email,
      subject:'Code de réinitialisation de ton PIN',
      text:`Bonjour ${name},\n\nTon code de sécurité est : ${code}\nIl expire dans 15 minutes. Si tu n’as rien demandé, ignore ce message.`,
      html:brandedEmailHtml({ title:'Réinitialisation du PIN', greeting:`Bonjour ${name},`, paragraphs:['Voici ton code de sécurité :', `<div style="font-size:32px;font-weight:900;letter-spacing:7px;text-align:center;padding:18px;background:#eef8f3;border-radius:14px">${code}</div>`, 'Ce code expire dans <b>15 minutes</b>. Si tu n’as rien demandé, ignore ce message.'] })
    });
    res.json(generic);
  }catch(err){
    console.warn('Demande de réinitialisation PIN:', err.message);
    if (!res.headersSent) res.json({ ok:true, message:'Si cette adresse correspond à un compte, un code de sécurité vient d’être envoyé.' });
  }
});

app.post('/api/auth/pin-reset/confirm', async (req, res, next) => {
  try{
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || '').replace(/\D/g, '').slice(0, 6);
    const pin = String(req.body?.pin || '').replace(/\D/g, '').slice(0, 6);
    if (!email || code.length !== 6 || pin.length < 4) return res.status(400).json({ message:'Code ou nouveau PIN invalide.' });
    const now = new Date().toISOString();
    const rows = await supabaseRequest(`pin_reset_tokens?email=eq.${encodeURIComponent(email)}&used_at=is.null&expires_at=gt.${encodeURIComponent(now)}&select=*&order=created_at.desc&limit=1`).catch(()=>[]);
    const reset = Array.isArray(rows) ? rows[0] || null : null;
    if (!reset || Number(reset.attempts || 0) >= 5) return res.status(400).json({ message:'Code expiré ou invalide. Demande un nouveau code.' });
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`pin-reset:${email}:${code}`).digest('hex');
    const valid = expected.length === String(reset.code_hash || '').length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(reset.code_hash || '')));
    if (!valid){
      await supabaseRequest(`pin_reset_tokens?id=eq.${encodeURIComponent(reset.id)}`, { method:'PATCH', prefer:'return=minimal', body:{ attempts:Number(reset.attempts || 0) + 1 } }).catch(()=>{});
      return res.status(400).json({ message:'Code expiré ou invalide. Demande un nouveau code.' });
    }
    const profiles = await supabaseRequest(`profiles?id=eq.${encodeURIComponent(reset.profile_id)}&select=*&limit=1`);
    const profile = Array.isArray(profiles) ? profiles[0] || null : null;
    if (!profile) return res.status(404).json({ message:'Compte introuvable.' });
    await supabaseRequest(`profiles?id=eq.${encodeURIComponent(profile.id)}`, { method:'PATCH', prefer:'return=minimal', body:{ pin_hash:hashPin(pin) } });
    await supabaseRequest(`pin_reset_tokens?id=eq.${encodeURIComponent(reset.id)}`, { method:'PATCH', prefer:'return=minimal', body:{ used_at:now, attempts:Number(reset.attempts || 0) + 1 } });
    await supabaseRequest(`sessions?profile_id=eq.${encodeURIComponent(profile.id)}&revoked_at=is.null`, { method:'PATCH', prefer:'return=minimal', body:{ revoked_at:now } }).catch(()=>{});
    await notifyPinChanged(profile).catch(err => console.warn('Confirmation PIN:', err.message));
    res.json({ ok:true, message:'Ton PIN a été modifié. Tu peux maintenant te connecter.' });
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
    await notifyLoginSuccess(freshProfile, req).catch(err => console.warn('Alerte connexion:', err.message));
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

app.patch('/api/profile/email-preferences', requireSession, async (req, res, next) => {
  try{
    const optIn = Boolean(req.body?.marketingEmailOptIn);
    const now = new Date().toISOString();
    const rows = await supabaseRequest(`profiles?phone=eq.${encodeURIComponent(req.phone)}&select=*`, {
      method:'PATCH',
      prefer:'return=representation',
      body:{
        marketing_email_opt_in:optIn,
        marketing_email_opt_in_at:optIn ? now : null,
        marketing_email_unsubscribed_at:optIn ? null : now
      }
    });
    const profile = Array.isArray(rows) ? rows[0] || null : null;
    res.json({ ok:true, user:safeProfile(profile || req.profile) });
  }catch(err){ next(err); }
});

app.get('/api/email/unsubscribe', async (req, res) => {
  const email = normalizeEmail(req.query?.email);
  const token = String(req.query?.token || '');
  const expected = email ? marketingUnsubscribeToken(email) : '';
  const valid = Boolean(email && token && token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)));
  if (valid && supabaseReady()){
    await supabaseRequest(`profiles?email=eq.${encodeURIComponent(email)}`, {
      method:'PATCH',
      prefer:'return=minimal',
      body:{ marketing_email_opt_in:false, marketing_email_unsubscribed_at:new Date().toISOString() }
    }).catch(()=>{});
  }
  res.status(valid ? 200 : 400).type('html').send(`<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial;background:#f3f7f5;padding:30px"><main style="max-width:560px;margin:auto;background:white;padding:28px;border-radius:18px"><h1>${valid ? 'Désabonnement confirmé' : 'Lien invalide'}</h1><p>${valid ? 'Tu ne recevras plus les offres et nouveautés par e-mail. Les messages indispensables liés à ton compte et à tes paiements restent actifs.' : 'Ce lien de désabonnement est invalide ou incomplet.'}</p><p><a href="${htmlEscape(absoluteAppUrl('/'))}">Retour à Réussite Concours BF</a></p></main></body></html>`);
});

app.post('/api/email/unsubscribe', async (req, res) => {
  const email = normalizeEmail(req.query?.email);
  const token = String(req.query?.token || '');
  const expected = email ? marketingUnsubscribeToken(email) : '';
  const valid = Boolean(email && token && token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)));
  if (!valid) return res.status(400).json({ ok:false });
  await supabaseRequest(`profiles?email=eq.${encodeURIComponent(email)}`, {
    method:'PATCH',
    prefer:'return=minimal',
    body:{ marketing_email_opt_in:false, marketing_email_unsubscribed_at:new Date().toISOString() }
  }).catch(()=>{});
  res.json({ ok:true });
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
    const accountPhone = req.phone;
    const selectedProvider = String(provider || 'ORANGE_MONEY').toUpperCase();
    const paymentPhoneCheck = validatePaymentPhoneForProvider(customer?.phone, selectedProvider);
    const paymentPhone = paymentPhoneCheck.phone;
    const network = saspayNetwork(selectedProvider);
    const plan = subscriptionPlan(planId);

    if (Number(amount) !== Number(plan.amount)) return res.status(400).json({ message:'Montant invalide' });
    if ((currency || SASPAY_CURRENCY) !== 'XOF') return res.status(400).json({ message:'Devise invalide' });
    if (!accountPhone) return res.status(400).json({ message:'Compte candidat invalide' });

    const tx = String(transactionId || `RCBF-${Date.now()}`);
    const profile = req.profile || await getProfile(accountPhone);
    const customerEmail = normalizeEmail(customer?.email || profile?.email) || customerEmailForPhone(accountPhone);
    const paymentContext = {
      local_tx_ref:tx,
      account_phone:accountPhone,
      payment_phone:paymentPhone,
      selected_provider:selectedProvider,
      detected_operator:paymentPhoneCheck.operator,
      network,
      customer_email:customerEmail,
      plan:plan.id
    };
    await createPaymentRecord({ tx, phone:accountPhone, provider:'SASPAY', status:'INITIATED', plan:plan.id, amount:plan.amount, raw:paymentContext });

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
        phone: publicPhone(paymentPhone)
      },
      network,
      metadata: { tx_ref: tx, account_phone:accountPhone, payment_phone:paymentPhone, plan: plan.id, provider: selectedProvider }
    };

    const createHostedCheckout = async (reason='hosted_checkout') => {
      const sessionPayload = {
        amount: `${plan.amount}.00`,
        currency: 'XOF',
        description: paymentDescription(plan),
        country: SASPAY_COUNTRY,
        customer_email: customerEmail,
        customer_name: `${firstName} ${lastName}`.trim(),
        customer_phone: publicPhone(paymentPhone),
        return_url: returnTo,
        metadata: { tx_ref: tx, account_phone:accountPhone, payment_phone:paymentPhone, plan: plan.id, provider: selectedProvider, checkout_reason:reason }
      };
      const sessionResponse = await saspayRequest('/checkout-sessions/', { method:'POST', body:sessionPayload });
      const session = saspayPayload(sessionResponse);
      const paymentUrl = saspayCheckoutUrl(sessionResponse);
      const raw = {
        ...paymentContext,
        amount:plan.amount,
        saspay_session_id:saspayId(sessionResponse),
        saspay_session:session,
        saspay_session_response:sessionResponse,
        checkout_reason:reason
      };
      await updatePaymentRecord(tx, { status:saspayStatus(sessionResponse), raw });
      if (!paymentUrl){
        return { error:true, status:502, body:{ message:'La page de paiement n’a pas pu être ouverte. Réessaie dans quelques instants.', mode:'checkout', transactionId:tx, sessionId:saspayId(sessionResponse) || null } };
      }
      return {
        error:false,
        body:{
          ok:true,
          mode:'checkout',
          transactionId:tx,
          sessionId:saspayId(sessionResponse) || null,
          status:saspayStatus(sessionResponse),
          paymentUrl,
          message:'Redirection vers la page SasPay pour finaliser le paiement.'
        }
      };
    };

    // Moov/Telmob passe par la page SasPay : le client voit immédiatement
    // l’étape de paiement au lieu d’attendre un push opérateur parfois invisible.
    if (saspayUsesHostedCheckout(selectedProvider)){
      const checkout = await createHostedCheckout('moov_hosted_redirect');
      return checkout.error ? res.status(checkout.status).json(checkout.body) : res.json(checkout.body);
    }

    try{
      const data = await saspayRequest('/payments/softpay/', { method:'POST', body:payload, idempotencyKey:tx });
      const paymentUrl = saspayCheckoutUrl(data);
      const raw = paymentRawWithSasPay({ ...paymentContext, amount:plan.amount }, data);
      await updatePaymentRecord(tx, { status:saspayStatus(data), raw });
      return res.json({
        ok:true,
        mode:paymentUrl ? 'checkout' : 'softpay',
        transactionId: tx,
        paymentId: saspayId(data) || null,
        status: saspayStatus(data),
        paymentUrl,
        message: paymentUrl ? 'Redirection vers la page de paiement.' : `Demande ${paymentProviderLabel(selectedProvider)} envoyée. Valide-la sur le téléphone à débiter.`
      });
    }catch(err){
      // Si le push direct échoue côté opérateur ou format, on bascule sur la page SasPay.
      if (err.status !== 422) throw err;
      const checkout = await createHostedCheckout('softpay_unavailable');
      return checkout.error ? res.status(checkout.status).json(checkout.body) : res.json(checkout.body);
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
      let sessionStatusResponse;
      try{
        sessionStatusResponse = await saspayRequest(`/checkout-sessions/${encodeURIComponent(sessionId)}/status/`);
      }catch(err){
        if (err.status !== 404) throw err;
        sessionStatusResponse = await saspayRequest(`/checkout-sessions/${encodeURIComponent(sessionId)}/`);
      }
      const sessionStatus = saspayPayload(sessionStatusResponse);
      const transactionId = checkoutStatusTransactionId(sessionStatus);
      let raw = {
        ...(record.raw || {}),
        saspay_session_id:sessionId,
        saspay_session_status:sessionStatus,
        saspay_session_status_response:sessionStatusResponse
      };

      // Une session PAID n’est jamais suffisante seule : on vérifie la transaction
      // associée pour contrôler réellement le montant, la devise et le statut.
      if (transactionId){
        const verified = await saspayRequest(`/payments/${encodeURIComponent(transactionId)}/verify/`);
        raw = paymentRawWithSasPay(raw, verified);
        if (paymentIsSuccessful(verified, plan)){
          await updatePaymentRecord(tx, { status:'ACCEPTED', raw, verified_at:new Date().toISOString() });
          const sub = await activateSubscription({ phone:req.phone, txRef:tx, provider:'SASPAY', email:record?.raw?.customer_email || req.profile?.email, plan:plan.id, days:plan.days });
          return res.json({ ok:true, active:true, status:'premium', expiresAt:sub.expiresAt, txRef:tx, provider:'SASPAY', plan:plan.id });
        }
        const verifiedStatus = saspayStatus(verified);
        await updatePaymentRecord(tx, { status:verifiedStatus, raw, verified_at:new Date().toISOString() });
        return res.json({ ok:true, active:false, paymentStatus:verifiedStatus, message:'Paiement en cours de confirmation par le réseau.' });
      }

      const pendingStatus = checkoutStatusLabel(sessionStatus);
      await updatePaymentRecord(tx, { status:pendingStatus, raw, verified_at:new Date().toISOString() });
      return res.json({ ok:true, active:false, paymentStatus:pendingStatus, message:'Paiement en cours de confirmation par le réseau.' });
    }

    return res.status(400).json({ message:'Identifiant SasPay manquant' });
  }catch(err){ next(err); }
});

app.post('/api/payments/saspay/webhook', async (req, res, next) => {
  try{
    if (!saspaySignatureValid(req)) return res.status(401).send('invalid signature');
    const event = req.body?.event || req.get('X-Webhook-Event');
    const data = req.body?.data || {};
    const paymentId = String(data?.id || data?.transaction_id || '').trim();
    if (!paymentId) return res.status(400).send('payment id missing');
    const localTx = String(data?.metadata?.tx_ref || data?.transaction?.metadata?.tx_ref || '').trim();
    const record = localTx ? await getPaymentRecord(localTx) : await findPaymentBySasPayId(paymentId);
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
  res.json({
    ok:true,
    ...aiProviderStatus(),
    grounding:AI_QCM_GROUNDING_ENABLED,
    verificationRequired:AI_QCM_REQUIRE_VERIFICATION,
    verificationVersion:AI_QCM_VERIFICATION_VERSION,
    batchSize:AI_QCM_BATCH_SIZE,
    minimumScore:AI_QCM_MIN_VERIFICATION_SCORE
  });
});

app.get('/api/admin/ai/daily', requireAdmin, async (_req, res, next) => {
  try{
    const drafts = await loadAiDailyIndex().catch(err => {
      if (err.status === 503) return [];
      throw err;
    });
    const orphanDrafts = await loadOrphanDailyResourceDrafts(drafts);
    const orphanQuestionDrafts = await loadPublishedDailyQuestionDrafts([...drafts, ...orphanDrafts]);
    const allDrafts = [...drafts, ...orphanDrafts, ...orphanQuestionDrafts]
      .filter(d => d.status !== 'deleted')
      .sort((a, b) => String(b.updated_at || b.published_at || b.created_at || '').localeCompare(String(a.updated_at || a.published_at || a.created_at || '')));
    res.json({
      ok:true,
      configured:Boolean(aiProviderConfigured() && supabaseReady()),
      settings:{
        count:AI_DAILY_QCM_COUNT,
        mode:AI_DAILY_GROUP_MODE,
        categories:AI_DAILY_CATEGORIES,
        levels:AI_DAILY_LEVELS,
        levelCategories:levelCategoryMapForClient(),
        is_premium:AI_DAILY_IS_PREMIUM,
        quality:{
          grounding:AI_QCM_GROUNDING_ENABLED,
          verificationRequired:AI_QCM_REQUIRE_VERIFICATION,
          minimumScore:AI_QCM_MIN_VERIFICATION_SCORE,
          batchSize:AI_QCM_BATCH_SIZE,
          version:AI_QCM_VERIFICATION_VERSION
        },
        cron:'/api/cron/ai-daily-qcm'
      },
      drafts:allDrafts.map(publicAiDailyDraft)
    });
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/daily/run', requireAdmin, async (req, res, next) => {
  try{
    const category = cleanText(req.body?.category, 80);
    const level = normalizedLevelName(req.body?.level);
    if (!AI_DAILY_DEFAULT_CATEGORIES.includes(category)) return res.status(400).json({ message:'Choisis la catégorie exacte avant de créer le PDF.' });
    if (!AI_LEVEL_CATEGORY_RULES[level]) return res.status(400).json({ message:'Choisis le niveau avant de créer le PDF.' });
    if (!categoryAllowedForLevel(category, level)) return res.status(400).json({ message:`La catégorie « ${category} » n’est pas compatible avec le niveau ${level}. Choisis une autre catégorie ou un autre niveau.` });
    const overrides = {
      count:req.body?.count,
      category,
      level,
      mode:req.body?.mode,
      theme:req.body?.theme,
      is_premium:req.body?.is_premium
    };
    const result = await startDailyAiQcmDraft({ force:Boolean(req.body?.force), overrides });
    res.json({ ok:true, skipped:result.skipped, resumed:result.resumed, plan:result.plan, draft:publicAiDailyDraft(result.draft) });
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/daily/:id/generate-batch', requireAdmin, async (req, res, next) => {
  try{
    const result = await generateDailyAiQcmBatch(req.params.id, req.body?.draft || {});
    res.json({
      ok:true,
      ready:result.ready,
      added:result.added,
      target:result.target,
      progress:Number(result.draft?.questions?.length || 0),
      draft:publicAiDailyDraft(result.draft)
    });
  }catch(err){ next(err); }
});

app.get('/api/admin/ai/daily/:id/pdf', requireAdmin, async (req, res, next) => {
  try{
    const drafts = await loadAiDailyIndex();
    let draft = drafts.find(d => d.id === req.params.id && d.status !== 'deleted');
    if (!draft?.storage_path){
      const resources = await loadResourceIndex().catch(() => []);
      const resource = (Array.isArray(resources) ? resources : []).find(r => r.id === req.params.id || r.source_draft_id === req.params.id);
      if (resource?.storage_path) draft = { storage_path:resource.storage_path, file_name:resource.file_name, mime_type:resource.mime_type };
    }
    if (!draft?.storage_path){
      const questionDraft = await loadPublishedDailyQuestionDraftById(req.params.id);
      if (questionDraft?.questions?.length){
        const pdf = await buildQcmDraftPdf({ title:questionDraft.title, date:questionDraft.date, category:questionDraft.category, level:questionDraft.level, questions:questionDraft.questions });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Cache-Control', 'private, no-store');
        const disposition = req.query?.inline ? 'inline' : 'attachment';
        res.setHeader('Content-Disposition', `${disposition}; filename="qcm-quotidien.pdf"`);
        return res.send(pdf);
      }
      return res.status(404).json({ message:'PDF IA introuvable' });
    }
    const file = await downloadResourceObject(draft.storage_path);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    const disposition = req.query?.inline ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${safeFileName(draft.file_name || 'qcm-quotidien.pdf')}"`);
    res.send(file.buffer);
  }catch(err){ next(err); }
});

app.put('/api/admin/ai/daily/:id/questions', requireAdmin, async (req, res, next) => {
  try{
    const drafts = await loadAiDailyIndex();
    const idx = drafts.findIndex(d => d.id === req.params.id && d.status !== 'deleted');
    if (idx < 0) return res.status(404).json({ message:'Brouillon PDF introuvable' });
    const draft = drafts[idx];
    if (draft.status === 'published'){
      return res.status(409).json({ message:'Retire d’abord ce PDF du côté candidat avant de le corriger.' });
    }
    const questions = normalizeEditedDailyQuestions(req.body?.questions, draft);
    const previousStoragePath = draft.storage_path || '';
    const updated = await rebuildDailyAiDraftPdf(draft, questions);
    drafts[idx] = updated;
    await saveAiDailyIndex(drafts);
    if (previousStoragePath && previousStoragePath !== updated.storage_path){
      await deleteResourceObject(previousStoragePath).catch(()=>{});
    }
    res.json({
      ok:true,
      saved:questions.length,
      pdfRegenerated:true,
      draft:publicAiDailyDraft(updated)
    });
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/daily/:id/verify', requireAdmin, async (req, res, next) => {
  try{
    if (!aiProviderConfigured()) return res.status(503).json({ message:'Service de vérification indisponible.' });
    const drafts = await loadAiDailyIndex();
    const idx = drafts.findIndex(d => d.id === req.params.id && d.status !== 'deleted');
    if (idx < 0) return res.status(404).json({ message:'Brouillon PDF introuvable' });
    const draft = drafts[idx];
    if (draft.status === 'published') return res.status(409).json({ message:'Retire d’abord ce PDF du côté candidat avant de le vérifier à nouveau.' });
    const sourceRows = Array.isArray(req.body?.questions) ? req.body.questions : draft.questions;
    if (!Array.isArray(sourceRows) || !sourceRows.length) return res.status(400).json({ message:'Aucun QCM à vérifier.' });
    const questions = sourceRows.map((row, index) => {
      try{
        const question = normalizeAiQuestion(row, {
          category:draft.category || 'Culture générale',
          level:draft.level || 'Concours',
          is_premium:Boolean(draft.is_premium),
          source:safePdfTitle(draft.title || 'QCM quotidien')
        });
        question.category = cleanText(draft.category || question.category, 80);
        question.level = cleanText(draft.level || question.level, 40);
        question.is_premium = Boolean(draft.is_premium);
        question.source = safePdfTitle(draft.title || question.source || 'QCM quotidien');
        return question;
      }catch(err){
        throw Object.assign(new Error(`Question ${index + 1} : ${err.message || 'contenu invalide'}`), { status:400 });
      }
    });
    const checked = await verifyExistingQuestionSet(questions, {
      category:draft.category || 'Culture générale',
      level:draft.level || 'Concours',
      theme:draft.title || draft.category || 'QCM quotidien'
    });
    drafts[idx] = {
      ...draft,
      questions:checked.questions,
      verification_model:checked.model || draft.verification_model || '',
      verification_version:AI_QCM_VERIFICATION_VERSION,
      updated_at:new Date().toISOString()
    };
    await saveAiDailyIndex(drafts);
    res.json({ ok:true, verification:checked.verification, draft:publicAiDailyDraft(drafts[idx]) });
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/daily/:id/replace-question', requireAdmin, async (req, res, next) => {
  try{
    if (!aiProviderConfigured()) return res.status(503).json({ message:'Service IA indisponible pour remplacer cette question.' });
    const drafts = await loadAiDailyIndex();
    const idx = drafts.findIndex(d => d.id === req.params.id && d.status !== 'deleted');
    if (idx < 0) return res.status(404).json({ message:'Brouillon PDF introuvable' });
    const draft = drafts[idx];
    if (draft.status === 'published'){
      return res.status(409).json({ message:'Retire d’abord ce PDF du côté candidat avant de le corriger.' });
    }
    const sourceRows = Array.isArray(req.body?.questions) ? req.body.questions : draft.questions;
    const questionIndex = Number(req.body?.index);
    if (!Array.isArray(sourceRows) || !Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= sourceRows.length){
      return res.status(400).json({ message:'Question à remplacer invalide.' });
    }
    const originalText = strictCleanAiQcmText(sourceRows[questionIndex]?.question_text || '', 320);
    const otherQuestionTexts = sourceRows
      .filter((_question, index) => index !== questionIndex)
      .map(question => question?.question_text)
      .filter(Boolean);
    const draftDedupeIndex = createQuestionDedupeIndex(otherQuestionTexts);
    let replacement = null;
    let model = '';
    let verificationModel = '';
    let lastIssue = '';
    for (let attempt = 0; attempt < 3 && !replacement; attempt++){
      const generated = await generateUniqueAiQuestions({
        count:1,
        category:draft.category || 'Culture générale',
        level:draft.level || 'Concours',
        theme:`Remplace entièrement cette question jugée incorrecte : « ${originalText} ». Crée une autre question fiable du même module, avec un raisonnement différent et une réponse vérifiée. Tentative ${attempt + 1}.`,
        publicationName:draft.title || 'QCM quotidien',
        is_premium:Boolean(draft.is_premium)
      });
      model = generated.model || model;
      verificationModel = generated.verificationModel || verificationModel;
      const candidate = generated.questions?.[0] || null;
      const issue = candidate ? (aiQuestionQualityIssue(candidate, draftDedupeIndex) || publicQuestionQualityIssue(candidate)) : 'Aucune question générée';
      if (!issue) replacement = candidate;
      else lastIssue = issue;
    }
    if (!replacement){
      return res.status(502).json({ message:`Impossible de préparer une question de remplacement fiable${lastIssue ? ` : ${lastIssue}` : ''}. Réessaie.` });
    }
    const nextRows = sourceRows.slice();
    nextRows[questionIndex] = replacement;
    const questions = normalizeEditedDailyQuestions(nextRows, draft);
    const previousStoragePath = draft.storage_path || '';
    const updated = await rebuildDailyAiDraftPdf(draft, questions);
    drafts[idx] = { ...updated, model:model || updated.model, verification_model:verificationModel || updated.verification_model || '' };
    await saveAiDailyIndex(drafts);
    if (previousStoragePath && previousStoragePath !== updated.storage_path){
      await deleteResourceObject(previousStoragePath).catch(()=>{});
    }
    res.json({
      ok:true,
      replaced:questionIndex,
      pdfRegenerated:true,
      draft:publicAiDailyDraft(drafts[idx])
    });
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/daily/:id/publish', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const drafts = await loadAiDailyIndex();
    const idx = drafts.findIndex(d => d.id === req.params.id && d.status !== 'deleted');
    if (idx < 0) return res.status(404).json({ message:'Brouillon IA introuvable' });
    let draft = drafts[idx];
    let questions = Array.isArray(draft.questions) ? draft.questions : [];
    const generationIssue = dailyDraftGenerationIssue(draft);
    if (generationIssue){
      return res.status(409).json({ message:`${generationIssue}. Reprends la génération avant de publier.` });
    }
    if (!questions.length) return res.status(400).json({ message:'Aucun QCM à publier dans ce brouillon' });
    const publishLevel = cleanText(req.body?.level || draft.level || '', 40) || draft.level;
    const requestedPublishCategory = cleanText(req.body?.category || draft.category || '', 80) || draft.category;
    if (!AI_DAILY_DEFAULT_CATEGORIES.includes(requestedPublishCategory)) return res.status(400).json({ message:'Choisis la catégorie exacte avant de publier.' });
    if (!categoryAllowedForLevel(requestedPublishCategory, publishLevel)) return res.status(400).json({ message:`La catégorie « ${requestedPublishCategory} » n’est pas compatible avec le niveau ${publishLevel}. Choisis une autre catégorie ou un autre niveau.` });
    const publishCategory = requestedPublishCategory;
    const publishPremium = req.body?.is_premium === undefined ? Boolean(draft.is_premium) : Boolean(req.body?.is_premium);
    if (draft.status !== 'published'){
      const previousStoragePath = draft.storage_path || '';
      const publishDraft = { ...draft, category:publishCategory, level:publishLevel, is_premium:publishPremium };
      questions = normalizeEditedDailyQuestions(questions, publishDraft);
      const verification = qcmVerificationSummary(questions, {
        category:publishCategory,
        level:publishLevel,
        theme:draft.title,
        requireVerified:true
      });
      if (!verification.publishable){
        const first = verification.issues[0];
        return res.status(409).json({
          message:`Publication bloquée : ${verification.blocked} QCM non vérifié(s) ou modifié(s) après vérification.${first ? ` Question ${first.index + 1} : ${first.issue}.` : ''} Lance « Vérifier les sources » puis remplace les questions rejetées.`,
          verification
        });
      }
      draft = await rebuildDailyAiDraftPdf(publishDraft, questions, {
        category:publishCategory,
        level:publishLevel,
        is_premium:publishPremium,
        trackCorrection:false
      });
      drafts[idx] = draft;
      await saveAiDailyIndex(drafts);
      if (previousStoragePath && previousStoragePath !== draft.storage_path){
        await deleteResourceObject(previousStoragePath).catch(()=>{});
      }
    }
    const existingPublishedRows = await findPublishedRowsForDailyDraft(draft, { category:publishCategory, level:publishLevel, is_premium:publishPremium });
    const alreadyHasQuestions = Array.isArray(existingPublishedRows) && existingPublishedRows.length > 0;
    let publishedCount = alreadyHasQuestions ? existingPublishedRows.length : 0;
    let rows = [];
    if (!alreadyHasQuestions){
      const checked = await validateQuestionsForPublication(questions.map(q => ({ ...q, category:publishCategory || q.category, level:publishLevel || q.level })));
      if (checked.rejected.length){
        return res.status(409).json({ message:`Publication bloquée : ${checked.rejected.length} QCM déjà existant(s), trop proche(s) ou non conforme(s). Régénère un nouveau PDF strict.`, rejected:checked.rejected.slice(0, 5) });
      }
      const payload = checked.accepted.map(q => adminQuestionPayload({
        ...q,
        category:publishCategory || q.category,
        level:publishLevel || q.level,
        source:safePdfTitle(draft.title || q.source || 'QCM quotidien'),
        is_premium:publishPremium,
        is_active:true
      }));
      rows = await supabaseRequest('questions?select=*', {
        method:'POST',
        prefer:'return=representation',
        body:payload
      });
      publishedCount = Array.isArray(rows) ? rows.length : payload.length;
    }
    const resource = await ensureDailyDraftResource(draft, { category:publishCategory, level:publishLevel, is_premium:publishPremium, author_phone:req.phone });
    drafts[idx] = {
      ...draft,
      category:publishCategory,
      level:publishLevel,
      is_premium:publishPremium,
      status:'published',
      published_at:draft.published_at || new Date().toISOString(),
      updated_at:new Date().toISOString(),
      published_count:publishedCount || Number(draft.published_count || questions.length || 0),
      resource_id:resource?.id || draft.resource_id || ''
    };
    await saveAiDailyIndex(drafts);
    if (!alreadyHasQuestions){
      await queueMarketingCampaign({
        kind:'new_qcm',
        subject:`Nouveaux QCM : ${drafts[idx].title || publishCategory}`,
        text:`De nouveaux QCM corrigés sont disponibles dans ${publishCategory}${publishLevel ? ` — niveau ${publishLevel}` : ''}. Ouvre Réussite Concours BF pour commencer la révision.`,
        ctaLabel:'Découvrir les nouveaux QCM',
        ctaUrl:absoluteAppUrl('/#formations'),
        createdBy:req.phone
      });
    }
    res.json({ ok:true, published:publishedCount || Number(draft.published_count || questions.length || 0), alreadyPublished:alreadyHasQuestions, resource, draft:publicAiDailyDraft(drafts[idx]) });
  }catch(err){ next(err); }
});

app.delete('/api/admin/ai/daily/:id/public', requireAdmin, async (req, res, next) => {
  try{
    const drafts = await loadAiDailyIndex();
    const idx = drafts.findIndex(d => d.id === req.params.id && d.status !== 'deleted');
    let draft = idx >= 0 ? drafts[idx] : null;
    if (!draft){
      const resources = await loadResourceIndex().catch(() => []);
      const resource = (Array.isArray(resources) ? resources : []).find(r => r.id === req.params.id || r.source_draft_id === req.params.id);
      if (resource?.storage_path){
        const meta = parseDailyResourceTitle(resource);
        const count = Number((String(resource.description || '').match(/(\d+)\s*QCM/i) || [])[1] || 0);
        draft = {
          id:resource.source_draft_id || resource.id,
          resource_id:resource.id,
          title:resource.title,
          date:meta.date,
          category:meta.category,
          level:meta.level,
          count,
          is_premium:Boolean(resource.is_premium),
          status:'published',
          storage_path:resource.storage_path,
          file_name:resource.file_name,
          mime_type:resource.mime_type
        };
      }
    }
    if (!draft) draft = await loadPublishedDailyQuestionDraftById(req.params.id);
    if (!draft) return res.status(404).json({ message:'PDF quotidien introuvable' });
    if (draft.status !== 'published') return res.status(400).json({ message:'Ce PDF n’est pas publié côté candidat.' });
    const removedQuestions = await deletePublishedDailyQuestions(draft, { category:draft.category, level:draft.level, is_premium:draft.is_premium });
    const removedResource = await deleteDailyDraftResource(draft);
    let responseDraft = { ...draft, status:'draft', published_at:'', published_count:0, resource_id:'', updated_at:new Date().toISOString() };
    if (idx >= 0){
      drafts[idx] = responseDraft;
      await saveAiDailyIndex(drafts);
    }
    res.json({ ok:true, removedQuestions, removedResource, draft:publicAiDailyDraft(responseDraft) });
  }catch(err){ next(err); }
});

app.delete('/api/admin/ai/daily/:id', requireAdmin, async (req, res, next) => {
  try{
    const drafts = await loadAiDailyIndex();
    const idx = drafts.findIndex(d => d.id === req.params.id);
    if (idx < 0) return res.status(404).json({ message:'Brouillon IA introuvable' });
    const draft = drafts[idx];
    if (draft.status === 'published'){
      await ensureDailyDraftResource(draft, { category:draft.category, level:draft.level, is_premium:draft.is_premium, author_phone:req.phone }).catch(()=>{});
    }
    if (draft.storage_path) await deleteResourceObject(draft.storage_path);
    drafts.splice(idx, 1);
    await saveAiDailyIndex(drafts);
    const persisted = await loadAiDailyIndex();
    if (persisted.some(row => row.id === draft.id)) throw Object.assign(new Error('Le PDF existe encore après la suppression. Réessaie.'), { status:502 });
    res.json({ ok:true, deleted:true, id:draft.id });
  }catch(err){ next(err); }
});

app.get('/api/cron/ai-daily-qcm', async (req, res, next) => {
  try{
    if (!cronAuthorized(req)) return res.status(401).json({ ok:false, message:'Cron IA non autorisé' });
    const [result, expiry, campaign] = await Promise.all([
      generateDailyAiQcmDraft({ force:false }),
      processExpiryReminderEmails().catch(err => ({ error:err.message })),
      processNextEmailCampaign().catch(err => ({ error:err.message }))
    ]);
    res.json({ ok:true, skipped:result.skipped, draft:publicAiDailyDraft(result.draft), plan:result.plan, emailAutomation:{ expiry, campaign } });
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/qcm', requireAdmin, async (req, res, next) => {
  try{
    if (!aiProviderConfigured()) return res.status(503).json({ message:'Service IA indisponible pour le moment. Réessaie plus tard.' });
    const level = cleanText(req.body?.level || 'Concours', 40);
    const requestedCategory = cleanText(req.body?.category || '', 80);
    if (!AI_DAILY_DEFAULT_CATEGORIES.includes(requestedCategory)) return res.status(400).json({ message:'Choisis une catégorie avant de générer.' });
    if (!categoryAllowedForLevel(requestedCategory, level)) return res.status(400).json({ message:`La catégorie « ${requestedCategory} » n’est pas compatible avec le niveau ${level}.` });
    const category = requestedCategory;
    const theme = cleanText(req.body?.theme || req.body?.publication_name || category, 240);
    const publicationName = cleanText(req.body?.publication_name || '', 180);
    const count = Math.min(AI_QCM_MAX_COUNT, Math.max(1, Number(req.body?.count || 5)));
    const isPremiumDraft = Boolean(req.body?.is_premium);
    const generated = await generateUniqueAiQuestions({ count, category, level, theme, publicationName, is_premium:isPremiumDraft });
    const questions = generated.questions;
    if (questions.length < count) return res.status(502).json({ message:`Seulement ${questions.length}/${count} QCM fiables et non répétitifs ont été validés. Précise le thème ou relance.` });
    res.json({ ok:true, model:generated.model, verificationModel:generated.verificationModel, verification:generated.verification, existingCount:generated.existingCount, questions });
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/qcm/verify', requireAdmin, async (req, res, next) => {
  try{
    if (!aiProviderConfigured()) return res.status(503).json({ message:'Vérificateur IA indisponible pour le moment.' });
    const sourceRows = Array.isArray(req.body?.questions) ? req.body.questions.slice(0, AI_QCM_BATCH_SIZE) : [];
    if (!sourceRows.length) return res.status(400).json({ message:'Aucun QCM à vérifier.' });
    const level = cleanText(req.body?.level || sourceRows[0]?.level || 'Concours', 40);
    const requestedCategory = cleanText(req.body?.category || sourceRows[0]?.category || '', 80);
    if (!AI_DAILY_DEFAULT_CATEGORIES.includes(requestedCategory)) return res.status(400).json({ message:'Choisis une catégorie avant de vérifier.' });
    if (!categoryAllowedForLevel(requestedCategory, level)) return res.status(400).json({ message:`La catégorie « ${requestedCategory} » n’est pas compatible avec le niveau ${level}.` });
    const category = requestedCategory;
    const theme = cleanText(req.body?.theme || sourceRows[0]?.source || category, 240);
    const questions = sourceRows.map(row => normalizeAiQuestion(row, {
      category,
      level,
      source:strictCleanAiQcmText(row?.source || 'Réussite Concours BF', 500),
      is_premium:Boolean(row?.is_premium)
    }));
    const checked = await verifyExistingQuestionSet(questions, { category, level, theme });
    res.json({ ok:true, model:checked.model, verification:checked.verification, questions:checked.questions });
  }catch(err){ next(err); }
});

app.post('/api/admin/ai/qcm-pdf', requireAdmin, express.raw({ type:() => true, limit:'8mb' }), async (req, res, next) => {
  try{
    if (!aiProviderConfigured()) return res.status(503).json({ message:'Service IA indisponible pour le moment. Réessaie plus tard.' });
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    const fileName = safeFileName(headerText(req, 'x-file-name', 180) || 'source.pdf');
    const mimeType = String(req.headers['content-type'] || 'application/pdf').split(';')[0].trim() || 'application/pdf';
    if (!buffer.length) return res.status(400).json({ message:'Choisis un PDF source pour générer des QCM.' });
    if (buffer.length > MAX_RESOURCE_FILE_BYTES) return res.status(413).json({ message:`PDF trop lourd. Maximum ${Math.round(MAX_RESOURCE_FILE_BYTES/1024/1024)} Mo.` });
    if (!isPdfFile(fileName, mimeType)) return res.status(400).json({ message:'Seuls les fichiers PDF sont acceptés pour cette option IA.' });

    const level = headerText(req, 'x-ai-level', 40) || 'Concours';
    const requestedCategory = headerText(req, 'x-ai-category', 80);
    if (!AI_DAILY_DEFAULT_CATEGORIES.includes(requestedCategory)) return res.status(400).json({ message:'Choisis une catégorie avant de générer.' });
    if (!categoryAllowedForLevel(requestedCategory, level)) return res.status(400).json({ message:`La catégorie « ${requestedCategory} » n’est pas compatible avec le niveau ${level}.` });
    const category = requestedCategory;
    const publicationName = headerText(req, 'x-ai-publication-name', 180) || '';
    const theme = headerText(req, 'x-ai-theme', 220) || publicationName || `PDF ${fileName}`;
    const count = Math.min(AI_QCM_MAX_COUNT, Math.max(1, Number(req.headers['x-ai-count'] || 5)));
    const isPremiumDraft = String(req.headers['x-ai-is-premium'] || '').toLowerCase() === 'true';
    const generated = await generateUniqueAiQuestions({
      count,
      category,
      level,
      theme,
      publicationName,
      fromPdf:true,
      is_premium:isPremiumDraft,
      extraParts:[{ inline_data:{ mime_type:mimeType || 'application/pdf', data:buffer.toString('base64') } }]
    });
    const questions = generated.questions;
    if (questions.length < count) return res.status(502).json({ message:`Seulement ${questions.length}/${count} QCM fiables et non répétitifs ont été validés depuis ce PDF. Vérifie que le PDF contient assez de texte ou réduis le nombre.` });
    res.json({ ok:true, model:generated.model, verificationModel:generated.verificationModel, verification:generated.verification, existingCount:generated.existingCount, fileName, questions });
  }catch(err){ next(err); }
});


app.post('/api/admin/ai/news-scan', requireAdmin, async (req, res, next) => {
  try{
    const limit = Math.min(8, Math.max(1, Number(req.body?.limit || 6)));
    const result = await buildOfficialNewsDrafts(limit);
    const stagedItems = result.items.length ? await stageOfficialNewsDrafts(result.items, req.phone) : [];
    const items = stagedItems.length ? stagedItems : result.items;
    let notificationSent = false;
    if (items.length && emailNotificationsConfigured() && req.profile?.email){
      const text = items.map((item, i) => `${i + 1}. ${item.title}
${item.summary}
Source: ${item.sourceUrl}`).join('\n\n');
      notificationSent = await sendEmailNotification({
        to:req.profile.email,
        subject:`${items.length} nouvelle(s) concours à relire`,
        text:`Réussite Concours BF a détecté des actualités officielles à relire:

${text}`,
        html:`<p>Réussite Concours BF a détecté des actualités officielles à relire :</p><ol>${items.map(item => `<li><b>${htmlEscape(item.title)}</b><br>${htmlEscape(item.summary)}<br><a href="${htmlEscape(item.sourceUrl)}">Source officielle</a>${item.hasPdf ? '<br>PDF officiel joint dans le brouillon.' : ''}</li>`).join('')}</ol>`
      }).catch(err => { console.warn('Notification veille IA:', err.message); return false; });
    }
    res.json({ ok:true, sources:officialNewsSources(), found:result.candidates.length, staged:stagedItems.length, items, notificationSent, today:result.today, currentYear:result.currentYear, freshness:'current_only' });
  }catch(err){ next(err); }
});

app.get('/api/cron/official-news-scan', async (req, res, next) => {
  try{
    if (!cronAuthorized(req)) return res.status(401).json({ ok:false, message:'Cron veille officielle non autorisé' });
    const limit = Math.min(8, Math.max(1, Number(req.query?.limit || 6)));
    const [result, campaign] = await Promise.all([
      buildOfficialNewsDrafts(limit),
      processNextEmailCampaign().catch(err => ({ error:err.message }))
    ]);
    const stagedItems = result.items.length ? await stageOfficialNewsDrafts(result.items, 'cron') : [];
    res.json({ ok:true, found:result.candidates.length, staged:stagedItems.length, items:stagedItems, today:result.today, currentYear:result.currentYear, freshness:'current_only', emailAutomation:{ campaign } });
  }catch(err){ next(err); }
});

app.get('/api/admin/questions', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 80)));
    const search = cleanText(req.query.search, 120);
    const category = cleanText(req.query.category, 80);
    let query = `questions?select=id,category,level,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium,is_active,source,created_at,updated_at&order=created_at.desc&limit=${limit}`;
    if (category) query += `&category=eq.${encodeURIComponent(category)}`;
    if (search) query += `&question_text=ilike.${encodeURIComponent('*' + search + '*')}`;
    const rows = await supabaseRequest(query);
    const correctedRows = (Array.isArray(rows) ? rows : []).map(applyQuestionCorrection);
    const questions = await annotateAdminQuestionRows(correctedRows, { promoteInactive:true });
    res.json({ ok:true, questions });
  }catch(err){ next(err); }
});

app.post('/api/admin/questions/import/preview', requireAdmin, async (req, res, next) => {
  try{
    const result = await preparePastedQcmImport(req.body || {});
    const bookSource = normalizePastedQcmBookSource({ metadata:result.metadata, questions:result.questions });
    res.json({
      ok:true,
      metadata:result.metadata,
      detected:result.detected,
      ready:result.questions.length,
      rejected:result.rejected,
      ignoredLines:result.ignoredLines,
      questions:result.questions,
      pdfToken:signPastedQcmBookSource(bookSource)
    });
  }catch(err){ next(err); }
});

app.post('/api/admin/questions/import/pdf', requireAdmin, async (req, res, next) => {
  try{
    let result;
    if (String(req.body?.text || '').trim()){
      // Le texte complet reste la référence du livre : aucun QCM accepté pour
      // le PDF ne doit disparaître à cause des règles du quiz interactif.
      result = await preparePastedQcmBook(req.body || {});
    }else if (req.body?.pdfToken && Array.isArray(req.body?.questions)){
      const bookSource = normalizePastedQcmBookSource(req.body);
      if (!verifyPastedQcmBookSource(bookSource, req.body.pdfToken)){
        return res.status(409).json({ message:'Cet aperçu a changé. Vérifie de nouveau les QCM avant de créer le PDF.' });
      }
      result = { ...bookSource, rejected:[] };
    }else{
      result = await preparePastedQcmBook(req.body || {});
    }
    if (result.rejected?.length){
      const first = result.rejected[0];
      return res.status(400).json({
        message:`Le PDF n’a pas été créé afin de ne perdre aucun QCM. Vérifie le QCM ${first?.number || '?'} : ${first?.reason || 'contenu incomplet'}`,
        rejected:result.rejected
      });
    }
    if (!result.questions.length){
      return res.status(400).json({
        message:'Aucun QCM complet à placer dans le PDF.',
        rejected:[]
      });
    }
    const buffer = await buildPastedQcmBookPdf({
      metadata:result.metadata,
      questions:result.questions,
      theme:cleanText(req.body?.pdf_theme, 80).toLowerCase()
    });
    const baseName = safeFileName(result.metadata.title || 'Cahier-QCM').replace(/\.pdf$/i, '').slice(0, 90) || 'Cahier-QCM';
    const fileName = `${baseName}-${result.metadata.date || todayId()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-QCM-Count', String(result.questions.length));
    res.setHeader('X-QCM-Rejected', String(result.rejected.length));
    res.send(buffer);
  }catch(err){ next(err); }
});

app.post('/api/admin/questions/import/publish', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const result = await preparePastedQcmImport(req.body || {});
    if (!result.questions.length){
      return res.status(400).json({ message:'Aucun QCM propre et complet à publier.', rejected:result.rejected });
    }
    const multipleAnswerCount = result.questions.filter(question => questionAnswerIndexes(question).length > 1).length;
    if (multipleAnswerCount){
      return res.status(400).json({
        message:`${multipleAnswerCount} QCM comportent plusieurs bonnes réponses. Ils sont acceptés dans le livre PDF, mais le quiz interactif actuel reste réservé aux questions à réponse unique.`,
        rejected:[]
      });
    }
    const payload = result.questions.map(question => ({
      ...adminQuestionPayload(question),
      source:result.metadata.title,
      is_premium:result.metadata.is_premium,
      created_at:result.metadata.created_at
    }));
    const rows = await supabaseRequest('questions?select=*', {
      method:'POST',
      prefer:'return=representation',
      body:payload
    });
    const published = Array.isArray(rows) ? rows.length : payload.length;
    await queueMarketingCampaign({
      kind:'new_qcm',
      subject:`Nouveaux QCM : ${result.metadata.title}`,
      text:`${published} nouveau${published > 1 ? 'x' : ''} QCM corrigé${published > 1 ? 's sont' : ' est'} disponible${published > 1 ? 's' : ''} dans ${result.metadata.category}.`,
      ctaLabel:'Commencer les QCM',
      ctaUrl:absoluteAppUrl('/#formations'),
      createdBy:req.phone
    });
    res.json({
      ok:true,
      published,
      rejected:result.rejected,
      metadata:result.metadata,
      publication:{
        title:result.metadata.title,
        date:result.metadata.date,
        category:result.metadata.category,
        level:result.metadata.level,
        is_premium:result.metadata.is_premium,
        questionCount:published
      }
    });
  }catch(err){ next(err); }
});

app.post('/api/admin/questions', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const payload = adminQuestionPayload(req.body || {});
    if (req.body?.ai_generated){
      const candidate = {
        ...payload,
        evidence_type:strictCleanAiQcmText(req.body?.evidence_type || '', 60),
        source_title:strictCleanAiQcmText(req.body?.source_title || '', 400),
        source_url:cleanQcmSourceUrl(req.body?.source_url || ''),
        source_quote:strictCleanAiQcmText(req.body?.source_quote || '', 1600),
        source_date:strictCleanAiQcmText(req.body?.source_date || '', 80),
        verification_status:strictCleanAiQcmText(req.body?.verification_status || '', 40),
        verification_score:Number(req.body?.verification_score || 0),
        verification_reason:strictCleanAiQcmText(req.body?.verification_reason || '', 1200),
        verified_at:strictCleanAiQcmText(req.body?.verified_at || '', 80),
        verified_by:strictCleanAiQcmText(req.body?.verified_by || '', 120),
        verified_fingerprint:strictCleanAiQcmText(req.body?.verified_fingerprint || '', 80),
        verification_version:strictCleanAiQcmText(req.body?.verification_version || '', 80)
      };
      const verificationIssue = qcmVerificationIssue(candidate, {
        category:payload.category,
        level:payload.level,
        theme:payload.source,
        requireVerified:true
      });
      if (verificationIssue){
        return res.status(409).json({ message:`Publication IA bloquée : ${verificationIssue}. Régénère ou revérifie ce QCM.` });
      }
    }
    const existingTexts = await collectExistingQcmTexts({ includeDaily:false });
    if (isDuplicateQuestionText(payload.question_text, createQuestionDedupeIndex(existingTexts))){
      return res.status(409).json({ message:'Ce QCM existe déjà dans l’application ou ressemble trop à une question existante.' });
    }
    const rows = await supabaseRequest('questions?select=*', {
      method:'POST',
      prefer:'return=representation',
      body:[payload]
    });
    await queueMarketingCampaign({
      kind:'new_qcm',
      subject:`Nouveau QCM : ${payload.category}`,
      text:`Un nouveau QCM corrigé est disponible dans ${payload.category}${payload.level ? ` — ${payload.level}` : ''}.`,
      ctaLabel:'Répondre au QCM',
      ctaUrl:absoluteAppUrl('/#formations'),
      createdBy:req.phone
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

function adminQuestionIds(body){
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  return Array.from(new Set(ids.map(id => cleanText(id, 80)).filter(id => /^[0-9a-f-]{20,80}$/i.test(id)))).slice(0, 300);
}

function supabaseInList(values){
  return values.map(v => String(v).replace(/[^0-9a-f-]/gi, '')).filter(Boolean).join(',');
}

app.patch('/api/admin/questions/bulk/status', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const ids = adminQuestionIds(req.body || {});
    if (!ids.length) return res.status(400).json({ message:'Sélectionne au moins un QCM.' });
    const restoreInAdmin = Boolean(req.body?.is_active);
    const rows = await supabaseRequest(`questions?id=in.(${supabaseInList(ids)})&select=*`, {
      method:'PATCH',
      prefer:'return=representation',
      body:{ is_active:true }
    });
    const updated = Array.isArray(rows) ? rows.length : 0;
    if (!updated) return res.status(404).json({ message:'Aucun QCM sélectionné n’a été modifié. Actualise la liste puis réessaie.' });
    await setAdminQuestionArchived(ids, !restoreInAdmin);
    const questions = await annotateAdminQuestionRows(Array.isArray(rows) ? rows : []);
    res.json({ ok:true, requested:ids.length, updated, archived:!restoreInAdmin, questions });
  }catch(err){ next(err); }
});

app.delete('/api/admin/questions/bulk', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const ids = adminQuestionIds(req.body || {});
    if (!ids.length) return res.status(400).json({ message:'Sélectionne au moins un QCM.' });
    const rows = await supabaseRequest(`questions?id=in.(${supabaseInList(ids)})&select=id`, { method:'DELETE', prefer:'return=representation' });
    await setAdminQuestionArchived(ids, false).catch(()=>{});
    const deleted = Array.isArray(rows) ? rows.length : 0;
    if (!deleted) return res.status(404).json({ message:'Aucun QCM sélectionné n’a été supprimé. Actualise la liste puis réessaie.' });
    res.json({ ok:true, requested:ids.length, deleted });
  }catch(err){ next(err); }
});

app.patch('/api/admin/questions/:id/status', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const restoreInAdmin = Boolean(req.body?.is_active);
    const rows = await supabaseRequest(`questions?id=eq.${encodeURIComponent(req.params.id)}&select=*`, {
      method:'PATCH',
      prefer:'return=representation',
      body:{ is_active:true }
    });
    const question = Array.isArray(rows) ? rows[0] || null : null;
    if (!question) return res.status(404).json({ message:'QCM introuvable ou déjà modifié. Actualise la liste.' });
    await setAdminQuestionArchived([req.params.id], !restoreInAdmin);
    const annotated = await annotateAdminQuestionRows([question]);
    res.json({ ok:true, archived:!restoreInAdmin, question:annotated[0] || question });
  }catch(err){ next(err); }
});

app.delete('/api/admin/questions/:id', requireAdmin, async (req, res, next) => {
  try{
    if (!supabaseReady()) return res.status(503).json({ message:'Base de données indisponible' });
    const rows = await supabaseRequest(`questions?id=eq.${encodeURIComponent(req.params.id)}&select=id`, { method:'DELETE', prefer:'return=representation' });
    await setAdminQuestionArchived([req.params.id], false).catch(()=>{});
    if (!Array.isArray(rows) || !rows.length) return res.status(404).json({ message:'QCM introuvable ou déjà supprimé. Actualise la liste.' });
    res.json({ ok:true, deleted:rows.length });
  }catch(err){ next(err); }
});

app.get('/api/admin/resources', requireAdmin, async (_req, res, next) => {
  try{
    let resources = await loadResourceIndex();
    let changed = false;
    const now = new Date().toISOString();
    resources = resources.map(r => {
      if (r && !r.is_deleted && r.is_active === false){
        changed = true;
        return { ...r, is_active:true, admin_archived:true, updated_at:now };
      }
      return r;
    });
    if (changed) await saveResourceIndex(resources).catch(err => console.warn('Migration archive documents admin:', err.message));
    const dailyResources = await loadPublishedDailyPdfResources();
    res.json({ ok:true, resources:mergePublicResources(visibleResourceRows(resources).map(publicResource), dailyResources) });
  }catch(err){ next(err); }
});

app.get('/api/revision-fiches', async (_req, res, next) => {
  try{
    const rows = await loadRevisionIndex();
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({ ok:true, fiches:rows.filter(row => row.is_active !== false).map(publicRevisionFiche) });
  }catch(err){ next(err); }
});

app.get('/api/admin/revision-fiches', requireAdmin, async (_req, res, next) => {
  try{
    const rows = await loadRevisionIndex();
    res.json({ ok:true, fiches:rows.map(publicRevisionFiche) });
  }catch(err){ next(err); }
});

app.post('/api/admin/revision-fiches', requireAdmin, async (req, res, next) => {
  try{
    const payload = adminRevisionPayload(req.body || {});
    const now = new Date().toISOString();
    const row = { id:crypto.randomUUID(), ...payload, image:revisionImage(payload.category), author_phone:req.phone, created_at:now, updated_at:now };
    const rows = await loadRevisionIndex();
    rows.unshift(row);
    await saveRevisionIndex(rows);
    res.json({ ok:true, fiche:publicRevisionFiche(row), destination:{ block:'Fiches de révision', contentType:row.content_type, competitionType:row.competition_type, category:row.category, level:row.level, access:row.is_premium ? 'Premium' : 'Gratuit' } });
  }catch(err){ next(err); }
});

app.patch('/api/admin/revision-fiches/:id', requireAdmin, async (req, res, next) => {
  try{
    const rows = await loadRevisionIndex();
    const index = rows.findIndex(row => row.id === req.params.id);
    if (index < 0) return res.status(404).json({ message:'Fiche de révision introuvable.' });
    const payload = adminRevisionPayload(req.body || {});
    rows[index] = { ...rows[index], ...payload, image:revisionImage(payload.category), updated_at:new Date().toISOString() };
    await saveRevisionIndex(rows);
    res.json({ ok:true, fiche:publicRevisionFiche(rows[index]) });
  }catch(err){ next(err); }
});

app.delete('/api/admin/revision-fiches/:id', requireAdmin, async (req, res, next) => {
  try{
    const rows = await loadRevisionIndex();
    const nextRows = rows.filter(row => row.id !== req.params.id);
    if (nextRows.length === rows.length) return res.status(404).json({ message:'Fiche de révision introuvable.' });
    await saveRevisionIndex(nextRows);
    res.json({ ok:true, deleted:true, persisted:true });
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
    const adminArchivedResource = String(req.headers['x-admin-archived'] || 'true').toLowerCase() !== 'false';
    const isActiveResource = true;

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
      admin_archived:adminArchivedResource,
      author_phone:req.phone,
      created_at:now,
      updated_at:now
    };
    const resources = await loadResourceIndex();
    resources.unshift(resource);
    await saveResourceIndex(resources);
    await queueMarketingCampaign({
      kind:'new_document',
      subject:`Nouveau document : ${title}`,
      text:`Un nouveau document est disponible dans la rubrique ${category}.${description ? `\n\n${description}` : ''}`,
      ctaLabel:'Voir le document',
      ctaUrl:absoluteAppUrl('/#resources'),
      createdBy:req.phone
    });
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
      admin_archived: patch.admin_archived === undefined ? Boolean(current.admin_archived) : Boolean(patch.admin_archived),
      updated_at:new Date().toISOString()
    };
    await saveResourceIndex(resources);
    res.json({ ok:true, resource:publicResource(resources[idx]) });
  }catch(err){ next(err); }
});

app.patch('/api/admin/resources/:id/status', requireAdmin, async (req, res, next) => {
  try{
    const restoreInAdmin = Boolean(req.body?.is_active);
    const adminArchived = !restoreInAdmin;
    let resources = await loadResourceIndex();
    let idx = resources.findIndex(r => !r.is_deleted && r.id === req.params.id);
    if (idx >= 0){
      resources[idx] = { ...resources[idx], is_active:true, admin_archived:adminArchived, updated_at:new Date().toISOString() };
      await saveResourceIndex(resources);
      return res.json({ ok:true, archived:adminArchived, resource:publicResource(resources[idx]) });
    }
    const dailyDraft = await findPublishedDailyDraftByResourceId(req.params.id);
    const questionDraft = dailyDraft ? null : await loadPublishedDailyQuestionDraftByResourceId(req.params.id);
    const draft = dailyDraft || questionDraft;
    if (!draft) return res.status(404).json({ message:'Document introuvable' });
    const record = { ...dailyDraftResourceRecord(draft, { id:req.params.id, is_active:true, author_phone:req.phone }), admin_archived:adminArchived };
    resources = removeResourceDeletionMarkers(resources, { id:record.id, sourceDraftId:record.source_draft_id, title:record.title });
    idx = resources.findIndex(r => !r.is_deleted && (r.id === record.id || (record.source_draft_id && r.source_draft_id === record.source_draft_id)));
    if (idx >= 0) resources[idx] = { ...resources[idx], ...record, is_active:true, admin_archived:adminArchived, updated_at:new Date().toISOString() };
    else resources.unshift(record);
    await saveResourceIndex(resources);
    res.json({ ok:true, archived:adminArchived, resource:publicResource(idx >= 0 ? resources[idx] : record) });
  }catch(err){ next(err); }
});

app.delete('/api/admin/resources/:id', requireAdmin, async (req, res, next) => {
  try{
    let resources = await loadResourceIndex();
    let item = visibleResourceRows(resources).find(r => r.id === req.params.id);
    let dailyDraft = null;
    let questionDraft = null;
    if (!item) dailyDraft = await findPublishedDailyDraftByResourceId(req.params.id);
    if (!item && !dailyDraft) questionDraft = await loadPublishedDailyQuestionDraftByResourceId(req.params.id);
    if (!item && !dailyDraft && !questionDraft){
      const alreadyDeleted = deletedResourceTargetSet(resources).has(req.params.id);
      if (alreadyDeleted) return res.json({ ok:true, deleted:true, alreadyDeleted:true });
      return res.status(404).json({ message:'Document introuvable' });
    }
    const targetId = req.params.id;
    const targetTitle = safePdfTitle(item?.title || dailyDraft?.title || questionDraft?.title || 'Document');
    const targetDraftId = item?.source_draft_id || dailyDraft?.id || questionDraft?.id || '';
    const dailyLike = isDailyPdfResourceLike(item || dailyDraft || questionDraft || { id:targetId, title:targetTitle });
    // Un document indexé possède sa propre copie de stockage : on confirme sa
    // suppression avant d’annoncer le succès. Le PDF source d’un brouillon IA
    // reste seulement dans l’espace de correction admin.
    if (item?.storage_path) await deleteResourceObject(item.storage_path);
    const marker = resourceDeletionMarker({ id:targetId, sourceDraftId:targetDraftId, title:targetTitle, dailyLike });
    resources = removeResourceDeletionMarkers(resources, { id:targetId, sourceDraftId:targetDraftId, title:targetTitle })
      .filter(r => r.id !== targetId && (!targetDraftId || r.source_draft_id !== targetDraftId));
    resources.unshift(marker);
    await saveResourceIndex(resources);
    const persisted = await loadResourceIndex();
    const stillVisible = visibleResourceRows(persisted).some(r => r.id === targetId || (targetDraftId && r.source_draft_id === targetDraftId));
    if (stillVisible) throw Object.assign(new Error('Le document existe encore après la suppression. Réessaie.'), { status:502 });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok:true, deleted:true, id:targetId, persisted:true });
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
      .filter(item => !(item.official_draft && !item.storage_path))
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

app.get('/api/admin/news/:id/pdf', requireAdmin, async (req, res, next) => {
  try{
    const news = await loadNewsIndex();
    const item = news.find(item => item.id === req.params.id && item.storage_path);
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

app.get('/api/admin/email-campaigns', requireAdmin, async (_req, res, next) => {
  try{
    const rows = await supabaseRequest('email_campaigns?select=*&order=created_at.desc&limit=80');
    res.json({ ok:true, campaigns:Array.isArray(rows) ? rows : [] });
  }catch(err){ next(err); }
});

app.post('/api/admin/email-campaigns', requireAdmin, async (req, res, next) => {
  try{
    const subject = cleanText(req.body?.subject, 160);
    const text = cleanText(req.body?.text, 5000);
    const ctaLabel = cleanText(req.body?.ctaLabel || 'Découvrir', 80);
    const ctaUrl = String(req.body?.ctaUrl || absoluteAppUrl('/')).trim();
    if (subject.length < 4) return res.status(400).json({ message:'Ajoute un objet clair.' });
    if (text.length < 10) return res.status(400).json({ message:'Ajoute un message plus complet.' });
    if (ctaUrl && !/^https:\/\//i.test(ctaUrl)) return res.status(400).json({ message:'Le lien doit commencer par https://.' });
    const campaign = await queueMarketingCampaign({ kind:'promotion', subject, text, ctaLabel, ctaUrl, createdBy:req.phone });
    if (!campaign) return res.status(503).json({ message:'La campagne n’a pas pu être enregistrée.' });
    res.json({ ok:true, campaign, message:'Campagne enregistrée. L’envoi automatique va commencer.' });
  }catch(err){ next(err); }
});

app.get('/api/cron/email-automation', async (req, res, next) => {
  try{
    if (!cronAuthorized(req)) return res.status(401).json({ message:'Accès refusé' });
    const expiry = await processExpiryReminderEmails();
    const campaign = await processNextEmailCampaign();
    res.json({ ok:true, expiry, campaign, at:new Date().toISOString() });
  }catch(err){ next(err); }
});

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
    const premiumAllowed = await premiumAllowedForRequest(req);
    let resources = await loadResourceIndex().catch(err => {
      if (err.status === 503 || /Stockage indisponible/i.test(err.message)) return [];
      throw err;
    });
    let changed = false;
    const now = new Date().toISOString();
    resources = resources.map(r => {
      if (r && !r.is_deleted && r.is_active === false){
        changed = true;
        return { ...r, is_active:true, admin_archived:true, updated_at:now };
      }
      return r;
    });
    if (changed) await saveResourceIndex(resources).catch(err => console.warn('Migration archive documents public:', err.message));
    const lockResource = item => ({ ...item, is_premium:true, locked:!premiumAllowed });
    const indexed = visibleResourceRows(resources)
      .filter(r => r.is_active !== false)
      .map(publicResource)
      .map(lockResource);
    const dailyResources = (await loadPublishedDailyPdfResources())
      .filter(r => r.is_active !== false)
      .map(lockResource);
    res.setHeader('X-Premium-Included', premiumAllowed ? 'true' : 'false');
    // La liste ne doit jamais réafficher un fichier supprimé depuis un cache navigateur.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.json({ ok:true, premiumIncluded:premiumAllowed, resources:mergePublicResources(indexed, dailyResources) });
  }catch(err){ next(err); }
});

app.get('/api/resources/:id/download', async (req, res, next) => {
  try{
    const resources = await loadResourceIndex();
    let item = visibleResourceRows(resources).find(r => r.id === req.params.id && r.is_active !== false);
    const dailyDraft = item ? null : await findPublishedDailyDraftByResourceId(req.params.id);
    if (!item && dailyDraft) item = {
      id:dailyDraftResourceId(dailyDraft),
      title:safePdfTitle(dailyDraft.title || 'QCM quotidien'),
      file_name:dailyDraft.file_name || 'qcm-quotidien.pdf',
      mime_type:dailyDraft.mime_type || 'application/pdf',
      kind:'pdf',
      storage_path:dailyDraft.storage_path,
      is_premium:Boolean(dailyDraft.is_premium),
      is_active:true
    };
    if (item && isDailyPdfResourceLike(item)){
      const currentDraft = await loadPublishedDailyQuestionDraftByTitle(item.title).catch(() => null);
      if (currentDraft?.questions?.length){
        const premiumAllowed = await premiumAllowedForRequest(req);
        if (!premiumAllowed) return res.status(402).json({ message:'Ce document est réservé aux comptes Premium' });
        const pdf = await buildQcmDraftPdf({ title:currentDraft.title, date:currentDraft.date, category:currentDraft.category, level:currentDraft.level, questions:currentDraft.questions });
        const filename = safeFileName(item.file_name || `QCM quotidien — ${currentDraft.category || 'QCM'} — ${currentDraft.level || 'Concours'} — ${currentDraft.date || todayId()}.pdf`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdf.length);
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.setHeader('X-Premium-Content', 'true');
        res.setHeader('Cache-Control', 'private, no-store');
        return res.send(pdf);
      }
    }
    if (!item || (item && !item.storage_path && isDailyPdfResourceLike(item))){
      const questionDraft = await loadPublishedDailyQuestionDraftByResourceId(req.params.id);
      if (questionDraft){
        const premiumAllowed = await premiumAllowedForRequest(req);
        if (!premiumAllowed) return res.status(402).json({ message:'Ce document est réservé aux comptes Premium' });
        const pdf = await buildQcmDraftPdf({ title:questionDraft.title, date:questionDraft.date, category:questionDraft.category, level:questionDraft.level, questions:questionDraft.questions });
        const filename = safeFileName(`QCM quotidien — ${questionDraft.category || 'QCM'} — ${questionDraft.level || 'Concours'} — ${questionDraft.date || todayId()}.pdf`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdf.length);
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.setHeader('X-Premium-Content', 'true');
        res.setHeader('Cache-Control', 'private, no-store');
        return res.send(pdf);
      }
      if (!item) return res.status(404).json({ message:'Document introuvable' });
    }
    const premiumAllowed = await premiumAllowedForRequest(req);
    if (!premiumAllowed) return res.status(402).json({ message:'Ce document est réservé aux comptes Premium' });
    const file = await downloadResourceObject(item.storage_path);
    const filename = safeFileName(item.file_name || item.title || 'document');
    res.setHeader('Content-Type', item.mime_type || file.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', file.buffer.length);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('X-Premium-Content', 'true');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.buffer);
  }catch(err){ next(err); }
});

function safeQuestion(sourceRow){
  const row = applyQuestionCorrection(sourceRow);
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
    if (!supabaseReady()){
      res.setHeader('X-Premium-Included', 'false');
      res.setHeader('Cache-Control', 'private, max-age=30');
      return res.json({ ok:true, publications:[], premiumIncluded:false });
    }
    await ensureQcmCorrectionsPersisted().catch(err => console.warn('Persistance des corrections QCM:', err.message));
    const premiumAllowed = await premiumAllowedForRequest(req);
    const rows = await supabaseRequest('questions?select=id,category,level,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium,source,created_at&order=created_at.desc&limit=800').catch(()=>[]);
    const groups = new Map();
    for (const sourceRow of (Array.isArray(rows) ? rows : [])){
      const row = applyQuestionCorrection(sourceRow);
      if (publicQuestionQualityIssue(row)) continue;
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
    res.setHeader('X-Premium-Included', premiumAllowed ? 'true' : 'false');
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({ ok:true, premiumIncluded:premiumAllowed, publications });
  }catch(err){ next(err); }
});

app.get('/api/questions', async (req, res, next) => {
  try{
    const premiumAllowed = await premiumAllowedForRequest(req);

    const localBank = loadLocalQcmBank();
    if (localBank.length){
      const available = premiumAllowed ? localBank : localBank.filter(q => !q.is_premium);
      const questions = available
        .filter(q => !publicQuestionQualityIssue(q))
        .map(safeLocalQuestion);
      if (supabaseReady()){
        const premiumFilter = premiumAllowed ? '' : '&is_premium=eq.false';
        const extraRows = await supabaseRequest(`questions?${premiumFilter ? premiumFilter.slice(1) + '&' : ''}select=id,category,level,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium,source,created_at&order=created_at.desc`).catch(()=>[]);
        const seen = new Set(questions.map(q => String(q.question_text || '').toLowerCase().trim()));
        if (Array.isArray(extraRows)){
          extraRows.map(safeQuestion).filter(q => !publicQuestionQualityIssue(q)).forEach(q => {
            const key = String(q.question_text || '').toLowerCase().trim();
            if (key && !seen.has(key)){
              seen.add(key);
              questions.push(q);
            }
          });
        }
      }
      res.setHeader('X-Premium-Included', premiumAllowed ? 'true' : 'false');
      res.setHeader('Cache-Control', 'private, max-age=30');
      return res.json({
        ok:true,
        source:'local_bank_5000_v1',
        premiumIncluded:premiumAllowed,
        questions
      });
    }

    if (!supabaseReady()) return res.status(503).json({ message:'Stockage indisponible pour le moment.' });
    const premiumFilter = premiumAllowed ? '' : '&is_premium=eq.false';
    const rows = await supabaseRequest(`questions?${premiumFilter ? premiumFilter.slice(1) + '&' : ''}select=id,category,level,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium,source,created_at&order=created_at.asc`);
    res.setHeader('X-Premium-Included', premiumAllowed ? 'true' : 'false');
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json({
      ok:true,
      source:'supabase',
      premiumIncluded:premiumAllowed,
      questions:Array.isArray(rows) ? rows.map(safeQuestion).filter(q => !publicQuestionQualityIssue(q)) : []
    });
  }catch(err){ next(err); }
});

app.get('/api/subscription/status', async (req, res, next) => {
  try{
    const phone = normalizePhone(req.query.phone);
    if (!phone) return res.status(400).json({ message: 'Numéro invalide' });
    const sub = await getActiveSubscription(phone);
    res.setHeader('X-Premium-Included', sub ? 'true' : 'false');
    res.setHeader('Cache-Control', sub ? 'private, no-store' : 'private, max-age=30');
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

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL){
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Réussite Concours BF API listening on 0.0.0.0:${PORT}`);
  });
}

export default app;
export {
  app,
  normalizeAiQuestion,
  qcmContentFingerprint,
  qcmDeterministicFactIssue,
  qcmVerificationIssue,
  qcmVerificationSummary,
  certifyGeminiSinglePassQuestion,
  dailyDraftGenerationIssue,
  recoverDailyAiDraft,
  parsePastedQcmText,
  pastedQcmImportMetadata,
  preparePastedQcmBook,
  normalizePastedQcmBookSource,
  signPastedQcmBookSource,
  verifyPastedQcmBookSource,
  buildQcmDraftPdf,
  buildPastedQcmBookPdf,
  questionAnswerLabels,
  PDF_THEME_KEYS,
  isDirectProfessionalCompetitionNews,
  extractOfficialCandidates,
  normalizeOfficialNewsDraft,
  isOfficialBurkinaQcmSource,
  isTrustedEducationalQcmSource,
  aiProviderStatus,
  callAiGenerateParts,
  openRouterMessageContent,
  groundingSourcesFromOpenRouter,
  burkinaMobileOperator,
  validatePaymentPhoneForProvider,
  saspayUsesHostedCheckout,
  checkoutStatusTransactionId,
  checkoutStatusLabel,
  marketingUnsubscribeToken,
  marketingCampaignContent,
  sendEmailEventOnce,
  processExpiryReminderEmails,
  processNextEmailCampaign,
  activateSubscription,
  absoluteAppUrl,
  adminRevisionPayload,
  publicRevisionFiche
};
