/* ============ Réussite Concours BF — logique de l'application ============ */

const PAYMENT_CONFIG = window.REUSSITE_CONCOURS_BF_PAYMENT_CONFIG || {
  amount: 1500,
  currency: 'XOF',
  plan: 'premium_monthly',
  backendBaseUrl: '',
  demoMode: false
};

const SUBSCRIPTION_PLANS = {
  premium_monthly: {
    id:'premium_monthly', label:'Mensuel', durationLabel:'mois', actionLabel:'S’abonner / mois', amount:1500, regularAmount:1500, savings:0, days:30,
    description:'Accès Premium pendant 30 jours, renouvelable chaque mois.'
  },
  premium_annual: {
    id:'premium_annual', label:'Annuel', durationLabel:'an', actionLabel:'S’abonner / an', amount:10000, regularAmount:18000, savings:8000, days:365,
    description:'⭐ Abonnement annuel : 12 mois d’accès Premium avec 8 000 FCFA de réduction.'
  }
};


function normalizeDailyLevel(level){
  const raw = String(level || '').trim();
  const key = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (key.includes('cep')) return 'CEP';
  if (key.includes('bepc')) return 'BEPC';
  if (key.includes('bac')) return 'BAC';
  if (key.includes('licence')) return 'Licence';
  if (key.includes('concours')) return 'Concours';
  return raw || 'Concours';
}

function dailyAllowedCategories(_level){
  return ALL_QCM_CATEGORIES;
}

function setDailyCategoryOptions(select, level, preferred='', includeRotation=false){
  if (!select) return '';
  const allowed = dailyAllowedCategories(level);
  const current = preferred !== undefined && preferred !== null ? String(preferred) : select.value;
  select.innerHTML = `${includeRotation ? '<option value="">Choisir une catégorie</option>' : ''}${allowed.map(cat=>`<option>${escapeHtml(cat)}</option>`).join('')}`;
  if (current && allowed.includes(current)) select.value = current;
  else select.value = includeRotation ? '' : (allowed[0] || 'Culture générale');
  updateAdminPublicationPreviews();
  return select.value;
}

function refreshDailyCategoryOptions(preferred){
  return setDailyCategoryOptions($('#aiDailyCategory'), $('#aiDailyLevel')?.value || 'Concours', (preferred ?? $('#aiDailyCategory')?.value ?? ''), true);
}

function refreshDailyPublishCategoryOptions(preferred){
  return setDailyCategoryOptions($('#dailyPublishCategory'), $('#dailyPublishLevel')?.value || 'Concours', (preferred ?? $('#dailyPublishCategory')?.value ?? ''), false);
}

function subscriptionPlan(id){
  return SUBSCRIPTION_PLANS[id] || SUBSCRIPTION_PLANS.premium_monthly;
}

function selectedSubscriptionPlan(){
  return subscriptionPlan(state.selectedPlan || PAYMENT_CONFIG.plan || 'premium_monthly');
}

const SUPABASE_CONFIG = window.REUSSITE_CONCOURS_BF_SUPABASE_CONFIG || {
  url: 'https://scnhrcjhxqzetkrhhong.supabase.co',
  publishableKey: 'sb_publishable_LluqoYWbpvDSzoFhhZ9lcQ_8dX_UEUT',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjbmhyY2poeHF6ZXRrcmhob25nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMjI3NzYsImV4cCI6MjEwNTU5ODc3Nn0.6EtrbUI_crFEJe1tdupzXNRJkq8vcPd7AKrqqu6crVI'
};

const ACCESS_OPEN_UNTIL_PAYMENT = false; // Premium réactivé : seules les catégories gratuites restent ouvertes sans paiement.
const FREE_CATEGORIES = ['Burkina Faso', 'Culture générale', 'Histoire-Géo'];
const ALL_QCM_CATEGORIES = ['Burkina Faso', 'Culture générale', 'Histoire-Géo', 'Mathématiques', 'Physique-Chimie', 'Psychotechnique', 'Français', 'SVT', 'Greffier / Droit'];
const DAILY_LEVEL_CATEGORY_RULES = {
  'CEP':['Français','Mathématiques','SVT','Histoire-Géo','Burkina Faso','Culture générale'],
  'BEPC':['Français','Mathématiques','Physique-Chimie','SVT','Histoire-Géo','Burkina Faso','Culture générale'],
  'BAC':['Français','Mathématiques','Physique-Chimie','SVT','Histoire-Géo','Burkina Faso','Culture générale'],
  'Concours':['Burkina Faso','Culture générale','Histoire-Géo','Mathématiques','Physique-Chimie','Psychotechnique','Français','SVT','Greffier / Droit'],
  'Licence':['Burkina Faso','Culture générale','Histoire-Géo','Mathématiques','Physique-Chimie','Psychotechnique','Français','SVT','Greffier / Droit']
};
const PAID_CATEGORIES = ALL_QCM_CATEGORIES.filter(cat => !FREE_CATEGORIES.includes(cat));
function isFreeCategory(cat){ return FREE_CATEGORIES.includes(cat); }
function isPaidCategory(cat){ return !isFreeCategory(cat); }
const CATEGORY_TOTALS = {
  'Mathématiques': 1200,
  'Physique-Chimie': 700,
  'Psychotechnique': 1000,
  'Français': 900,
  'Burkina Faso': 500,
  'Histoire-Géo': 500,
  'Culture générale': 400,
  'SVT': 300,
  'Greffier / Droit': 200
};
let nextAfterLogin = 'home';
let authMode = 'register';
let paywallFeature = null;
let currentFormFilter = 'Tout';
let runtimePaymentMessage = '';
let pendingAvatarData = '';

/* ---------- état persistant ---------- */
const store = {
  get(k, d){ try{ const v = localStorage.getItem('fp_'+k); return v===null ? d : JSON.parse(v);}catch(e){return d;} },
  set(k, v){ try{ localStorage.setItem('fp_'+k, JSON.stringify(v)); }catch(e){} }
};

let state = {
  xp: store.get('xp', 0),
  quizDone: store.get('quizDone', 0),
  correct: store.get('correct', 0),
  answered: store.get('answered', 0),
  errors: store.get('errors', []),          // [{q, good, exp}]
  catStats: store.get('catStats', {}),      // {cat:{ok,total}}
  streak: store.get('streak', 0),
  lastDay: store.get('lastDay', null),
  dailyDone: store.get('dailyDone', null),  // date du dernier défi
  bestScore: store.get('bestScore', 0),
  phoneSaved: store.get('phoneSaved', false),
  user: store.get('user', null),            // {phone, createdAt, lastLoginAt}
  subscription: store.get('subscription', {status:'free', expiresAt:null}),
  pendingPayment: store.get('pendingPayment', null),
  selectedProvider: store.get('selectedProvider', 'ORANGE_MONEY'),
  selectedPlan: store.get('selectedPlan', PAYMENT_CONFIG.plan || 'premium_monthly'),
  profileAvatars: store.get('profileAvatars', {}),
  authToken: store.get('authToken', null),
  authExpiresAt: store.get('authExpiresAt', null),
  revisionRead: store.get('revisionRead', [])
};

function save(){
  for (const k of ['xp','quizDone','correct','answered','errors','catStats','streak','lastDay','dailyDone','bestScore','phoneSaved','user','subscription','pendingPayment','selectedProvider','selectedPlan','profileAvatars','authToken','authExpiresAt','revisionRead'])
    store.set(k, state[k]);
}

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const shuffle = a => { a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const today = () => new Date().toISOString().slice(0,10);

/* ---------- lecteur PDF intégré à défilement continu ---------- */
let pdfReaderEnginePromise = null;
let pdfReaderDocument = null;
let pdfReaderOpenToken = 0;
let pdfReaderCurrentPage = 1;
let pdfReaderPageObserver = null;
let pdfReaderRenderTasks = new Map();
let pdfReaderScrollFrame = 0;
let pdfReaderDownloadBlob = null;
let pdfReaderDownloadName = 'document.pdf';

function pdfReaderFileName(title){
  const base = String(title || 'document').replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'document';
  return `${base}.pdf`;
}

function downloadOpenPdf(){
  if (!pdfReaderDownloadBlob) return toast('Le document est encore en préparation.');
  const url = URL.createObjectURL(pdfReaderDownloadBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdfReaderDownloadName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}

function loadPdfReaderEngine(){
  if (!Promise.withResolvers){
    Promise.withResolvers = () => {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
  }
  if (!pdfReaderEnginePromise){
    pdfReaderEnginePromise = import('/js/vendor/pdf.mjs?v=qcm-pdf-mobile-fit-v25').then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = '/js/vendor/pdf.worker.mjs?v=qcm-pdf-mobile-fit-v25';
      return pdfjs;
    });
  }
  return pdfReaderEnginePromise;
}

function updatePdfReaderMeta(){
  const total = Number(pdfReaderDocument?.numPages || 0);
  const meta = $('#pdfReaderMeta');
  if (!meta) return;
  if (!total) meta.textContent = 'Préparation du document…';
  else if (pdfReaderCurrentPage <= 1) meta.textContent = `${total} page${total > 1 ? 's' : ''}`;
  else meta.textContent = `Page ${pdfReaderCurrentPage} sur ${total}`;
}

function cancelPdfReaderRenders(){
  for (const task of pdfReaderRenderTasks.values()) task?.cancel?.();
  pdfReaderRenderTasks.clear();
}

function pdfReaderAvailableWidth(stage){
  const rootWidth = Number(document.documentElement?.clientWidth || window.innerWidth || 1);
  const stageWidth = Math.min(Number(stage?.clientWidth || rootWidth), rootWidth);
  const styles = window.getComputedStyle?.(stage);
  const horizontalPadding = (Number.parseFloat(styles?.paddingLeft) || 0) + (Number.parseFloat(styles?.paddingRight) || 0);
  return Math.max(1, Math.min(920, stageWidth - horizontalPadding));
}

function releaseDistantPdfPages(currentPage){
  const pages = $('#pdfReaderPages');
  if (!pages) return;
  pages.querySelectorAll('.pdf-reader-page').forEach(section => {
    const number = Number(section.dataset.page || 0);
    if (!number || Math.abs(number - currentPage) <= 4 || section.classList.contains('error')) return;
    const task = pdfReaderRenderTasks.get(number);
    if (task){ task.cancel?.(); pdfReaderRenderTasks.delete(number); }
    const canvas = section.querySelector('canvas');
    if (canvas && section.classList.contains('ready')){
      canvas.width = 1;
      canvas.height = 1;
      section.classList.remove('ready');
      const wait = section.querySelector('.pdf-reader-page-wait');
      if (wait) wait.textContent = `Page ${number}`;
    }
  });
}

async function renderContinuousPdfPage(number, section, openToken=pdfReaderOpenToken){
  if (!pdfReaderDocument || !section || openToken !== pdfReaderOpenToken) return;
  if (section.classList.contains('ready') || section.classList.contains('rendering')) return;
  const canvas = section.querySelector('canvas');
  const stage = $('#pdfReaderStage');
  const wait = section.querySelector('.pdf-reader-page-wait');
  if (!canvas || !stage) return;
  section.classList.add('rendering');
  section.classList.remove('error');
  if (wait) wait.textContent = `Page ${number}`;
  try{
    const page = await pdfReaderDocument.getPage(number);
    if (openToken !== pdfReaderOpenToken) return;
    const baseViewport = page.getViewport({ scale:1 });
    const availableWidth = pdfReaderAvailableWidth(stage);
    section.style.width = `${availableWidth}px`;
    section.style.maxWidth = '100%';
    const fitScale = availableWidth / baseViewport.width;
    const viewport = page.getViewport({ scale:fitScale });
    let outputScale = Math.min(1.65, Math.max(1, window.devicePixelRatio || 1));
    const maxPixels = 6_500_000;
    const pixels = viewport.width * viewport.height * outputScale * outputScale;
    if (pixels > maxPixels) outputScale *= Math.sqrt(maxPixels / pixels);
    canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
    canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
    section.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
    const context = canvas.getContext('2d', { alpha:false });
    const renderTask = page.render({
      canvasContext:context,
      viewport,
      transform:outputScale === 1 ? null : [outputScale,0,0,outputScale,0,0],
      background:'#ffffff'
    });
    pdfReaderRenderTasks.set(number, renderTask);
    await renderTask.promise;
    if (pdfReaderRenderTasks.get(number) === renderTask) pdfReaderRenderTasks.delete(number);
    if (openToken !== pdfReaderOpenToken) return;
    section.classList.add('ready');
  }catch(err){
    if (err?.name !== 'RenderingCancelledException' && openToken === pdfReaderOpenToken){
      section.classList.add('error');
      if (wait) wait.textContent = `Page ${number} indisponible`;
      console.warn('Lecteur PDF:', err?.message || err);
    }
  }finally{
    section.classList.remove('rendering');
  }
}

function observePdfReaderPages(openToken){
  pdfReaderPageObserver?.disconnect();
  const stage = $('#pdfReaderStage');
  const pages = $('#pdfReaderPages');
  if (!stage || !pages) return;
  if (!('IntersectionObserver' in window)){
    [...pages.children].slice(0,3).forEach((section, index)=>renderContinuousPdfPage(index + 1, section, openToken));
    return;
  }
  pdfReaderPageObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const section = entry.target;
      renderContinuousPdfPage(Number(section.dataset.page || 0), section, openToken);
    });
  }, { root:stage, rootMargin:'1200px 0px', threshold:0.01 });
  pages.querySelectorAll('.pdf-reader-page').forEach(section => pdfReaderPageObserver.observe(section));
}

function updateCurrentPdfPageFromScroll(){
  pdfReaderScrollFrame = 0;
  const stage = $('#pdfReaderStage');
  const pages = $('#pdfReaderPages');
  if (!stage || !pages || !pdfReaderDocument) return;
  const stageRect = stage.getBoundingClientRect();
  const focus = stageRect.top + Math.min(220, stageRect.height * .32);
  let bestPage = pdfReaderCurrentPage;
  let bestDistance = Number.POSITIVE_INFINITY;
  pages.querySelectorAll('.pdf-reader-page').forEach(section => {
    const rect = section.getBoundingClientRect();
    if (rect.bottom < stageRect.top || rect.top > stageRect.bottom) return;
    const distance = Math.abs(rect.top - focus);
    if (distance < bestDistance){ bestDistance = distance; bestPage = Number(section.dataset.page || bestPage); }
  });
  if (bestPage !== pdfReaderCurrentPage){
    pdfReaderCurrentPage = bestPage;
    updatePdfReaderMeta();
    releaseDistantPdfPages(bestPage);
  }
}

function handlePdfReaderScroll(){
  if (pdfReaderScrollFrame) return;
  pdfReaderScrollFrame = requestAnimationFrame(updateCurrentPdfPageFromScroll);
}

async function buildContinuousPdfPages(openToken){
  const pages = $('#pdfReaderPages');
  const stage = $('#pdfReaderStage');
  if (!pages || !stage || !pdfReaderDocument) return;
  pages.innerHTML = '';
  const firstPage = await pdfReaderDocument.getPage(1);
  if (openToken !== pdfReaderOpenToken) return;
  const baseViewport = firstPage.getViewport({ scale:1 });
  const availableWidth = pdfReaderAvailableWidth(stage);
  for (let number=1; number<=pdfReaderDocument.numPages; number++){
    const section = document.createElement('section');
    section.className = 'pdf-reader-page';
    section.dataset.page = String(number);
    section.setAttribute('aria-label', `Page ${number} sur ${pdfReaderDocument.numPages}`);
    section.style.width = `${availableWidth}px`;
    section.style.maxWidth = '100%';
    section.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', `Page ${number}`);
    const wait = document.createElement('span');
    wait.className = 'pdf-reader-page-wait';
    wait.textContent = `Page ${number}`;
    section.append(canvas, wait);
    pages.appendChild(section);
  }
  pdfReaderCurrentPage = 1;
  updatePdfReaderMeta();
  stage.scrollTop = 0;
  stage.addEventListener('scroll', handlePdfReaderScroll, { passive:true });
  observePdfReaderPages(openToken);
  await renderContinuousPdfPage(1, pages.firstElementChild, openToken);
}

async function openPdfReader(source, title='Document PDF'){
  const reader = $('#pdfReader');
  const loading = $('#pdfReaderLoading');
  const pages = $('#pdfReaderPages');
  const stage = $('#pdfReaderStage');
  const downloadButton = $('#pdfReaderDownload');
  if (!reader) return;
  const openToken = ++pdfReaderOpenToken;
  pdfReaderDownloadBlob = null;
  pdfReaderDownloadName = pdfReaderFileName(title);
  if (downloadButton) downloadButton.disabled = true;
  reader.classList.add('open');
  reader.setAttribute('aria-hidden', 'false');
  document.body.classList.add('pdf-reader-open');
  $('#pdfReaderTitle') && ($('#pdfReaderTitle').textContent = String(title || 'Document PDF'));
  if (pages) pages.innerHTML = '';
  if (stage){ stage.removeEventListener('scroll', handlePdfReaderScroll); stage.scrollTop = 0; }
  pdfReaderPageObserver?.disconnect();
  cancelPdfReaderRenders();
  if (loading){ loading.classList.remove('error'); loading.textContent = 'Ouverture du document…'; loading.style.display = 'block'; }
  try{
    if (pdfReaderDocument){ await pdfReaderDocument.destroy().catch(()=>{}); pdfReaderDocument = null; }
    if (openToken !== pdfReaderOpenToken) return;
    const buffer = source instanceof Blob
      ? await source.arrayBuffer()
      : await fetch(String(source || ''), { headers:String(source || '').startsWith('blob:') ? {} : authHeaders({}) }).then(res => {
          if (!res.ok) throw new Error('Document indisponible');
          return res.arrayBuffer();
        });
    if (openToken !== pdfReaderOpenToken) return;
    pdfReaderDownloadBlob = new Blob([buffer], { type:'application/pdf' });
    if (downloadButton) downloadButton.disabled = false;
    const pdfjs = await loadPdfReaderEngine();
    if (openToken !== pdfReaderOpenToken) return;
    const loadedDocument = await pdfjs.getDocument({ data:new Uint8Array(buffer) }).promise;
    if (openToken !== pdfReaderOpenToken){ await loadedDocument.destroy().catch(()=>{}); return; }
    pdfReaderDocument = loadedDocument;
    await buildContinuousPdfPages(openToken);
    if (openToken === pdfReaderOpenToken && loading) loading.style.display = 'none';
  }catch(err){
    if (openToken !== pdfReaderOpenToken) return;
    if (loading){ loading.textContent = err?.message || 'Document indisponible'; loading.classList.add('error'); loading.style.display = 'block'; }
  }
}

async function closePdfReader(){
  pdfReaderOpenToken += 1;
  const reader = $('#pdfReader');
  const stage = $('#pdfReaderStage');
  reader?.classList.remove('open');
  reader?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('pdf-reader-open');
  stage?.removeEventListener('scroll', handlePdfReaderScroll);
  pdfReaderPageObserver?.disconnect();
  pdfReaderPageObserver = null;
  if (pdfReaderScrollFrame) cancelAnimationFrame(pdfReaderScrollFrame);
  pdfReaderScrollFrame = 0;
  cancelPdfReaderRenders();
  if (pdfReaderDocument){ await pdfReaderDocument.destroy().catch(()=>{}); pdfReaderDocument = null; }
  pdfReaderDownloadBlob = null;
  const downloadButton = $('#pdfReaderDownload');
  if (downloadButton) downloadButton.disabled = true;
  const pages = $('#pdfReaderPages');
  if (pages) pages.innerHTML = '';
}

let pdfReaderResizeTimer = null;
window.addEventListener('resize', ()=>{
  if (!pdfReaderDocument || !$('#pdfReader')?.classList.contains('open')) return;
  clearTimeout(pdfReaderResizeTimer);
  pdfReaderResizeTimer = setTimeout(()=>{
    cancelPdfReaderRenders();
    const sections = [...($('#pdfReaderPages')?.querySelectorAll('.pdf-reader-page') || [])];
    const availableWidth = pdfReaderAvailableWidth($('#pdfReaderStage'));
    sections.forEach(section => {
      section.style.width = `${availableWidth}px`;
      section.style.maxWidth = '100%';
      const canvas = section.querySelector('canvas');
      if (canvas){ canvas.width = 1; canvas.height = 1; }
      section.classList.remove('ready','rendering');
    });
    observePdfReaderPages(pdfReaderOpenToken);
    for (let number=Math.max(1,pdfReaderCurrentPage-1); number<=Math.min(pdfReaderDocument.numPages,pdfReaderCurrentPage+1); number++){
      renderContinuousPdfPage(number, sections[number-1]);
    }
  }, 180);
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('#pdfReader')?.classList.contains('open')) closePdfReader();
});

function toast(msg){
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(()=>t.classList.remove('show'), 2600);
}

function confetti(){
  const colors = ['#0e9f6e','#f5a623','#e02424','#3f83f8','#9061f9'];
  for(let i=0;i<60;i++){
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random()*100 + 'vw';
    c.style.width = c.style.height = (6+Math.random()*8)+'px';
    c.style.background = colors[Math.floor(Math.random()*colors.length)];
    c.style.animationDuration = (1.8+Math.random()*1.6)+'s';
    c.style.animationDelay = (Math.random()*0.6)+'s';
    document.body.appendChild(c);
    setTimeout(()=>c.remove(), 4200);
  }
}

function normalizePhone(value){
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('226') && digits.length >= 11) return digits.slice(3, 11);
  if (digits.length > 8) return digits.slice(-8);
  return digits;
}

function prettyPhone(phone){
  const p = normalizePhone(phone);
  if (p.length !== 8) return phone || '';
  return p.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4');
}

function fullPhone(phone){
  const p = normalizePhone(phone);
  return p.length === 8 ? '+226'+p : p;
}

function displayUserName(user = state.user){
  if (!user) return 'Candidat';
  const full = (user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim()).trim();
  return full || prettyPhone(user.phone) || 'Candidat';
}

function userInitials(user = state.user){
  const name = displayUserName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return '👤';
  if (parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}

function escapeHtml(value){
  return String(value || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function renderMathText(value){
  let text = String(value || '')
    .replace(/\\\((.*?)\\\)/g, '$1')
    .replace(/\\\[(.*?)\\\]/g, '$1')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/([0-9A-Za-z)\]])\s*\*\s*([0-9A-Za-z(])/g, '$1 × $2')
    .replace(/([0-9A-Za-z)\]])\s*\*\s*([0-9A-Za-z(])/g, '$1 × $2')
    .replace(/\bplus ou moins\b/gi, '±')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
    .replace(/\bsigma\b/gi, 'σ')
    .replace(/\bDelta\b/g, 'Δ')
    .replace(/\bpi\b/g, 'π')
    .replace(/\b([A-Za-z])''(?=[\s)=,+\-−]|$)/g, '$1″')
    .replace(/\b([A-Za-z])'(?=[\s()=,+\-−]|$)/g, '$1′')
    .replace(/\s+-\s+/g, ' − ');
  const pieces = [];
  const hold = html => `@@RCBFMATH${pieces.push(html) - 1}@@`;
  text = text.replace(/\\frac\s*\{([^{}]{1,90})\}\s*\{([^{}]{1,90})\}/g, (_, num, den) => hold(renderFraction(num, den)));
  text = text.replace(/\bfrac\s*\{([^{}]{1,90})\}\s*\{([^{}]{1,90})\}/gi, (_, num, den) => hold(renderFraction(num, den)));
  text = text.replace(/(?:\\sqrt|sqrt)\s*\(([^\n]{1,160}?)\)(?=[\s.,;:!?]|$)/gi, (_, rad) => hold(renderSqrt(rad)));
  text = text.replace(/√\s*\(([^\n]{1,160}?)\)(?=[\s.,;:!?]|$)/g, (_, rad) => hold(renderSqrt(rad)));
  let html = escapeHtml(text);
  html = html.replace(/\^\{([^{}<>]{1,50})\}/g, (_, exp) => `<sup>${escapeHtml(exp)}</sup>`);
  html = html.replace(/\^\(([^()<>]{1,50})\)/g, (_, exp) => `<sup>${escapeHtml(exp)}</sup>`);
  html = html.replace(/\^([+\-−]?\d+(?:[a-zA-Z])?|[a-zA-Z])/g, (_, exp) => `<sup>${escapeHtml(exp)}</sup>`);
  html = html.replace(/_\{([^{}<>]{1,40})\}/g, (_, sub) => `<sub>${escapeHtml(sub)}</sub>`);
  html = html.replace(/_([A-Za-z0-9]+)/g, (_, sub) => `<sub>${escapeHtml(sub)}</sub>`);
  html = html.replace(/(?<![\w/])([A-Za-z]\([^()]{1,40}\))\s*\/\s*([A-Za-z]\w*|\d{1,3}(?:[,.]\d+)?|\([^()]{1,30}\))(?![\w/])/g, (_, num, den) => renderFraction(num, den));
  html = html.replace(/(?<![\w/])([A-Za-z]\w*|\d{1,3}(?:[,.]\d+)?|\([^()]{1,30}\))\s*\/\s*([A-Za-z]\w*|\d{1,3}(?:[,.]\d+)?|\([^()]{1,30}\))(?![\w/])/g, (_, num, den) => renderFraction(num, den));
  pieces.forEach((piece, idx) => { html = html.replace(`@@RCBFMATH${idx}@@`, piece); });
  return `<span class="math-text">${html}</span>`;
}

function renderFraction(num, den){
  return `<span class="math-frac"><span class="math-num">${renderMathText(num)}</span><span class="math-den">${renderMathText(den)}</span></span>`;
}

function renderSqrt(rad){
  return `<span class="math-sqrt">√<span class="math-radicand">${renderMathText(rad)}</span></span>`;
}

function refreshAiCategoryOptions(preferred){
  return setDailyCategoryOptions($('#aiCategory'), $('#aiLevel')?.value || 'Concours', (preferred ?? $('#aiCategory')?.value ?? ''), false);
}

function refreshPastedQcmCategoryOptions(preferred){
  return setDailyCategoryOptions($('#pastedQcmCategory'), $('#pastedQcmLevel')?.value || 'Concours', (preferred ?? $('#pastedQcmCategory')?.value ?? ''), false);
}

function refreshAllAiCategoryOptions(){
  refreshDailyCategoryOptions();
  refreshAiCategoryOptions();
  refreshPastedQcmCategoryOptions();
}

function avatarDataForUser(user = state.user){
  const phone = normalizePhone(user?.phone);
  return user?.avatarData || (phone && state.profileAvatars?.[phone]) || '';
}

function saveAvatarForPhone(phone, data){
  const normalized = normalizePhone(phone);
  if (!normalized || !data) return;
  state.profileAvatars = state.profileAvatars || {};
  state.profileAvatars[normalized] = data;
  if (state.user && normalizePhone(state.user.phone) === normalized) state.user.avatarData = data;
  save();
}

function setAvatarElement(el, user = state.user){
  if (!el) return;
  const data = avatarDataForUser(user);
  el.classList.toggle('has-photo', Boolean(data));
  if (data) el.innerHTML = `<img src="${data}" alt="Photo de profil">`;
  else el.textContent = userInitials(user);
}

function updateAvatarPreview(){
  const preview = $('#avatarPreview');
  if (!preview) return;
  const data = pendingAvatarData || avatarDataForUser();
  preview.classList.toggle('has-photo', Boolean(data));
  if (data) preview.innerHTML = `<img src="${data}" alt="Photo de profil">`;
  else preview.textContent = state.user ? userInitials() : '👤';
}

function fileToAvatarData(file){
  return new Promise((resolve, reject)=>{
    if (!file || !/^image\//.test(file.type || '')) return reject(new Error('Choisis une image'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Photo illisible'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format image non supporté'));
      img.onload = () => {
        const size = 320;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleAvatarPick(input, saveCurrent = false){
  const file = input?.files?.[0];
  if (!file) return;
  try{
    const data = await fileToAvatarData(file);
    pendingAvatarData = data;
    updateAvatarPreview();
    if (saveCurrent && state.user){
      saveAvatarForPhone(state.user.phone, data);
      renderAccount();
      renderAccountScreen();
      apiPost('/api/profile/avatar', { avatarData:data })
        .then(res=>{ if (res?.user) applyRemoteSession({user:res.user}, state.user.phone); })
        .catch(()=>{});
      toast('Photo de profil mise à jour ✅');
    } else {
      toast('Photo ajoutée ✅');
    }
  }catch(err){
    toast(err.message || 'Photo impossible à utiliser');
  }finally{
    if (input) input.value = '';
  }
}

function money(v){ return new Intl.NumberFormat('fr-FR').format(v) + ' FCFA'; }

function formatDate(iso){
  if (!iso) return '—';
  try{
    return new Intl.DateTimeFormat('fr-FR', {day:'2-digit', month:'long', year:'numeric'}).format(new Date(iso));
  }catch(e){ return iso; }
}

function isPremium(){
  const sub = state.subscription || {};
  return sub.status === 'premium' && sub.expiresAt && new Date(sub.expiresAt).getTime() > Date.now();
}

function hasOpenAccess(){
  return ACCESS_OPEN_UNTIL_PAYMENT || isPremium() || isAdmin();
}

function isAdmin(){
  return Boolean(state.user?.isAdmin || state.user?.role === 'admin');
}

function premiumDaysLeft(){
  if (!isPremium()) return 0;
  return Math.max(1, Math.ceil((new Date(state.subscription.expiresAt).getTime() - Date.now()) / 864e5));
}

function activatePremium(days, txRef, provider){
  const base = isPremium() ? new Date(state.subscription.expiresAt) : new Date();
  const started = new Date().toISOString();
  base.setDate(base.getDate() + days);
  state.subscription = {
    status: 'premium',
    startedAt: state.subscription?.startedAt || started,
    renewedAt: started,
    expiresAt: base.toISOString(),
    txRef: txRef || ('MANUAL-' + Date.now()),
    provider: provider || state.selectedProvider
  };
  state.pendingPayment = null;
  save();
}

function setButtonLoading(btn, loading, label){
  if (!btn) return;
  if (btn._loadingWatchdog) clearTimeout(btn._loadingWatchdog);
  if (loading){
    btn.dataset.label = btn.textContent;
    btn.textContent = label || 'Chargement...';
    btn.disabled = true;
    // Aucun bouton ne doit rester bloqué indéfiniment si le réseau ou une API
    // cesse de répondre. Les fonctions normales le réactivent bien avant.
    btn._loadingWatchdog = setTimeout(() => {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
      btn._loadingWatchdog = null;
    }, 65000);
  } else {
    btn.textContent = btn.dataset.label || btn.textContent;
    btn.disabled = false;
    btn._loadingWatchdog = null;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000){
  if (options.signal) return fetch(url, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try{
    return await fetch(url, { ...options, signal:controller.signal });
  }catch(err){
    if (err?.name === 'AbortError'){
      const timeoutError = new Error('Le serveur met trop de temps à répondre. Le bouton est de nouveau disponible : réessaie sans perdre les données enregistrées.');
      timeoutError.name = 'TimeoutError';
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw err;
  }finally{
    clearTimeout(timer);
  }
}

function authHeaders(extra = {}){
  const headers = {...extra};
  if (state.authToken) headers.Authorization = 'Bearer ' + state.authToken;
  return headers;
}

async function apiPost(path, body){
  const res = await fetchWithTimeout(path, {
    method:'POST',
    headers: authHeaders({'Content-Type':'application/json'}),
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok){
    const err = new Error(data.message || 'Service indisponible');
    err.status = res.status;
    throw err;
  }
  return data;
}

async function apiPatch(path, body){
  const res = await fetchWithTimeout(path, {
    method:'PATCH',
    headers:authHeaders({'Content-Type':'application/json'}),
    body:JSON.stringify(body || {})
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok){
    const err = new Error(data.message || 'Service indisponible');
    err.status = res.status;
    throw err;
  }
  return data;
}

function shouldUseLocalFallback(err){
  return err?.status === 404 || err?.status === 503 || err?.name === 'TypeError' || /Failed to fetch|NetworkError|Stockage indisponible/i.test(err?.message || '');
}

function applyRemoteSession(data, fallbackPhone){
  if (data?.user){
    const phone = normalizePhone(data.user.phone || fallbackPhone);
    const avatarData = data.user.avatarData || state.user?.avatarData || (phone && state.profileAvatars?.[phone]) || '';
    state.user = {
      ...state.user,
      phone,
      firstName: data.user.firstName || '',
      lastName: data.user.lastName || '',
      displayName: data.user.displayName || '',
      email: data.user.email || state.user?.email || '',
      marketingEmailOptIn:Boolean(data.user.marketingEmailOptIn),
      avatarData,
      role: data.user.role || state.user?.role || 'student',
      isAdmin: Boolean(data.user.isAdmin),
      createdAt: data.user.createdAt || new Date().toISOString(),
      lastLoginAt: data.user.lastLoginAt || new Date().toISOString()
    };
    if (avatarData) saveAvatarForPhone(phone, avatarData);
    state.phoneSaved = true;
  }
  if (data?.progress){
    state.xp = Number(data.progress.xp || 0);
    state.quizDone = Number(data.progress.quiz_done || data.progress.quizDone || 0);
    state.correct = Number(data.progress.correct || 0);
    state.answered = Number(data.progress.answered || 0);
    state.errors = data.progress.errors || [];
    state.catStats = data.progress.cat_stats || data.progress.catStats || {};
    state.streak = Number(data.progress.streak || 0);
    state.lastDay = data.progress.last_day || data.progress.lastDay || state.lastDay;
  }
  if (data?.subscription?.active || data?.subscription?.status === 'premium'){
    state.subscription = {
      status:'premium',
      expiresAt:data.subscription.expiresAt,
      txRef:data.subscription.txRef,
      provider:data.subscription.provider
    };
  }
  if (data?.session?.token){
    state.authToken = data.session.token;
    state.authExpiresAt = data.session.expiresAt || null;
  }
  save();
}

async function saveProgressRemote(){
  if (!state.user?.phone) return;
  try{
    await apiPost('/api/progress/save', {
      phone: fullPhone(state.user.phone),
      progress: {
        xp: state.xp,
        quizDone: state.quizDone,
        correct: state.correct,
        answered: state.answered,
        errors: state.errors,
        catStats: state.catStats,
        streak: state.streak,
        lastDay: state.lastDay
      }
    });
  }catch(e){ /* sauvegarde distante facultative */ }
}

function mergeQuestionRows(rows){
  if (typeof QUESTIONS === 'undefined' || !Array.isArray(rows) || !rows.length) return;
  const mapped = rows.map(r=>({
    c:r.category,
    level:r.level,
    q:r.question_text,
    o:[r.option_a,r.option_b,r.option_c,r.option_d].filter(option => String(option || '').trim()),
    a:Number(r.correct_answer),
    e:r.explanation || '',
    premium: Boolean(r.is_premium)
  })).filter(q=>q.q && q.o.length >= 2 && q.o.length <= 4 && q.a >= 0 && q.a < q.o.length);
  const existing = new Set(QUESTIONS.map(q=>q.q));
  mapped.forEach(q=>{ if (!existing.has(q.q)) QUESTIONS.push(q); });
}

async function loadSupabaseQuestions(){
  if (typeof QUESTIONS === 'undefined') return;
  // Mode actuel : la banque épurée de QCM validés est intégrée directement dans l'application.
  // On ne fusionne pas les anciennes lignes Supabase pour éviter des totaux incohérents.
  if (ACCESS_OPEN_UNTIL_PAYMENT) return;

  // Les questions Premium sont servies uniquement aux comptes Premium connectés.
  try{
    const res = await fetchWithTimeout('/api/questions', { headers: authHeaders({}) });
    if (res.ok){
      const data = await res.json().catch(()=>({}));
      mergeQuestionRows(data.questions || []);
      return;
    }
  }catch(e){ /* fallback Supabase public ci-dessous */ }

  // Fallback public : depuis l'étape sécurité 1, Supabase ne renvoie ici que les questions gratuites.
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) return;
  try{
    const url = SUPABASE_CONFIG.url.replace(/\/$/, '') + '/rest/v1/questions?is_active=eq.true&is_premium=eq.false&select=category,level,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,is_premium';
    const res = await fetchWithTimeout(url, {
      headers:{
        apikey: SUPABASE_CONFIG.anonKey,
        Authorization: 'Bearer ' + SUPABASE_CONFIG.anonKey
      }
    });
    if (!res.ok) return;
    const rows = await res.json();
    mergeQuestionRows(rows);
  }catch(e){ /* lecture Supabase facultative */ }
}

/* ---------- navigation ---------- */
function show(id){
  closeAppMenu();
  if ((id === 'account' || id === 'admin') && !state.user){ openAuth('login'); return; }
  if ((id === 'stats' || id === 'errors') && !hasOpenAccess()){
    openPremium(id === 'stats' ? 'Ma progression détaillée' : 'Mes erreurs');
    return;
  }

  const target = $('#'+id);
  if (!target) return;
  $$('.screen').forEach(s=>s.classList.remove('active'));
  target.classList.add('active');
  currentScreenId = id;
  window.scrollTo({top:0});
  $$('.nav-btn').forEach(b=>b.classList.toggle('on', b.dataset.target===id));
  const navIds = ['home','formations','moduleqcm','publishedqcm','news','resources','revision','passport','stats','subscription','account'];
  $('#bottomNav').style.display = navIds.includes(id) ? 'flex' : 'none';

  if (id==='stats') setTimeout(renderStats, 60);
  if (id==='passport') setTimeout(renderPassport, 60);
  if (id==='home') renderHome();
  if (id==='errors') renderErrors();
  if (id==='formations') renderFormations(currentFormFilter);
  if (id==='publishedqcm') loadPublishedQcm(currentPublishedQcmFilter);
  if (id==='news') loadNews();
  if (id==='resources') loadResources();
  if (id==='revision'){
    renderRevisionFiches(currentRevisionFilter);
    loadRevisionFiches().catch(()=>{});
  }
  if (id==='subscription') setTimeout(renderSubscription, 20);
  if (id==='account') setTimeout(renderAccountScreen, 20);
  if (id==='admin') setTimeout(()=>renderAdminPanel(false), 20);
  if (id==='login') setTimeout(renderLogin, 20);
}

function setAppMenuOpen(open){
  const menu = $('#appMenu');
  const backdrop = $('#appMenuBackdrop');
  const toggle = $('#appMenuToggle');
  if (!menu || !backdrop) return;
  const active = Boolean(open);
  const current = currentScreenId || document.querySelector('.screen.active')?.id || 'home';
  menu.querySelectorAll('[data-menu-target]').forEach(card => {
    const selected = card.dataset.menuTarget === current;
    card.classList.toggle('is-current', selected);
    if (selected) card.setAttribute('aria-current', 'page');
    else card.removeAttribute('aria-current');
  });
  menu.toggleAttribute('inert', !active);
  menu.classList.toggle('open', active);
  backdrop.classList.toggle('open', active);
  menu.setAttribute('aria-hidden', active ? 'false' : 'true');
  backdrop.setAttribute('aria-hidden', active ? 'false' : 'true');
  toggle?.setAttribute('aria-expanded', active ? 'true' : 'false');
  document.body.classList.toggle('menu-open', active);
  if (active) setTimeout(()=>menu.querySelector('.app-menu-close')?.focus(), 60);
}

function toggleAppMenu(){
  setAppMenuOpen(!$('#appMenu')?.classList.contains('open'));
}

function closeAppMenu(){ setAppMenuOpen(false); }

function menuNavigate(id){
  closeAppMenu();
  show(id);
}

function openAccountFromMenu(){
  closeAppMenu();
  openAccountMenu();
}

document.addEventListener('keydown', event=>{
  if (event.key === 'Escape' && $('#appMenu')?.classList.contains('open')) closeAppMenu();
});

function openPremium(feature){
  paywallFeature = feature || 'Cette fonctionnalité';
  toast('Fonction Premium 🔒');
  show('subscription');
}

function openAccountMenu(){
  if (state.user) show('account');
  else openAuth('login');
}

function openAuth(mode){
  authMode = mode || 'register';
  nextAfterLogin = 'home';
  show('login');
}

function setAuthMode(mode){
  authMode = mode || 'register';
  renderLogin();
}

function renderAccount(){
  const connected = Boolean(state.user);
  $('#topbar')?.classList.toggle('user-connected', connected);
  $('#home')?.classList.toggle('home-connected', connected);
  document.body.classList.toggle('candidate-connected', connected);
  const homeNavLabel = $('#homeNavLabel');
  const homeNavIcon = $('#homeNavIcon');
  if (homeNavLabel) homeNavLabel.textContent = connected ? 'Mon espace' : 'Accueil';
  if (homeNavIcon) homeNavIcon.textContent = connected ? '🎯' : '🏠';
  const chip = $('#accountChip');
  const name = displayUserName();
  if (chip){
    chip.classList.toggle('signed-in', connected);
    chip.classList.toggle('premium', isPremium());
    chip.setAttribute('aria-label', connected ? 'Profil candidat' : 'Connexion');
    if (state.user){
      const fullName = (name || state.user.displayName || 'Profil').trim();
      const avatar = avatarDataForUser()
        ? `<span class="chip-avatar has-photo"><img src="${avatarDataForUser()}" alt="Profil"></span>`
        : `<span class="chip-avatar">${escapeHtml(userInitials())}</span>`;
      chip.innerHTML = `${avatar}<span class="chip-name">${escapeHtml(fullName)}</span>`;
    } else {
      chip.innerHTML = '<span class="chip-avatar">👤</span><span class="chip-name">Connexion</span>';
    }
    chip.title = state.user ? name + ' — Mon compte' : 'Connexion';
  }

  $$('.premium-locked').forEach(card=>{
    card.classList.toggle('is-unlocked', hasOpenAccess());
  });
  $$('.lock-tag').forEach(tag=>{
    tag.textContent = hasOpenAccess() ? 'Ouvert' : 'Premium';
  });

  const accountHome = $('#accountHomeCard');
  if (accountHome){
    if (state.user){
      accountHome.style.display = 'none';
      accountHome.innerHTML = '';
    } else {
      accountHome.style.display = 'grid';
      accountHome.innerHTML = `
        <img src="img/student-portrait.jpg" alt="Espace candidat">
        <div class="auth-home-copy">
          <div class="premium-kicker">Espace candidat</div>
          <h3>Inscris-toi ou connecte-toi</h3>
          <p>Garde ta progression, ton abonnement et tes résultats même si tu changes de téléphone.</p>
          <div class="auth-home-actions">
            <button class="btn btn-green" onclick="openAuth('register')">Créer un compte</button>
            <button class="btn btn-ghost" onclick="openAuth('login')">Connexion</button>
          </div>
        </div>`;
    }
  }

  renderSmartDashboard();

  const adminBtn = $('#adminPanelBtn');
  if (adminBtn) adminBtn.style.display = isAdmin() ? 'flex' : 'none';
  const menuAdminBtn = $('#appMenuAdminBtn');
  if (menuAdminBtn) menuAdminBtn.style.display = isAdmin() ? 'grid' : 'none';

  const premiumHome = $('#premiumHomeCard');
  if (premiumHome){
    if (ACCESS_OPEN_UNTIL_PAYMENT){
      premiumHome.classList.add('active-premium');
      premiumHome.innerHTML = `
        <img class="premium-mini-img" src="img/success.jpg" alt="Accès ouvert">
        <div class="premium-copy">
          <div class="premium-kicker">Accès ouvert</div>
          <h3>Plus de 2 000 QCM uniques et corrigés</h3>
          <p>Révise librement les contenus disponibles pendant la période d’accès.</p>
        </div>
        <button class="mini-btn" onclick="show('formations')">Réviser</button>`;
    } else if (isPremium()){
      premiumHome.classList.add('active-premium');
      premiumHome.innerHTML = `
        <img class="premium-mini-img" src="img/success.jpg" alt="Premium actif">
        <div class="premium-copy">
          <div class="premium-kicker">Premium actif</div>
          <h3>Accès illimité encore ${premiumDaysLeft()} jour${premiumDaysLeft()>1?'s':''}</h3>
          <p>Valable jusqu'au ${formatDate(state.subscription.expiresAt)}.</p>
        </div>
        <button class="mini-btn" onclick="show('subscription')">Gérer</button>`;
    } else {
      premiumHome.classList.remove('active-premium');
      premiumHome.innerHTML = `
        <img class="premium-mini-img" src="img/success.jpg" alt="Premium Réussite Concours BF">
        <div class="premium-copy">
          <div class="premium-kicker">Réussite Concours BF Premium</div>
          <h3>Débloque tout dès 1 500 FCFA/mois</h3>
          <p>Examens blancs, erreurs, statistiques détaillées et matières avancées.</p>
        </div>
        <button class="mini-btn" onclick="show('subscription')">Voir</button>`;
    }
  }
}

function renderAccountScreen(){
  if (!state.user) return;
  const name = displayUserName();
  const phone = prettyPhone(state.user.phone);
  const rate = state.answered ? Math.round(state.correct/state.answered*100)+'%' : '—';
  setAvatarElement($('#accountAvatar'));
  $('#accountFullName') && ($('#accountFullName').textContent = name);
  $('#accountPhone') && ($('#accountPhone').textContent = '+226 ' + phone);
  $('#accountKicker') && ($('#accountKicker').textContent = isAdmin() ? 'Compte Pro administrateur' : 'Espace candidat');
  const badge = $('#accountPlanBadge');
  if (badge){
    badge.textContent = isAdmin() ? 'Pro' : (ACCESS_OPEN_UNTIL_PAYMENT ? 'Accès ouvert' : (isPremium() ? 'Premium' : 'Gratuit'));
    badge.classList.toggle('premium', hasOpenAccess() || isAdmin());
  }
  const greetingCard = $('#accountGreetingCard');
  if (greetingCard){
    if (state.sessionGreeting?.text){
      greetingCard.style.display = 'block';
      greetingCard.innerHTML = `<b>${escapeHtml(state.sessionGreeting.text)}</b><span>${state.sessionGreeting.sub || 'Continue ta préparation avec sérieux et régularité.'}</span>`;
    } else {
      greetingCard.style.display = 'none';
      greetingCard.innerHTML = '';
    }
  }
  const renewalCard = $('#premiumRenewalCard');
  if (renewalCard){
    if (isAdmin()){
      renewalCard.style.display = 'block';
      renewalCard.innerHTML = `
        <div><span>Compte Pro administrateur</span><b>Accès complet actif</b><small>Toutes les ressources et fonctions de gestion sont ouvertes.</small></div>
        <button class="mini-btn" onclick="show('admin')">Admin</button>
        <i><em style="width:100%"></em></i>`;
    } else if (isPremium()){
      const days = premiumDaysLeft();
      const pct = Math.max(4, Math.min(100, Math.round(days / 30 * 100)));
      renewalCard.style.display = 'block';
      renewalCard.innerHTML = `
        <div><span>Premium actif</span><b>${days} jour${days>1?'s':''} restant${days>1?'s':''}</b><small>Renouvellement à prévoir le ${formatDate(state.subscription.expiresAt)}</small></div>
        <button class="mini-btn" onclick="show('subscription')">Renouveler</button>
        <i><em style="width:${pct}%"></em></i>`;
    } else {
      renewalCard.style.display = 'none';
      renewalCard.innerHTML = '';
    }
  }
  $('#accountXp') && ($('#accountXp').textContent = state.xp);
  $('#accountQuiz') && ($('#accountQuiz').textContent = state.quizDone);
  $('#accountRate') && ($('#accountRate').textContent = rate);
  $('#accountInfoName') && ($('#accountInfoName').textContent = name);
  $('#accountInfoPhone') && ($('#accountInfoPhone').textContent = '+226 ' + phone);
  $('#accountInfoEmail') && ($('#accountInfoEmail').textContent = state.user.email || '—');
  $('#accountLastLogin') && ($('#accountLastLogin').textContent = state.user.lastLoginAt ? formatDate(state.user.lastLoginAt) : 'Aujourd’hui');
  const marketingBox = $('#accountMarketingEmailOptIn');
  if (marketingBox) marketingBox.checked = Boolean(state.user.marketingEmailOptIn);
  renderSmartDashboard();

  const adminBtn = $('#adminPanelBtn');
  if (adminBtn) adminBtn.style.display = isAdmin() ? 'flex' : 'none';
  const menuAdminBtn = $('#appMenuAdminBtn');
  if (menuAdminBtn) menuAdminBtn.style.display = isAdmin() ? 'grid' : 'none';
}


/* ---------- streak ---------- */
(function initStreak(){
  const t = today();
  if (state.lastDay !== t){
    const y = new Date(Date.now()-864e5).toISOString().slice(0,10);
    if (state.lastDay !== y) state.streak = 0; // streak cassé
  }
})();

function bumpStreak(){
  const t = today();
  if (state.lastDay !== t){
    const y = new Date(Date.now()-864e5).toISOString().slice(0,10);
    state.streak = (state.lastDay === y) ? state.streak+1 : 1;
    state.lastDay = t;
  }
}

/* ---------- quiz engine ---------- */
let quiz = null;

function premiumLockForQuiz(opts){
  if (ACCESS_OPEN_UNTIL_PAYMENT) return null;
  if (!opts || opts.free || opts.daily) return null;
  if (opts.errorsMode) return 'Révision de tes erreurs';
  if (opts.title === 'Examen blanc') return 'Examen blanc chronométré';
  if (opts.n === 'all') return 'Banque complète';
  if (opts.n && opts.n > 10) return opts.n + ' questions';
  if (opts.cat && !FREE_CATEGORIES.includes(opts.cat)) return 'Formation ' + opts.cat;
  return null;
}


function questionBank(){
  return (typeof QUESTIONS !== 'undefined' && Array.isArray(QUESTIONS)) ? QUESTIONS : [];
}

function qcmCount(cat){
  if (cat && CATEGORY_TOTALS[cat]) return CATEGORY_TOTALS[cat];
  const bank = questionBank();
  return cat ? bank.filter(q=>q.c === cat).length : (Object.values(CATEGORY_TOTALS).reduce((a,b)=>a+b, 0) || bank.length);
}

function formatQcmCount(n){
  return new Intl.NumberFormat('fr-FR').format(n || 0) + ' QCM';
}

function sessionSizeFor(total){
  return Math.min(40, Math.max(10, total || 10));
}


function quizReturnTarget(){
  const active = currentScreenId || document.querySelector('.screen.active')?.id || 'home';
  if (active && !['quiz','result','login'].includes(active)) return active;
  return quizReturnScreen || 'home';
}

function startQuiz(opts){
  opts = opts || {};
  const returnTo = opts.returnTo || quizReturnTarget();
  const required = premiumLockForQuiz(opts);
  if (required && !hasOpenAccess()){
    openPremium(required);
    return;
  }

  // opts: {n, time (sec, 0=sans), title, cat (opt), level (opt), errorsMode, free}
  const bank = questionBank();
  let pool;
  if (opts.errorsMode){
    const errQs = state.errors.map(e=>e.q);
    pool = bank.filter(q=>errQs.includes(q.q));
    if (!pool.length){ toast('Aucune erreur à réviser 🎉'); return; }
  } else if (opts.cat){
    pool = bank.filter(q=>q.c===opts.cat);
  } else {
    pool = bank;
  }
  if (opts.level){
    const levelPool = pool.filter(q=>q.level === opts.level);
    if (levelPool.length) pool = levelPool;
  }
  if (!pool.length){ toast('Aucun QCM disponible pour ce choix'); return; }
  const requested = opts.n === 'all' ? pool.length : Math.max(1, Number(opts.n || 10));
  const qs = shuffle(pool).slice(0, Math.min(requested, pool.length));
  quizReturnScreen = returnTo;
  quiz = {
    qs, i:0, ok:0, ko:0, title:opts.title || 'Quiz', daily:opts.daily||false,
    time: opts.time||0, left: opts.time||0, answered:false, wrongList:[], returnTo
  };
  $('#quizTitleTag').textContent = quiz.title;
  show('quiz');
  if (quiz.time){ $('#timer').style.display='block'; tickTimer(); quiz.timer = setInterval(tickTimer, 1000); }
  else $('#timer').style.display='none';
  renderQuestion();
}

function startQuestionListQuiz(qs, opts = {}){
  const returnTo = opts.returnTo || quizReturnTarget();
  const clean = (Array.isArray(qs) ? qs : []).filter(q => q?.q && Array.isArray(q.o) && q.o.length >= 2 && q.o.length <= 4 && Number(q.a) >= 0 && Number(q.a) < q.o.length);
  if (!clean.length){ toast('Aucun QCM disponible pour ce contenu'); return; }
  const limit = opts.limit ? Math.max(1, Math.min(Number(opts.limit), clean.length)) : clean.length;
  const selected = shuffle(clean).slice(0, limit);
  quizReturnScreen = returnTo;
  quiz = {
    qs:selected, i:0, ok:0, ko:0, title:opts.title || 'Nouveau QCM', daily:opts.daily || false,
    time:opts.time || 0, left:opts.time || 0, answered:false, wrongList:[], returnTo
  };
  $('#quizTitleTag').textContent = quiz.title;
  show('quiz');
  if (quiz.time){ $('#timer').style.display='block'; tickTimer(); quiz.timer = setInterval(tickTimer, 1000); }
  else $('#timer').style.display='none';
  renderQuestion();
}

function tickTimer(){
  if (!quiz) return;
  const t = $('#timer');
  const m = Math.floor(quiz.left/60), s = quiz.left%60;
  t.textContent = m+':'+String(s).padStart(2,'0');
  t.classList.toggle('low', quiz.left<=30);
  if (quiz.left<=0){ clearInterval(quiz.timer); finishQuiz(true); return; }
  quiz.left--;
}

function renderQuestion(){
  const q = quiz.qs[quiz.i];
  quiz.answered = false;
  $('#qCount').textContent = (quiz.i+1)+' / '+quiz.qs.length;
  $('#progressBar').style.width = ((quiz.i)/quiz.qs.length*100)+'%';
  const card = $('#qCard');
  card.classList.remove('out');
  card.innerHTML = `
    <div class="q-meta">
      <span class="q-tag">${escapeHtml(q.c)}</span>
      <span class="q-count">${quiz.i+1} / ${quiz.qs.length}</span>
    </div>
    <div class="q-text">${renderMathText(q.q)}</div>
    <div class="opts">
      ${q.o.map((o,idx)=>`<button class="opt" data-i="${idx}"><span class="key">${'ABCD'[idx]}</span><span>${renderMathText(o)}</span></button>`).join('')}
    </div>
    <div id="explainBox"></div>`;
  card.style.animation='none'; void card.offsetWidth; card.style.animation='';
  $$('#qCard .opt').forEach(b=>b.addEventListener('click', ()=>answer(+b.dataset.i)));
  $('#nextBtn').style.visibility='hidden';
  $('#nextBtn').textContent = quiz.i === quiz.qs.length-1 ? 'Voir mon résultat  →' : 'Question suivante  →';
}

function answer(idx){
  if (quiz.answered) return;
  quiz.answered = true;
  const q = quiz.qs[quiz.i];
  const opts = $$('#qCard .opt');
  opts.forEach(b=>b.disabled=true);
  const good = q.a === idx;
  opts[q.a].classList.add('correct');
  if (!good) opts[idx].classList.add('wrong');

  // stats
  state.answered++;
  if (!state.catStats[q.c]) state.catStats[q.c]={ok:0,total:0};
  state.catStats[q.c].total++;
  if (good){
    quiz.ok++; state.correct++; state.xp += 10; state.catStats[q.c].ok++;
    // retirer des erreurs si présente
    state.errors = state.errors.filter(e=>e.q!==q.q);
  } else {
    quiz.ko++;
    quiz.wrongList.push(q);
    if (!state.errors.find(e=>e.q===q.q))
      state.errors.push({q:q.q, good:q.o[q.a], exp:q.e});
  }
  save();

  $('#explainBox').innerHTML = `
    <div class="explain">
      <h4>${good ? '✅ Bonne réponse !' : '💡 Explication'}</h4>
      <p>${renderMathText(q.e)}</p>
    </div>`;
  $('#nextBtn').style.visibility='visible';
  $('#progressBar').style.width = ((quiz.i+1)/quiz.qs.length*100)+'%';
}

function nextQuestion(){
  if (!quiz.answered) return;
  if (quiz.i >= quiz.qs.length-1){ finishQuiz(false); return; }
  const card = $('#qCard');
  card.classList.add('out');
  setTimeout(()=>{ quiz.i++; renderQuestion(); }, 240);
}

function safeReturnScreen(id){
  return (id && !['quiz','result','login'].includes(id)) ? id : 'home';
}

function quitQuiz(){
  const target = safeReturnScreen(quiz?.returnTo || quizReturnScreen || 'home');
  if (quiz && quiz.timer) clearInterval(quiz.timer);
  quiz = null;
  show(target);
}

function returnAfterQuiz(){
  const target = safeReturnScreen(quiz?.returnTo || quizReturnScreen || 'home');
  if (quiz && quiz.timer) clearInterval(quiz.timer);
  quiz = null;
  show(target);
}

function finishQuiz(timeout){
  if (quiz.timer) clearInterval(quiz.timer);
  const total = quiz.qs.length;
  const pct = Math.round(quiz.ok/total*100);
  state.quizDone++;
  state.xp += 20; // bonus quiz terminé
  bumpStreak();
  if (quiz.daily) state.dailyDone = today();
  if (pct > state.bestScore) state.bestScore = pct;
  save();
  saveProgressRemote();

  $('#resultImg').src = pct>=50 ? 'img/success.jpg' : 'img/study.jpg';
  $('#resultTitle').textContent =
    timeout ? '⏰ Temps écoulé !' :
    pct>=80 ? 'Excellent travail !' :
    pct>=50 ? 'Bien joué, continue !' : 'Courage, on progresse !';
  $('#resultSub').textContent = quiz.title + ' — ' + quiz.ok + ' bonne' + (quiz.ok>1?'s':'') + ' réponse' + (quiz.ok>1?'s':'') + ' sur ' + total;
  $('#rsOk').textContent = quiz.ok;
  $('#rsKo').textContent = total - quiz.ok;
  $('#rsXp').textContent = '+' + (quiz.ok*10+20);

  // ring
  const ring = $('#ringFill');
  const C = 2*Math.PI*62;
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C;
  ring.style.stroke = pct>=50 ? '#0e9f6e' : '#e02424';
  $('#ringVal').textContent = pct + '%';
  quizReturnScreen = safeReturnScreen(quiz.returnTo || quizReturnScreen || 'home');
  show('result');
  setTimeout(()=>{ ring.style.transition='stroke-dashoffset 1.2s cubic-bezier(.22,1,.36,1)'; ring.style.strokeDashoffset = C*(1-pct/100); }, 120);
  if (pct>=80) setTimeout(confetti, 500);
  quiz._last = {title: quiz.title};
}

/* ---------- setup examens / concours ---------- */
let setup = {level:null, n:10};
function pickLevel(el, lv){ setup.level = lv; $$('#levelGrid .pick-li').forEach(p=>p.classList.remove('on')); el.classList.add('on'); }
function pickN(el, n){ setup.n = n; $$('#nGrid .pick').forEach(p=>p.classList.remove('on')); el.classList.add('on'); }
function startSetupQuiz(){
  if (!setup.level){ toast('Choisis d’abord ton niveau 👆'); return; }
  const duration = setup.n === 'all' ? 0 : Number(setup.n || 10) * 60;
  startQuiz({n: setup.n, time: duration, title: setup.level});
}

/* ---------- compte candidat ---------- */
function renderLogin(){
  const isRegister = authMode !== 'login';
  const resetPanel = $('#pinResetPanel');
  const mainFields = $('#authMainFields');
  if (resetPanel) resetPanel.style.display = 'none';
  if (mainFields) mainFields.style.display = 'block';
  $('#registerTab')?.classList.toggle('on', isRegister);
  $('#loginTab')?.classList.toggle('on', !isRegister);
  if ($('#authTitle')) $('#authTitle').textContent = isRegister ? 'Créer ton compte candidat' : 'Connexion candidat';
  if ($('#authIntro')) $('#authIntro').textContent = isRegister
    ? 'Renseigne ton nom, prénom, e-mail, numéro et PIN pour sauvegarder ta progression.'
    : 'Entre ton numéro et ton code PIN pour retrouver ton espace candidat.';
  if ($('#authSubmitBtn')) $('#authSubmitBtn').textContent = isRegister ? 'Créer mon compte →' : 'Me connecter →';
  const nameFields = $('#nameFields');
  if (nameFields) nameFields.style.display = isRegister ? 'grid' : 'none';
  const avatarField = $('#avatarUploadField');
  if (avatarField) avatarField.style.display = isRegister ? 'block' : 'none';
  const emailField = $('#emailField');
  if (emailField) emailField.style.display = isRegister ? 'block' : 'none';
  if (!isRegister) pendingAvatarData = '';
  updateAvatarPreview();
  const firstName = $('#firstName');
  const lastName = $('#lastName');
  const phoneInput = $('#authPhone');
  const emailInput = $('#authEmail');
  const pinInput = $('#authPin');
  if (firstName && state.user?.firstName) firstName.value = state.user.firstName;
  if (lastName && state.user?.lastName) lastName.value = state.user.lastName;
  if (emailInput && state.user?.email) emailInput.value = state.user.email;
  if (phoneInput && state.user) phoneInput.value = prettyPhone(state.user.phone);
  if (pinInput) pinInput.value = '';
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) logoutBtn.style.display = state.user ? 'flex' : 'none';
  const forgotBtn = $('#forgotPinBtn');
  if (forgotBtn) forgotBtn.style.display = !isRegister && !state.user ? 'flex' : 'none';
}

function openPinReset(){
  const panel = $('#pinResetPanel');
  const main = $('#authMainFields');
  if (panel) panel.style.display = 'block';
  if (main) main.style.display = 'none';
  if ($('#pinResetEmail') && state.user?.email) $('#pinResetEmail').value = state.user.email;
  if ($('#pinResetResult')) $('#pinResetResult').textContent = '';
}

function closePinReset(){
  if ($('#pinResetPanel')) $('#pinResetPanel').style.display = 'none';
  if ($('#authMainFields')) $('#authMainFields').style.display = 'block';
}

async function requestPinReset(){
  const email = String($('#pinResetEmail')?.value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Entre ton adresse e-mail'); return; }
  const btn = $('#pinResetRequestBtn');
  const result = $('#pinResetResult');
  setButtonLoading(btn, true, 'Envoi...');
  try{
    const data = await apiPost('/api/auth/pin-reset/request', { email });
    if ($('#pinResetConfirmFields')) $('#pinResetConfirmFields').style.display = 'block';
    if (result){ result.textContent = data.message || 'Si cette adresse correspond à un compte, un code vient d’être envoyé.'; result.className = 'payment-result ok'; }
  }catch(err){
    if (result){ result.textContent = err.message || 'Envoi impossible pour le moment.'; result.className = 'payment-result err'; }
  }finally{ setButtonLoading(btn, false); }
}

async function confirmPinReset(){
  const email = String($('#pinResetEmail')?.value || '').trim().toLowerCase();
  const code = String($('#pinResetCode')?.value || '').replace(/\D/g, '');
  const pin = String($('#pinResetNewPin')?.value || '').replace(/\D/g, '');
  if (code.length !== 6){ toast('Entre le code à 6 chiffres'); return; }
  if (pin.length < 4){ toast('Choisis un PIN de 4 à 6 chiffres'); return; }
  const btn = $('#pinResetConfirmBtn');
  const result = $('#pinResetResult');
  setButtonLoading(btn, true, 'Modification...');
  try{
    const data = await apiPost('/api/auth/pin-reset/confirm', { email, code, pin });
    if (result){ result.textContent = data.message || 'PIN modifié.'; result.className = 'payment-result ok'; }
    toast('PIN modifié ✅');
    setTimeout(()=>{ closePinReset(); setAuthMode('login'); }, 700);
  }catch(err){
    if (result){ result.textContent = err.message || 'Code invalide.'; result.className = 'payment-result err'; }
  }finally{ setButtonLoading(btn, false); }
}

async function saveEmailPreferences(){
  if (!state.user || !state.authToken){ toast('Connecte-toi d’abord'); return; }
  const marketingEmailOptIn = Boolean($('#accountMarketingEmailOptIn')?.checked);
  const btn = $('#saveEmailPreferencesBtn');
  const result = $('#emailPreferencesResult');
  setButtonLoading(btn, true, 'Enregistrement...');
  try{
    const data = await apiPatch('/api/profile/email-preferences', { marketingEmailOptIn });
    if (data.user) state.user = { ...state.user, ...data.user };
    save();
    if (result){ result.textContent = marketingEmailOptIn ? 'Nouveautés activées ✅' : 'Nouveautés désactivées.'; result.className = 'payment-result ok'; }
  }catch(err){
    if (result){ result.textContent = err.message || 'Enregistrement impossible.'; result.className = 'payment-result err'; }
  }finally{ setButtonLoading(btn, false); }
}

async function loginUser(){
  const isRegister = authMode !== 'login';
  const phone = normalizePhone($('#authPhone')?.value);
  const pin = String($('#authPin')?.value || '').replace(/\D/g, '');
  const firstName = ($('#firstName')?.value || '').trim();
  const lastName = ($('#lastName')?.value || '').trim();
  const email = ($('#authEmail')?.value || '').trim().toLowerCase();
  const marketingEmailOptIn = isRegister && Boolean($('#marketingEmailOptIn')?.checked);
  const avatarData = isRegister ? (pendingAvatarData || '') : '';

  if (isRegister){
    if (firstName.length < 2){ toast('Entre ton prénom'); return; }
    if (lastName.length < 2){ toast('Entre ton nom'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast('Entre ton adresse e-mail'); return; }
  }
  if (phone.length !== 8){ toast('Numéro invalide — 8 chiffres attendus'); return; }
  if (pin.length < 4){ toast('Code PIN : 4 chiffres minimum'); return; }

  const btn = $('#authSubmitBtn');
  setButtonLoading(btn, true, isRegister ? 'Création...' : 'Connexion...');
  try{
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    const data = await apiPost(endpoint, { phone: fullPhone(phone), pin, firstName, lastName, email, avatarData, marketingEmailOptIn });
    applyRemoteSession(data, phone);
    if (avatarData && state.user) saveAvatarForPhone(state.user.phone, avatarData);
    const greetingText = isRegister ? `Bienvenue cher candidat ${displayUserName()}` : `Bon retour ${displayUserName()}`;
    state.sessionGreeting = {
      text:greetingText,
      sub:isRegister ? 'Ton espace personnel est prêt. Bonne préparation !' : 'Heureux de te revoir. Reprends ta préparation là où tu t’es arrêté.'
    };
    pendingAvatarData = '';
    renderAccount();
    loadSupabaseQuestions().then(()=>renderFormations(currentFormFilter));
    toast(greetingText + ' ✅');
    setButtonLoading(btn, false);
    const go = (nextAfterLogin && nextAfterLogin !== 'home') ? nextAfterLogin : 'account';
    nextAfterLogin = 'home';
    show(go);
    return;
  }catch(err){
    if (!shouldUseLocalFallback(err)){
      toast(err.message || 'Connexion impossible');
      setButtonLoading(btn, false);
      return;
    }
  }

  // Fallback local si le service distant est indisponible.
  if (!isRegister && state.user?.phone === phone && state.user?.pin && state.user.pin !== pin){
    toast('Code PIN incorrect');
    setButtonLoading(btn, false);
    return;
  }
  const previous = (!isRegister && state.user?.phone === phone) ? state.user : {};
  const createdAt = previous.createdAt || state.user?.createdAt || new Date().toISOString();
  state.user = {
    ...previous,
    phone,
    pin,
    firstName: isRegister ? firstName : (previous.firstName || ''),
    lastName: isRegister ? lastName : (previous.lastName || ''),
    displayName: isRegister ? `${firstName} ${lastName}`.trim() : (previous.displayName || ''),
    email: isRegister ? email : (previous.email || ''),
    marketingEmailOptIn:isRegister ? marketingEmailOptIn : Boolean(previous.marketingEmailOptIn),
    avatarData: avatarData || previous.avatarData || (phone && state.profileAvatars?.[phone]) || '',
    createdAt,
    lastLoginAt:new Date().toISOString()
  };
  state.phoneSaved = true;
  if (state.user.avatarData) saveAvatarForPhone(phone, state.user.avatarData);
  const greetingText = isRegister ? `Bienvenue cher candidat ${displayUserName()}` : `Bon retour ${displayUserName()}`;
  state.sessionGreeting = {
    text:greetingText,
    sub:isRegister ? 'Ton espace personnel est prêt. Bonne préparation !' : 'Heureux de te revoir. Reprends ta préparation là où tu t’es arrêté.'
  };
  save();
  pendingAvatarData = '';
  renderAccount();
  loadSupabaseQuestions().then(()=>renderFormations(currentFormFilter));
  toast(greetingText + ' ✅');
  setButtonLoading(btn, false);
  const go = (nextAfterLogin && nextAfterLogin !== 'home') ? nextAfterLogin : 'account';
  nextAfterLogin = 'home';
  show(go);
}

function logoutUser(){
  if (state.authToken) apiPost('/api/auth/logout', {}).catch(()=>{});
  state.user = null;
  state.subscription = {status:'free', expiresAt:null};
  state.pendingPayment = null;
  state.authToken = null;
  state.authExpiresAt = null;
  save();
  if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type:'CLEAR_DATA_CACHE' });
  renderAccount();
  toast('Compte déconnecté');
  show('home');
}


/* ---------- administration ---------- */
let adminQuestionCache = [];
let adminQuestionSelectedIds = new Set();
let showAdminQuestionHistory = false;
let adminResourceCache = [];
let showAdminResourceHistory = false;
let adminNewsCache = [];
let adminRevisionCache = [];
let revisionRemoteFiches = [];
let aiDraftCache = [];
let aiDraftSelectedIndexes = new Set();
let aiDraftEditingIndex = -1;
let aiDailyDraftCache = [];
let showPublishedDailyDrafts = false;
let currentDailyPdfIndex = -1;
let currentDailyPdfUrl = '';
let dailyQuestionEditorDraft = [];
let dailyQuestionEditorOpen = false;
let dailyQuestionEditorDirty = false;
let aiNewsDraftCache = [];
let pastedQcmPreviewCache = null;
let pastedQcmPreviewSignature = '';
let pastedQcmPdfCache = null;
let pastedQcmPdfUrl = '';
let resourceCache = [];
let newsCache = [];
let publishedQcmCache = [];
let publishedQcmLoadedAt = 0;
let currentModuleQcm = { title:'Formation', category:'Culture générale', level:'', image:'img/subject-culture.svg' };
let currentNewsFilter = 'Tout';
let currentPublishedQcmFilter = 'all';
let currentRevisionFilter = 'Tout';
let currentScreenId = 'home';
let quizReturnScreen = 'home';
let adminQuestionFilter = 'all';
let adminTab = 'create';

async function adminFetch(path, options = {}){
  const res = await fetchWithTimeout(path, {
    ...options,
    headers: authHeaders({'Content-Type':'application/json', ...(options.headers || {})})
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok){
    const err = new Error(data.message || 'Action administrateur impossible');
    err.status = res.status;
    throw err;
  }
  return data;
}

function setPublicationPreview(id, block, category, premium){
  const target = $(id);
  if (!target) return;
  target.innerHTML = `<b>Publié dans :</b><span>${escapeHtml(block)} → ${escapeHtml(category || 'Catégorie à choisir')} → ${premium ? 'Premium' : 'Gratuit'}</span>`;
}

function updateAdminPublicationPreviews(){
  setPublicationPreview('#adminQcmDestinationPreview', 'Formations / Nouveaux QCM', $('#adminCategory')?.value, Boolean($('#adminPremium')?.checked));
  const pastedPremium = document.querySelector('input[name="pastedQcmDestination"]:checked')?.value === 'premium';
  setPublicationPreview('#pastedQcmDestinationPreview', 'Formations / Nouveaux QCM', $('#pastedQcmCategory')?.value, pastedPremium);
  const revisionTarget = $('#adminRevisionDestinationPreview');
  if (revisionTarget){
    const parts = [
      'Fiches de révision',
      $('#adminRevisionContentType')?.value || 'Fiche de révision',
      $('#adminRevisionCompetitionType')?.value || 'Concours direct',
      $('#adminRevisionCategory')?.value || 'Catégorie à choisir',
      $('#adminRevisionLevel')?.value || 'Tous niveaux',
      $('#adminRevisionPremium')?.checked ? 'Premium' : 'Gratuit'
    ];
    revisionTarget.innerHTML = `<b>Publié dans :</b><span>${parts.map(escapeHtml).join(' → ')}</span>`;
  }
  setPublicationPreview('#adminResourceDestinationPreview', 'Documents & fichiers', $('#adminResourceCategory')?.value, Boolean($('#adminResourcePremium')?.checked));
  setPublicationPreview('#aiDailyDestinationPreview', 'Formations / Nouveaux QCM', $('#aiDailyCategory')?.value, Boolean($('#aiDailyPremium')?.checked));
  setPublicationPreview('#aiDestinationPreview', 'Formations / Nouveaux QCM', $('#aiCategory')?.value, Boolean($('#aiPremium')?.checked));
  setPublicationPreview('#dailyPublishDestinationPreview', 'Formations / Nouveaux QCM', $('#dailyPublishCategory')?.value, Boolean($('#dailyPublishPremium')?.checked));
}

function setAdminTab(tab){
  adminTab = tab || 'create';
  $('#adminCreatePane') && ($('#adminCreatePane').style.display = adminTab === 'create' ? 'block' : 'none');
  $('#adminPastePane') && ($('#adminPastePane').style.display = adminTab === 'paste' ? 'block' : 'none');
  $('#adminListPane') && ($('#adminListPane').style.display = adminTab === 'list' ? 'block' : 'none');
  $('#adminRevisionPane') && ($('#adminRevisionPane').style.display = adminTab === 'revision' ? 'block' : 'none');
  $('#adminResourcesPane') && ($('#adminResourcesPane').style.display = adminTab === 'resources' ? 'block' : 'none');
  $('#adminNewsPane') && ($('#adminNewsPane').style.display = adminTab === 'news' ? 'block' : 'none');
  $('#adminAiPane') && ($('#adminAiPane').style.display = adminTab === 'ai' ? 'block' : 'none');
  $('#adminNotificationsPane') && ($('#adminNotificationsPane').style.display = adminTab === 'notifications' ? 'block' : 'none');
  $('#adminTabCreate')?.classList.toggle('on', adminTab === 'create');
  $('#adminTabPaste')?.classList.toggle('on', adminTab === 'paste');
  $('#adminTabList')?.classList.toggle('on', adminTab === 'list');
  $('#adminTabRevision')?.classList.toggle('on', adminTab === 'revision');
  $('#adminTabResources')?.classList.toggle('on', adminTab === 'resources');
  $('#adminTabNews')?.classList.toggle('on', adminTab === 'news');
  $('#adminTabAi')?.classList.toggle('on', adminTab === 'ai');
  $('#adminTabNotifications')?.classList.toggle('on', adminTab === 'notifications');
  if (adminTab === 'paste') initializePastedQcmTool();
  if (adminTab === 'list') loadAdminQuestions();
  if (adminTab === 'revision') loadAdminRevisionFiches();
  if (adminTab === 'resources') loadAdminResources();
  if (adminTab === 'news') loadAdminNews();
  if (adminTab === 'ai') loadAiStatus();
  if (adminTab === 'notifications'){
    loadAdminNotificationStatus();
    loadAdminEmailCampaigns();
  }
  updateAdminPublicationPreviews();
}

async function ensureAdminAccess(){
  if (!state.user){ openAuth('login'); return false; }
  if (isAdmin()) return true;
  try{
    const data = await adminFetch('/api/admin/me');
    if (data.user){
      state.user = {...state.user, ...data.user, isAdmin:Boolean(data.user.isAdmin)};
      save();
      renderAccount();
      return isAdmin();
    }
  }catch(err){
    toast('Accès admin non autorisé');
    show('account');
    return false;
  }
  return false;
}

async function renderAdminPanel(force){
  const ok = await ensureAdminAccess();
  if (!ok) return;
  if (force) toast('Espace admin actualisé');
  try{
    const summary = await adminFetch('/api/admin/summary');
    const stats = $('#adminStats');
    if (stats){
      stats.innerHTML = `
        <div><b>${formatQcmCount(summary.localTotal || 0).replace(' QCM','')}</b><span>QCM banque</span></div>
        <div><b>${summary.customCount || 0}</b><span>Ajouts admin</span></div>
        <div><b>Actif</b><span>Admin</span></div>`;
    }
  }catch(err){
    $('#adminResult') && ($('#adminResult').innerHTML = `<div class="pay-note error">${err.message}</div>`);
  }
  setAdminTab(adminTab || 'create');
}

function defaultQcmPublicationName(){
  return 'Nouveau QCM du ' + formatDate(new Date().toISOString());
}

function adminFormPayload(){
  return {
    id: $('#adminQuestionId')?.value || '',
    category: $('#adminCategory')?.value || 'Culture générale',
    level: $('#adminLevel')?.value || 'BEPC',
    question_text: $('#adminQuestionText')?.value || '',
    options: [$('#adminOptionA')?.value || '', $('#adminOptionB')?.value || '', $('#adminOptionC')?.value || '', $('#adminOptionD')?.value || ''],
    correct_answer: Number($('#adminCorrect')?.value || 0),
    explanation: $('#adminExplanation')?.value || '',
    source: $('#adminSource')?.value || defaultQcmPublicationName(),
    is_premium: Boolean($('#adminPremium')?.checked),
    is_active: true,
    admin_visible: false
  };
}

async function saveAdminQuestion(){
  const result = $('#adminResult');
  const btn = $('#adminSaveBtn');
  setButtonLoading(btn, true, 'Publication...');
  try{
    const payload = adminFormPayload();
    const id = payload.id;
    if (!id && aiDraftEditingIndex >= 0 && aiDraftCache[aiDraftEditingIndex]){
      const editIndex = aiDraftEditingIndex;
      const original = aiDraftCache[editIndex];
      const candidate = {
        ...original,
        ...payload,
        option_a:payload.options[0],
        option_b:payload.options[1],
        option_c:payload.options[2],
        option_d:payload.options[3],
        verification_status:'stale',
        verification_score:0,
        verification_reason:'Question modifiée : nouveau contrôle factuel requis.',
        verified_fingerprint:''
      };
      const checked = await adminFetch('/api/admin/ai/qcm/verify', {
        method:'POST',
        body:JSON.stringify({ category:payload.category, level:payload.level, theme:payload.source, questions:[candidate] })
      });
      const verifiedQuestion = checked.questions?.[0];
      if (!verifiedQuestion) throw new Error('Le vérificateur n’a retourné aucun résultat.');
      aiDraftCache[editIndex] = { ...verifiedQuestion, source:payload.source, is_premium:payload.is_premium, is_active:true, _published:false };
      const publishable = verifiedQuestion.verification_status === 'verified';
      resetAdminForm(false);
      setAdminTab('ai');
      renderAiDrafts();
      const aiResult = $('#aiResult');
      if (aiResult) aiResult.innerHTML = `<div class="pay-note ${publishable ? 'success' : 'warn'}">${publishable ? 'Correction vérifiée. Le QCM peut être publié ✅' : 'Correction enregistrée mais non validée. Modifie-la ou régénère la question.'}</div>`;
      toast(publishable ? 'Correction vérifiée ✅' : 'Question bloquée par la vérification');
      return;
    }
    const method = id ? 'PATCH' : 'POST';
    const url = id ? '/api/admin/questions/' + encodeURIComponent(id) : '/api/admin/questions';
    const data = await adminFetch(url, { method, body:JSON.stringify(payload) });
    const savedId = data.question?.id || id;
    if (savedId) await adminFetch('/api/admin/questions/' + encodeURIComponent(savedId) + '/status', { method:'PATCH', body:JSON.stringify({ is_active:Boolean(payload.admin_visible) }) });
    const destination = payload.is_premium ? 'Premium abonnés' : 'Gratuit tous les candidats';
    if (result) result.innerHTML = `<div class="pay-note success">QCM publié dans <b>${destination}</b> ✅<br>Il apparaît dans <b>Nouveaux QCM</b> et dans le module <b>${escapeHtml(payload.category)}</b>.<br>Il reste rangé dans <b>Voir historique publié</b>.<br><button class="mini-btn" onclick="openPublishedQcmFromAdmin()" style="margin-top:8px">Ouvrir les Nouveaux QCM</button></div>`;
    resetAdminForm(false);
    await loadAdminQuestions();
    await Promise.allSettled([loadSupabaseQuestions(), fetchPublishedQcmPublications(true)]);
    renderFormations(currentFormFilter);
    toast('QCM ajouté dans ' + destination + ' ✅');
  }catch(err){
    if (result) result.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }finally{
    setButtonLoading(btn, false);
  }
}

function resetAdminForm(clearMessage = true){
  aiDraftEditingIndex = -1;
  ['adminQuestionId','adminQuestionText','adminOptionA','adminOptionB','adminOptionC','adminOptionD','adminExplanation','adminSource'].forEach(id=>{ const el=$('#'+id); if (el) el.value=''; });
  $('#adminCorrect') && ($('#adminCorrect').value='0');
  $('#adminPremium') && ($('#adminPremium').checked=false);
  $('#adminActive') && ($('#adminActive').checked=true);
  $('#adminFormTitle') && ($('#adminFormTitle').textContent='Nouveau QCM');
  const saveBtn = $('#adminSaveBtn');
  if (saveBtn){ saveBtn.textContent='Publier le QCM'; delete saveBtn.dataset.label; }
  if (clearMessage && $('#adminResult')) $('#adminResult').innerHTML='';
}


function initializePastedQcmTool(){
  const dateInput = $('#pastedQcmDate');
  if (dateInput && !dateInput.value) dateInput.value = today();
  refreshPastedQcmCategoryOptions();
}

function pastedQcmPayload(){
  return {
    title:($('#pastedQcmTitle')?.value || '').trim(),
    date:$('#pastedQcmDate')?.value || today(),
    category:$('#pastedQcmCategory')?.value || 'Culture générale',
    level:$('#pastedQcmLevel')?.value || 'Concours',
    pdf_theme:$('#pastedQcmPdfTheme')?.value || 'montserrat-concours',
    is_premium:$('input[name="pastedQcmDestination"]:checked')?.value === 'premium',
    text:$('#pastedQcmText')?.value || ''
  };
}

function pastedQcmContentSignature(payload = pastedQcmPayload()){
  const { is_premium:_destination, pdf_theme:_design, ...content } = payload || {};
  return JSON.stringify(content);
}

function clearPastedQcmPdfPreview(){
  if (pastedQcmPdfUrl) URL.revokeObjectURL(pastedQcmPdfUrl);
  pastedQcmPdfUrl = '';
  pastedQcmPdfCache = null;
  const preview = $('#pastedQcmPdfPreview');
  const publishBtn = $('#pastedQcmPdfPublishBtn');
  const openBtn = $('#pastedQcmPdfOpenBtn');
  const downloadBtn = $('#pastedQcmPdfDownloadBtn');
  if (preview) preview.innerHTML = '';
  if (publishBtn) publishBtn.style.display = 'none';
  if (openBtn) openBtn.style.display = 'none';
  if (downloadBtn) downloadBtn.style.display = 'none';
}

function updatePastedQcmDestinationButtons(){
  const premium = pastedQcmPayload().is_premium;
  const destination = premium ? 'Premium payant' : 'Gratuit';
  const quizBtn = $('#pastedQcmPublishBtn');
  const pdfBtn = $('#pastedQcmPdfPublishBtn');
  const previewQuestions = Array.isArray(pastedQcmPreviewCache?.questions) ? pastedQcmPreviewCache.questions : [];
  const ready = Number(pastedQcmPreviewCache?.ready || previewQuestions.length || 0);
  const hasMultipleAnswers = previewQuestions.some(q => Array.isArray(q?.correct_answers) && q.correct_answers.length > 1);
  if (quizBtn){
    quizBtn.style.display = ready && !hasMultipleAnswers ? 'block' : 'none';
    if (ready && !hasMultipleAnswers) quizBtn.textContent = `Publier ${ready} QCM dans ${destination}`;
  }
  if (pdfBtn && pastedQcmPdfCache) pdfBtn.textContent = `Publier le livre PDF dans ${destination}`;
  updateAdminPublicationPreviews();
}

function renderPastedQcmPreview(data){
  const wrap = $('#pastedQcmPreview');
  const publishBtn = $('#pastedQcmPublishBtn');
  const pdfBtn = $('#pastedQcmPdfBtn');
  if (!wrap || !publishBtn || !pdfBtn) return;
  const questions = Array.isArray(data?.questions) ? data.questions : [];
  const rejected = Array.isArray(data?.rejected) ? data.rejected : [];
  const hasMultipleAnswers = questions.some(q => Array.isArray(q?.correct_answers) && q.correct_answers.length > 1);
  publishBtn.style.display = questions.length && !hasMultipleAnswers ? 'block' : 'none';
  pdfBtn.style.display = 'block';
  const destination = pastedQcmPayload().is_premium ? 'Premium payant' : 'Gratuit';
  if (!hasMultipleAnswers) publishBtn.textContent = `Publier ${questions.length} QCM dans ${destination}`;
  const readyHtml = questions.length ? `
    <div class="admin-paste-section-head ready"><b>${questions.length} QCM prêt${questions.length>1?'s':''}</b><span>${hasMultipleAnswers ? 'Toutes les bonnes réponses sont conservées.' : 'Prêt à utiliser.'}</span></div>
    ${questions.map((q, index)=>{
      const answerIndexes = Array.isArray(q?.correct_answers) && q.correct_answers.length ? q.correct_answers : [q.correct_answer];
      const normalizedAnswerIndexes = [...new Set(answerIndexes.map(Number).filter(value => value >= 0 && value <= 3))];
      const answerLabels = normalizedAnswerIndexes.map(value => ['A','B','C','D'][value]);
      const answer = answerLabels.length > 2 ? `${answerLabels.slice(0,-1).join(', ')} et ${answerLabels.at(-1)}` : (answerLabels.join(' et ') || '?');
      const multipleAnswers = normalizedAnswerIndexes.length > 1;
      const options = [q.option_a,q.option_b,q.option_c,q.option_d].filter(option => String(option || '').trim());
      const optionsHtml = options.map((option, optionIndex)=>`<p><b>${'ABCD'[optionIndex]}.</b> ${renderMathText(option)}</p>`).join('');
      return `<details class="admin-q-item admin-paste-preview-card" ${index < 2 ? 'open' : ''}>
        <summary><b>QCM ${escapeHtml(q.import_number || index + 1)}</b><span>${renderMathText(q.question_text || '')}</span></summary>
        <div class="admin-paste-preview-body">
          ${optionsHtml}
          <div class="admin-paste-correction"><b>${multipleAnswers ? 'Bonnes réponses' : 'Bonne réponse'} : ${answer}</b><span>${renderMathText(q.explanation || '')}</span></div>
        </div>
      </details>`;
    }).join('')}` : '';
  const rejectedHtml = rejected.length ? `
    <div class="admin-paste-section-head blocked"><b>⚠️ ${rejected.length} QCM bloqué${rejected.length>1?'s':''}</b><span>Corrige le texte puis relance l’analyse</span></div>
    ${rejected.map(row=>`<div class="admin-q-item admin-paste-rejected">
      <div class="admin-q-meta"><span>QCM ${escapeHtml(row.number || '?')}</span><span>Non publié</span></div>
      <h4>${renderMathText(row.question || 'Question non reconnue')}</h4>
      <p>${escapeHtml(row.reason || 'Format incomplet')}</p>
    </div>`).join('')}` : '';
  wrap.innerHTML = readyHtml + rejectedHtml || '<div class="empty">Aucun QCM détecté.</div>';
}

async function analyzePastedQcm(){
  const btn = $('#pastedQcmAnalyzeBtn');
  const result = $('#pastedQcmResult');
  const preview = $('#pastedQcmPreview');
  const publishBtn = $('#pastedQcmPublishBtn');
  const pdfBtn = $('#pastedQcmPdfBtn');
  setButtonLoading(btn, true, 'Transformation...');
  clearPastedQcmPdfPreview();
  pastedQcmPreviewCache = null;
  pastedQcmPreviewSignature = '';
  if (publishBtn) publishBtn.style.display = 'none';
  if (pdfBtn) pdfBtn.style.display = 'block';
  if (preview) preview.innerHTML = '<div class="empty">Lecture et mise au propre des QCM...</div>';
  if (result) result.innerHTML = '<div class="pay-note">Aucune publication pendant cette étape : tu pourras relire le résultat avant de valider.</div>';
  try{
    refreshPastedQcmCategoryOptions();
    const payload = pastedQcmPayload();
    const compatibleCategories = DAILY_LEVEL_CATEGORY_RULES[normalizeDailyLevel(payload.level)] || ALL_QCM_CATEGORIES;
    if (!compatibleCategories.includes(payload.category)) throw new Error(`La catégorie « ${payload.category} » n’est pas compatible avec le niveau ${payload.level}. Choisis une autre catégorie ou un autre niveau.`);
    const data = await adminFetch('/api/admin/questions/import/preview', { method:'POST', body:JSON.stringify(payload) });
    pastedQcmPreviewCache = data;
    pastedQcmPreviewSignature = pastedQcmContentSignature();
    const blocked = Number(data.rejected?.length || 0);
    const ready = Number(data.ready || data.questions?.length || 0);
    const multipleAnswerCount = (Array.isArray(data.questions) ? data.questions : []).filter(q => Array.isArray(q?.correct_answers) && q.correct_answers.length > 1).length;
    if (result){
      result.innerHTML = `<div class="pay-note ${ready ? 'success' : 'error'}"><b>${ready} QCM prêt${ready>1?'s':''}</b>${blocked ? `<br>${blocked} question${blocked>1?'s':''} à revoir.` : '<br>Tout est prêt.'}${multipleAnswerCount ? `<br>Les bonnes réponses multiples sont conservées.` : ''}</div>`;
    }
    renderPastedQcmPreview(data);
    return data;
  }catch(err){
    if (result) result.innerHTML = `<div class="pay-note error">${escapeHtml(err.message)}</div>`;
    if (preview) preview.innerHTML = '';
    return null;
  }finally{
    setButtonLoading(btn, false);
  }
}


function pastedQcmPdfThemeLabel(theme){
  return ({
    'montserrat-concours':'Concours',
    'open-sans-epure':'Épuré',
    'roboto-classique':'Classique',
    'tinos-examen':'Examen'
  })[String(theme || '')] || 'Concours';
}

function pastedQcmPdfFileName(title, date){
  const clean = String(title || 'Cahier-QCM')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'Cahier-QCM';
  return `${clean}-${date || today()}.pdf`;
}

async function downloadPastedQcmBookPdf(){
  const btn = $('#pastedQcmPdfBtn');
  const result = $('#pastedQcmResult');
  const qcmPreview = $('#pastedQcmPreview');
  const quizPublishBtn = $('#pastedQcmPublishBtn');
  const pdfPreview = $('#pastedQcmPdfPreview');
  const pdfPublishBtn = $('#pastedQcmPdfPublishBtn');
  const pdfOpenBtn = $('#pastedQcmPdfOpenBtn');
  const pdfDownloadBtn = $('#pastedQcmPdfDownloadBtn');
  setButtonLoading(btn, true, 'Création du livre PDF...');
  clearPastedQcmPdfPreview();
  if (qcmPreview) qcmPreview.innerHTML = '';
  if (quizPublishBtn) quizPublishBtn.style.display = 'none';
  if (result) result.innerHTML = '<div class="pay-note">Création du livre PDF pour prévisualisation. Aucun téléchargement et aucune publication automatiques.</div>';
  try{
    const formPayload = pastedQcmPayload();
    const contentSignature = pastedQcmContentSignature(formPayload);
    // Le PDF repart toujours du texte complet. La prévisualisation du quiz peut
    // écarter les réponses multiples ou « aucune des propositions », alors que
    // le livre doit conserver chaque QCM collé par l’administrateur.
    const ready = Number(pastedQcmPreviewCache?.ready || pastedQcmPreviewCache?.questions?.length || 0);
    const payload = formPayload;
    const res = await fetchWithTimeout('/api/admin/questions/import/pdf', {
      method:'POST',
      headers:authHeaders({ 'Content-Type':'application/json' }),
      body:JSON.stringify(payload)
    }, 90000);
    if (!res.ok){
      const data = await res.json().catch(()=>({}));
      throw new Error(data.message || 'Création du PDF impossible');
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const encodedName = (disposition.match(/filename\*=UTF-8''([^;]+)/i) || [])[1];
    const fileName = encodedName ? decodeURIComponent(encodedName) : pastedQcmPdfFileName(formPayload.title, formPayload.date);
    const count = Number(res.headers.get('X-QCM-Count') || ready);
    const rejected = Number(res.headers.get('X-QCM-Rejected') || 0);
    pastedQcmPdfUrl = URL.createObjectURL(blob);
    pastedQcmPdfCache = {
      blob,
      fileName,
      count,
      rejected,
      signature:contentSignature,
      metadata:{ ...formPayload }
    };
    if (pdfPreview){
      pdfPreview.innerHTML = `<div class="admin-pdf-ready-card">
        <div class="admin-pdf-book-cover" aria-hidden="true"><span>RÉUSSITE<br>CONCOURS BF</span><b>${count} QCM</b><small>LIVRE CORRIGÉ</small></div>
        <div class="admin-pdf-ready-info"><b>${escapeHtml(formPayload.title || 'Livre PDF')}</b><span>${count} QCM · ${escapeHtml(pastedQcmPdfThemeLabel(formPayload.pdf_theme))}</span></div>
      </div>`;
    }
    if (pdfPublishBtn) pdfPublishBtn.style.display = 'block';
    if (pdfOpenBtn) pdfOpenBtn.style.display = 'block';
    if (pdfDownloadBtn) pdfDownloadBtn.style.display = 'block';
    updatePastedQcmDestinationButtons();
    const destination = formPayload.is_premium ? 'Premium payant' : 'Gratuit';
    if (result){
      result.innerHTML = `<div class="pay-note success"><b>Livre prêt : ${count} QCM</b><br>${destination}.<br>Toutes les questions sont incluses.</div>`;
    }
    toast('Livre PDF prêt à prévisualiser');
  }catch(err){
    clearPastedQcmPdfPreview();
    if (result) result.innerHTML = `<div class="pay-note error">${escapeHtml(err.message)}</div>`;
  }finally{
    setButtonLoading(btn, false);
  }
}

function openPreparedPastedQcmPdf(){
  if (!pastedQcmPdfCache?.blob) return toast('Crée d’abord le livre PDF.');
  if (pastedQcmPdfCache.signature !== pastedQcmContentSignature()) return toast('Le contenu a changé : recrée le PDF avant de l’ouvrir.');
  openPdfReader(pastedQcmPdfCache.blob, pastedQcmPdfCache.metadata?.title || 'Livre de QCM corrigés');
}

function downloadPreparedPastedQcmPdf(){
  if (!pastedQcmPdfCache || !pastedQcmPdfUrl) return toast('Crée d’abord le livre PDF.');
  if (pastedQcmPdfCache.signature !== pastedQcmContentSignature()) return toast('Le contenu a changé : recrée le PDF avant de le télécharger.');
  const link = document.createElement('a');
  link.href = pastedQcmPdfUrl;
  link.download = pastedQcmPdfCache.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  toast('Téléchargement du PDF lancé ✅');
}

async function publishPreparedPastedQcmPdf(){
  const cache = pastedQcmPdfCache;
  if (!cache?.blob) return toast('Crée d’abord le livre PDF.');
  if (cache.signature !== pastedQcmContentSignature()) return toast('Le contenu a changé : recrée le PDF avant de le publier.');
  const payload = pastedQcmPayload();
  const destination = payload.is_premium ? 'Premium payant' : 'Gratuit';
  if (!confirm(`Publier maintenant ce livre PDF dans ${destination} ?`)) return;
  const btn = $('#pastedQcmPdfPublishBtn');
  const result = $('#pastedQcmResult');
  setButtonLoading(btn, true, 'Publication du PDF...');
  try{
    const description = `Livre de ${cache.count} QCM corrigés · ${payload.level} · ${payload.category} · ${payload.date}`;
    const headers = authHeaders({
      'Content-Type':'application/pdf',
      'X-File-Name':encodeURIComponent(cache.fileName || pastedQcmPdfFileName(payload.title, payload.date)),
      'X-Title':encodeURIComponent(payload.title || 'Livre de QCM corrigés'),
      'X-Category':encodeURIComponent(payload.category || 'Documents'),
      'X-Description':encodeURIComponent(description),
      'X-Is-Premium':String(Boolean(payload.is_premium)),
      'X-Is-Active':'true',
      'X-Admin-Archived':'true'
    });
    const res = await fetchWithTimeout('/api/admin/resources/upload', { method:'POST', headers, body:cache.blob }, 90000);
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Publication du PDF impossible');
    if (btn) btn.style.display = 'none';
    if (result){
      result.innerHTML = `<div class="pay-note success"><b>Livre PDF publié dans ${destination}</b><br>Il est maintenant disponible dans Documents & fichiers pour les candidats.${payload.is_premium ? ' Son ouverture reste réservée aux abonnés.' : ' Il est accessible gratuitement.'}</div>`;
    }
    await Promise.allSettled([loadAdminResources(), loadResources()]);
    toast('Livre PDF publié');
  }catch(err){
    if (result) result.innerHTML = `<div class="pay-note error">${escapeHtml(err.message)}</div>`;
  }finally{
    setButtonLoading(btn, false);
  }
}

async function publishPastedQcm(){
  const ready = Number(pastedQcmPreviewCache?.ready || pastedQcmPreviewCache?.questions?.length || 0);
  if (!ready) return toast('Transforme et prévisualise d’abord les QCM.');
  if (pastedQcmPreviewSignature !== pastedQcmContentSignature()) return toast('Le contenu a changé : relance la prévisualisation avant de publier.');
  const chosenDestination = pastedQcmPayload().is_premium ? 'Premium payant' : 'Gratuit';
  if (!confirm(`Publier maintenant ${ready} QCM dans ${chosenDestination} ?`)) return;
  const btn = $('#pastedQcmPublishBtn');
  const result = $('#pastedQcmResult');
  setButtonLoading(btn, true, 'Publication...');
  try{
    const data = await adminFetch('/api/admin/questions/import/publish', { method:'POST', body:JSON.stringify(pastedQcmPayload()) });
    const destination = data.metadata?.is_premium ? 'Premium abonnés' : 'Gratuit tous les candidats';
    const blocked = Number(data.rejected?.length || 0);
    if (result){
      result.innerHTML = `<div class="pay-note success"><b>${data.published || 0} QCM publiés dans ${destination}</b><br>Ils sont regroupés sous « ${escapeHtml(data.metadata?.title || 'Nouveau QCM')} », avec la date et le module choisis.<br>Ils apparaissent dans <b>Nouveaux QCM</b> et dans le module <b>${escapeHtml(data.metadata?.category || pastedQcmPayload().category)}</b>.${blocked ? `<br>${blocked} question${blocked>1?'s':''} à revoir.` : ''}<br><button class="mini-btn" onclick="openPublishedQcmFromAdmin('${data.metadata?.is_premium ? 'premium' : 'free'}')" style="margin-top:8px">Ouvrir le quiz dans l’application</button></div>`;
    }
    // On conserve le texte et la prévisualisation afin que l’administrateur
    // puisse encore télécharger le livre PDF après la publication interactive.
    if (btn) btn.style.display = 'none';
    await Promise.allSettled([loadAdminQuestions(), loadSupabaseQuestions(), loadPublishedQcm(data.metadata?.is_premium ? 'premium' : 'free')]);
    renderFormations(currentFormFilter);
    toast(`${data.published || 0} QCM publiés`);
  }catch(err){
    if (result) result.innerHTML = `<div class="pay-note error">${escapeHtml(err.message)}</div>`;
  }finally{
    setButtonLoading(btn, false);
  }
}

function qcmDestinationText(q){
  return q?.is_premium ? 'Premium abonnés' : 'Gratuit tous les candidats';
}

function isAdminQuestionArchived(q){
  return Boolean(q?.admin_archived);
}

function toggleAdminQuestionHistory(){
  showAdminQuestionHistory = !showAdminQuestionHistory;
  adminQuestionSelectedIds.clear();
  renderAdminQuestionListFromCache();
}

function setAdminQuestionFilter(filter, el){
  adminQuestionFilter = filter || 'all';
  adminQuestionSelectedIds.clear();
  $$('#adminQuestionFilterRow .chip').forEach(c=>c.classList.remove('on'));
  if (el) el.classList.add('on');
  renderAdminQuestionListFromCache();
}

function adminQuestionHistoryItems(){
  return adminQuestionCache.map((q, idx)=>({q, idx}));
}

function adminQuestionItemsForFilter(){
  const allItems = showAdminQuestionHistory ? adminQuestionHistoryItems() : [];
  if (adminQuestionFilter === 'free') return allItems.filter(item => !item.q.is_premium);
  if (adminQuestionFilter === 'premium') return allItems.filter(item => item.q.is_premium);
  return allItems;
}

function selectedAdminQuestions(){
  return adminQuestionCache.filter(q => adminQuestionSelectedIds.has(q.id));
}

function renderAdminHistoryButton(count, visible){
  if (!count) return '';
  return `<button class="mini-btn" onclick="toggleAdminQuestionHistory()">${visible ? 'Masquer l’historique publié' : `Voir historique publié (${count})`}</button>`;
}

function renderAdminBulkBar(visibleItems){
  const selectedCount = selectedAdminQuestions().length;
  const visibleIds = (visibleItems || []).map(item => item.q.id).filter(Boolean);
  const allVisibleSelected = visibleIds.length && visibleIds.every(id => adminQuestionSelectedIds.has(id));
  if (!showAdminQuestionHistory) return '';
  return `
    <div class="admin-bulk-bar">
      <label><input type="checkbox" ${allVisibleSelected ? 'checked' : ''} onchange="toggleAdminVisibleSelection(this.checked)"> Sélectionner cette liste</label>
      <span><b>${selectedCount}</b> sélectionné${selectedCount>1?'s':''}</span>
      <button class="mini-btn danger" onclick="bulkAdminQuestions('delete')" ${selectedCount ? '' : 'disabled'}>Supprimer</button>
      ${selectedCount ? '<button class="mini-btn" onclick="clearAdminQuestionSelection()">Annuler</button>' : ''}
    </div>`;
}

function renderAdminQuestionListFromCache(){
  const wrap = $('#adminQuestionList');
  if (!wrap) return;
  adminQuestionSelectedIds = new Set([...adminQuestionSelectedIds].filter(id => adminQuestionCache.some(q => q.id === id)));
  const allItems = adminQuestionHistoryItems();
  const freeItems = allItems.filter(item => !item.q.is_premium);
  const premiumItems = allItems.filter(item => item.q.is_premium);
  const historyCount = allItems.length;
  const summary = $('#adminQuestionSummary');
  if (summary){
    summary.innerHTML = `
      <div><b>${freeItems.length}</b><span>Gratuit</span></div>
      <div><b>${premiumItems.length}</b><span>Premium</span></div>
      <div><b>${historyCount}</b><span>Historique publié</span></div>`;
  }
  const controls = $('#adminQuestionHistoryControls');
  if (controls) controls.innerHTML = renderAdminHistoryButton(historyCount, showAdminQuestionHistory);
  const filterRow = $('#adminQuestionFilterRow');
  if (filterRow) filterRow.style.display = showAdminQuestionHistory ? 'flex' : 'none';
  if (!historyCount){
    wrap.innerHTML = '<div class="empty">Aucun QCM publié pour le moment.</div>';
    return;
  }
  if (!showAdminQuestionHistory){
    wrap.innerHTML = '<div class="empty">Les QCM publiés sont rangés dans l’historique pour garder cet espace léger.</div>';
    return;
  }
  let html = '';
  if (adminQuestionFilter === 'free'){
    html = renderAdminQuestionGroup('QCM gratuits publiés', 'Visibles par tous les candidats.', freeItems, 'free');
  }else if (adminQuestionFilter === 'premium'){
    html = renderAdminQuestionGroup('QCM Premium publiés', 'Visibles par les abonnés Premium.', premiumItems, 'premium');
  }else{
    html = renderAdminQuestionGroup('QCM gratuits publiés', 'Visibles par tous les candidats.', freeItems, 'free')
      + renderAdminQuestionGroup('QCM Premium publiés', 'Visibles par les abonnés Premium.', premiumItems, 'premium');
  }
  const visibleItems = adminQuestionItemsForFilter();
  wrap.innerHTML = renderAdminBulkBar(visibleItems) + (html || '<div class="empty">Aucun QCM dans ce filtre.</div>');
}

function toggleAdminQuestionSelection(id, checked){
  if (checked) adminQuestionSelectedIds.add(id);
  else adminQuestionSelectedIds.delete(id);
  renderAdminQuestionListFromCache();
}

function toggleAdminVisibleSelection(checked){
  adminQuestionItemsForFilter().forEach(({q}) => {
    if (!q.id) return;
    if (checked) adminQuestionSelectedIds.add(q.id);
    else adminQuestionSelectedIds.delete(q.id);
  });
  renderAdminQuestionListFromCache();
}

function clearAdminQuestionSelection(){
  adminQuestionSelectedIds.clear();
  renderAdminQuestionListFromCache();
}

async function bulkAdminQuestions(action){
  const ids = [...adminQuestionSelectedIds];
  if (!ids.length) return toast('Sélectionne au moins un QCM');
  const label = 'supprimer';
  if (action === 'delete' && !confirm(`Supprimer définitivement ${ids.length} QCM sélectionné${ids.length>1?'s':''} ?`)) return;
  try{
    toast(`${ids.length} QCM : ${label}...`);
    let data;
    if (action === 'delete'){
      data = await adminFetch('/api/admin/questions/bulk', { method:'DELETE', body:JSON.stringify({ ids }) });
      if (!Number(data.deleted || 0)) throw new Error('Aucun QCM n’a été supprimé.');
      adminQuestionCache = adminQuestionCache.filter(q => !adminQuestionSelectedIds.has(q.id));
    }else{
      const restoreInAdmin = action === 'publish';
      data = await adminFetch('/api/admin/questions/bulk/status', { method:'PATCH', body:JSON.stringify({ ids, is_active:restoreInAdmin }) });
      if (!Number(data.updated || 0)) throw new Error('Aucun QCM n’a été modifié.');
      const returned = new Map((data.questions || []).map(q => [q.id, q]));
      adminQuestionCache = adminQuestionCache.map(q => returned.get(q.id) || (adminQuestionSelectedIds.has(q.id) ? { ...q, is_active:true, admin_archived:!restoreInAdmin } : q));
    }
    adminQuestionSelectedIds.clear();
    renderAdminQuestionListFromCache();
    toast(`${Number(data.deleted || ids.length)} QCM supprimé${Number(data.deleted || ids.length)>1?'s':''} ✅`);
    setTimeout(()=>Promise.allSettled([loadAdminQuestions(), loadSupabaseQuestions()]).then(()=>renderFormations(currentFormFilter)), 300);
  }catch(err){ toast(err.message); }
}

function renderAdminQuestionCards(items){
  return items.map(({q, idx})=>`
    <div class="admin-q-item ${q.is_premium ? 'premium-zone' : 'free-zone'} ${adminQuestionSelectedIds.has(q.id) ? 'selected' : ''}">
      <label class="admin-select-line">
        <input type="checkbox" ${adminQuestionSelectedIds.has(q.id) ? 'checked' : ''} onchange="toggleAdminQuestionSelection('${escapeHtml(q.id)}', this.checked)">
        <span>Sélectionner</span>
      </label>
      <div class="admin-q-meta">
        <span>${escapeHtml(q.category || 'Catégorie')}</span>
        <span>${escapeHtml(q.level || '')}</span>
        <span class="active">Publié</span>
        ${q.is_premium ? '<span class="premium">Premium abonnés</span>' : '<span class="free">Gratuit</span>'}
      </div>
      <h4>${renderMathText(q.question_text || '')}</h4>
      <p class="admin-destination-note">Nom du QCM : <b>${escapeHtml(q.source || 'Nouveau QCM')}</b> · Date : <b>${escapeHtml(formatDate(q.created_at))}</b></p>
      <p class="admin-destination-note">Accès : <b>${qcmDestinationText(q)}</b></p>
      <div class="admin-q-actions">
        <button class="edit" onclick="openPublishedQcmFromAdmin()">Ouvrir le quiz</button>
        <button class="edit" onclick="editAdminQuestion(${idx})">Modifier</button>
        <button class="delete" onclick="deleteAdminQuestion(${idx})">Supprimer</button>
      </div>
    </div>`).join('');
}

function renderAdminQuestionGroup(title, subtitle, items, tone){
  if (!items.length) return '';
  return `
    <div class="admin-q-group ${tone || ''}">
      <div class="admin-q-group-head"><h4>${title}</h4><span>${items.length} QCM</span></div>
      <p>${subtitle}</p>
      ${renderAdminQuestionCards(items)}
    </div>`;
}

async function loadAdminQuestions(){
  const wrap = $('#adminQuestionList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Chargement des contenus...</div>';
  try{
    const search = encodeURIComponent($('#adminSearch')?.value || '');
    const data = await adminFetch('/api/admin/questions?limit=500&search=' + search);
    adminQuestionCache = data.questions || [];
    renderAdminQuestionListFromCache();
  }catch(err){
    wrap.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }
}

function editAdminQuestion(index){
  aiDraftEditingIndex = -1;
  const q = adminQuestionCache[index];
  if (!q) return;
  setAdminTab('create');
  $('#adminQuestionId') && ($('#adminQuestionId').value=q.id || '');
  $('#adminCategory') && ($('#adminCategory').value=q.category || 'Culture générale');
  $('#adminLevel') && ($('#adminLevel').value=q.level || 'BEPC');
  $('#adminQuestionText') && ($('#adminQuestionText').value=q.question_text || '');
  $('#adminOptionA') && ($('#adminOptionA').value=q.option_a || '');
  $('#adminOptionB') && ($('#adminOptionB').value=q.option_b || '');
  $('#adminOptionC') && ($('#adminOptionC').value=q.option_c || '');
  $('#adminOptionD') && ($('#adminOptionD').value=q.option_d || '');
  $('#adminCorrect') && ($('#adminCorrect').value=String(q.correct_answer ?? 0));
  $('#adminExplanation') && ($('#adminExplanation').value=q.explanation || '');
  $('#adminSource') && ($('#adminSource').value=q.source || 'Ajout administrateur');
  $('#adminPremium') && ($('#adminPremium').checked=Boolean(q.is_premium));
    $('#adminFormTitle') && ($('#adminFormTitle').textContent='Modifier le QCM');
  $('#adminSaveBtn') && ($('#adminSaveBtn').textContent='Enregistrer les modifications');
}

async function toggleAdminQuestion(index){
  const q = adminQuestionCache[index];
  if (!q) return;
  try{
    const restoreInAdmin = isAdminQuestionArchived(q);
    const data = await adminFetch('/api/admin/questions/' + encodeURIComponent(q.id) + '/status', { method:'PATCH', body:JSON.stringify({is_active:restoreInAdmin}) });
    adminQuestionCache[index] = data.question || { ...q, is_active:true, admin_archived:!restoreInAdmin };
    renderAdminQuestionListFromCache();
    setTimeout(()=>Promise.allSettled([loadAdminQuestions(), loadSupabaseQuestions(), fetchPublishedQcmPublications(true)]).then(()=>renderFormations(currentFormFilter)), 250);
    toast(restoreInAdmin ? 'QCM remis dans l’administration ✅' : 'QCM rangé dans l’historique publié ✅');
  }catch(err){ toast(err.message); }
}

async function deleteAdminQuestion(index){
  const q = adminQuestionCache[index];
  if (!q) return;
  if (!confirm('Supprimer définitivement ce QCM ?')) return;
  try{
    toast('Suppression en cours...');
    await adminFetch('/api/admin/questions/' + encodeURIComponent(q.id), { method:'DELETE' });
    adminQuestionCache.splice(index, 1);
    adminQuestionSelectedIds.delete(q.id);
    renderAdminQuestionListFromCache();
    toast('QCM supprimé');
    setTimeout(()=>Promise.allSettled([loadAdminQuestions(), loadSupabaseQuestions()]).then(()=>renderFormations(currentFormFilter)), 250);
  }catch(err){ toast(err.message); }
}


async function loadAiStatus(){
  const wrap = $('#adminAiStatus');
  if (!wrap) return;
  try{
    const data = await adminFetch('/api/admin/ai/status');
    wrap.innerHTML = `
      <div><b>${data.configured ? 'Actif' : 'Non active'}</b><span>Création assistée</span></div>
      <div><b>${data.grounding ? 'Sources' : 'Hors ligne'}</b><span>Recherche factuelle</span></div>
      <div><b>${data.verificationRequired ? `≥ ${Number(data.minimumScore || 90)}/100` : 'Désactivé'}</b><span>Contrôle des preuves</span></div>`;
  }catch(err){
    wrap.innerHTML = `<div><b>Erreur</b><span>${escapeHtml(err.message)}</span></div>`;
  }
  refreshAllAiCategoryOptions();
  loadDailyAiDrafts();
}

async function loadDailyAiDrafts(){
  const status = $('#aiDailyStatus');
  const list = $('#aiDailyDraftList');
  if (!list) return;
  list.innerHTML = '<div class="empty">Chargement des PDF...</div>';
  try{
    const data = await adminFetch('/api/admin/ai/daily');
    aiDailyDraftCache = data.drafts || [];
    if (status){
      status.innerHTML = `
        <div><b>${data.settings?.count || 50}</b><span>QCM / jour</span></div>
        <div><b>${data.configured ? 'Prêt' : 'À configurer'}</b><span>PDF</span></div>
        <div><b>${data.settings?.mode === 'niveau' ? 'Niveau' : 'Module'}</b><span>Rotation</span></div>`;
    }
    refreshDailyCategoryOptions();
    renderDailyAiDrafts();
  }catch(err){
    if (status) status.innerHTML = `<div><b>Erreur</b><span>${escapeHtml(err.message)}</span></div>`;
    list.innerHTML = `<div class="pay-note error">${escapeHtml(err.message)}</div>`;
  }
}

function syncDailyDraftLiveProgress(draft){
  if (!draft?.id) return;
  const index = aiDailyDraftCache.findIndex(row => row.id === draft.id);
  if (index >= 0) aiDailyDraftCache[index] = draft;
  const card = document.querySelector(`[data-daily-draft-id="${CSS.escape(String(draft.id))}"]`);
  if (!card) return;
  const progress = Number(draft.generationProgress || draft.questions?.length || 0);
  const target = Number(draft.generationTarget || 50);
  const badge = card.querySelector('[data-daily-progress-badge]');
  const count = card.querySelector('[data-daily-progress-count]');
  if (badge) badge.textContent = `Préparation ${progress}/${target}`;
  if (count) count.textContent = `${progress}/${target}`;
}

async function continueDailyAiGeneration(draft, result){
  let current = draft;
  let failedBatches = 0;
  let rejectedRounds = 0;
  for (let attempt = 0; current?.generating && attempt < 120; attempt++){
    const progress = Number(current.generationProgress || current.questions?.length || 0);
    const target = Number(current.generationTarget || 50);
    const wasVerification = current.generationPhase === 'verification';
    const phase = wasVerification ? 'Contrôle des questions' : 'Préparation des questions';
    if (result) result.innerHTML = `<div class="pay-note">${phase} : <b>${progress}/${target} QCM validés</b>. La progression est enregistrée automatiquement.</div>`;
    try{
      const recoveryDraft = {
        id:current.id,
        date:current.date,
        title:current.title,
        category:current.category,
        level:current.level,
        is_premium:Boolean(current.is_premium),
        generationTarget:target,
        model:current.model || '',
        verificationModel:current.verificationModel || '',
        created_at:current.created_at || '',
        questions:Array.isArray(current.questions) ? current.questions : []
      };
      const batch = await adminFetch('/api/admin/ai/daily/' + encodeURIComponent(current.id) + '/generate-batch', {
        method:'POST',
        body:JSON.stringify({ draft:recoveryDraft })
      });
      current = batch.draft;
      syncDailyDraftLiveProgress(current);
      const nextProgress = Number(current?.generationProgress || current?.questions?.length || 0);
      if (wasVerification){
        rejectedRounds = nextProgress > progress ? 0 : rejectedRounds + 1;
        if (rejectedRounds >= 3){
          throw new Error(`Trois contrôles successifs n’ont ajouté aucun QCM conforme. La préparation est arrêtée à ${nextProgress}/${target}. Reclique sur « Reprendre » pour continuer sans perdre les QCM validés.`);
        }
      }
      failedBatches = 0;
    }catch(batchError){
      const failureMessage = String(batchError?.message || '');
      if (/Trois contrôles successifs/.test(failureMessage)) throw batchError;
      if ([403,429,504].includes(Number(batchError?.status || 0)) || /quota|limit|délai|timeout/i.test(failureMessage)) throw batchError;
      failedBatches += 1;
      if (failedBatches >= 2) throw batchError;
      const reason = String(batchError?.message || '').trim();
      if (result) result.innerHTML = `<div class="pay-note warn">QCM interrompu, une nouvelle tentative automatique (${failedBatches}/2). Les QCM déjà validés sont conservés.${reason ? `<br><small>Motif : ${escapeHtml(reason)}</small>` : ''}</div>`;
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
  if (current?.generating){
    throw new Error(`Préparation interrompue à ${Number(current.generationProgress || current.questions?.length || 0)}/${Number(current.generationTarget || 50)} QCM. Relance la préparation pour reprendre sans perdre les questions validées.`);
  }
  return current;
}

async function resumeDailyAiGeneration(index){
  const draft = aiDailyDraftCache[index];
  if (!draft?.generating) return;
  const result = $('#aiDailyResult');
  const btn = document.querySelector(`[data-resume-daily="${CSS.escape(String(draft.id || ''))}"]`);
  setButtonLoading(btn, true, 'Reprise...');
  try{
    const completed = await continueDailyAiGeneration(draft, result);
    if (result) result.innerHTML = `<div class="pay-note success">PDF prêt ✅ ${completed?.count || 0} QCM vérifiés à relire avant publication.</div>`;
    await loadDailyAiDrafts();
  }catch(err){
    const message = err?.message === 'Failed to fetch'
      ? 'La connexion a été interrompue. Reclique sur « Reprendre » : les QCM déjà validés sont conservés.'
      : err.message;
    if (result) result.innerHTML = `<div class="pay-note error">${escapeHtml(message)}</div>`;
    await loadDailyAiDrafts().catch(()=>{});
  }finally{
    setButtonLoading(btn, false);
  }
}

async function runDailyAiQcm(){
  const btn = $('#aiDailyRunBtn');
  const result = $('#aiDailyResult');
  setButtonLoading(btn, true, 'Création du PDF...');
  if (result) result.innerHTML = '<div class="pay-note">Préparation sécurisée en cours. Les sources et les réponses sont contrôlées avant la création du PDF.</div>';
  try{
    refreshDailyCategoryOptions();
    const selectedCategory = $('#aiDailyCategory')?.value || '';
    const selectedLevel = $('#aiDailyLevel')?.value || '';
    if (!ALL_QCM_CATEGORIES.includes(selectedCategory)) throw new Error('Choisis la catégorie exacte avant de créer le PDF.');
    if (!selectedLevel) throw new Error('Choisis le niveau avant de créer le PDF.');
    const compatibleCategories = DAILY_LEVEL_CATEGORY_RULES[normalizeDailyLevel(selectedLevel)] || ALL_QCM_CATEGORIES;
    if (!compatibleCategories.includes(selectedCategory)) throw new Error(`La catégorie « ${selectedCategory} » n’est pas compatible avec le niveau ${selectedLevel}. Choisis une autre catégorie ou un autre niveau.`);
    const payload = {
      count:50,
      mode:$('#aiDailyMode')?.value || 'module',
      category:selectedCategory,
      level:selectedLevel,
      is_premium:Boolean($('#aiDailyPremium')?.checked),
      force:Boolean($('#aiDailyForce')?.checked)
    };
    const data = await adminFetch('/api/admin/ai/daily/run', { method:'POST', body:JSON.stringify(payload) });
    if (data.skipped){
      if (result) result.innerHTML = '<div class="pay-note warn">Le PDF du jour existe déjà. Coche “Régénérer aujourd’hui” si tu veux le refaire.</div>';
      await loadDailyAiDrafts();
      return;
    }
    const draft = await continueDailyAiGeneration(data.draft, result);
    if (result) result.innerHTML = `<div class="pay-note success">PDF prêt ✅ ${draft?.count || 0} QCM vérifiés à relire avant publication.</div>`;
    await loadDailyAiDrafts();
  }catch(err){
    const message = err?.message === 'Failed to fetch'
      ? 'La connexion a été interrompue. Reclique sur le bouton : la préparation reprendra à la dernière progression enregistrée.'
      : err.message;
    if (result) result.innerHTML = `<div class="pay-note error">${escapeHtml(message)}</div>`;
    await loadDailyAiDrafts().catch(()=>{});
  }finally{
    setButtonLoading(btn, false);
  }
}

function toggleDailyPublishedHistory(){
  showPublishedDailyDrafts = !showPublishedDailyDrafts;
  renderDailyAiDrafts();
}

function setDailyDraftPremium(index, checked){
  if (!aiDailyDraftCache[index] || aiDailyDraftCache[index].status === 'published') return;
  aiDailyDraftCache[index].is_premium = Boolean(checked);
  if (currentDailyPdfIndex === index && $('#dailyPublishPremium')) $('#dailyPublishPremium').checked = Boolean(checked);
  renderDailyAiDrafts();
}

function dailyVerificationInfo(draft){
  const total = Number(draft?.verification?.total ?? draft?.questions?.length ?? draft?.count ?? 0);
  const verified = Number(draft?.verification?.verified || 0);
  const blocked = Number(draft?.verification?.blocked ?? Math.max(0, total - verified));
  const publishable = Boolean(draft?.verification?.publishable) && total > 0 && blocked === 0;
  return { total, verified, blocked, publishable };
}

function dailyVerificationBadge(draft){
  const verification = dailyVerificationInfo(draft);
  return verification.publishable
    ? `<span class="qcm-verified-badge">✓ ${verification.verified}/${verification.total} sourcés</span>`
    : `<span class="qcm-blocked-badge">⚠ ${verification.blocked || verification.total} à vérifier</span>`;
}

function renderDailyAiDrafts(){
  const wrap = $('#aiDailyDraftList');
  if (!wrap) return;
  const entries = aiDailyDraftCache.map((d, idx)=>({d, idx}));
  const publishedCount = entries.filter(({d}) => d.status === 'published').length;
  const visibleEntries = entries.filter(({d}) => showPublishedDailyDrafts || d.status !== 'published');
  const historyButton = publishedCount
    ? `<button class="mini-btn" onclick="toggleDailyPublishedHistory()">${showPublishedDailyDrafts ? 'Masquer l’historique publié' : `Voir l’historique publié (${publishedCount})`}</button>`
    : '';
  if (!visibleEntries.length){
    wrap.innerHTML = `<div class="empty">Aucun PDF en attente de vérification.${publishedCount ? '<br>Les PDF déjà publiés sont rangés dans l’historique publié et restent visibles côté candidat.' : '<br>Clique sur “Créer le PDF du jour maintenant”.'}<br>${historyButton}</div>`;
    return;
  }
  wrap.innerHTML = `${historyButton ? `<div class="pay-note">${showPublishedDailyDrafts ? 'Historique affiché : les PDF publiés restent dans Nouveaux QCM et Documents.' : 'Les PDF déjà publiés sont rangés dans l’historique pour garder cet espace léger.'} ${historyButton}</div>` : ''}` + visibleEntries.map(({d, idx})=>`
    <div class="admin-q-item daily-ai-draft ${d.status === 'published' ? 'ai-published' : ''}" data-daily-draft-id="${escapeHtml(d.id || '')}">
      <div class="admin-q-meta">
        <span>${escapeHtml(d.date || '')}</span>
        <span>${escapeHtml(d.category || 'Module')}</span>
        <span>${escapeHtml(d.level || 'Niveau')}</span>
        ${d.is_premium ? '<span class="premium">Premium</span>' : '<span class="free">Gratuit</span>'}
        ${d.generating ? `<span class="qcm-blocked-badge" data-daily-progress-badge>Préparation ${Number(d.generationProgress || 0)}/${Number(d.generationTarget || 50)}</span>` : d.status === 'published' ? '<span class="active">Publié</span>' : '<span>PDF à relire</span>'}
        ${d.generating ? '' : dailyVerificationBadge(d)}
        ${Number(d.pdf_revision || 0) ? `<span class="active">PDF corrigé · v${Number(d.pdf_revision)}</span>` : ''}
      </div>
      <h4>${escapeHtml(d.title || 'QCM quotidien')}</h4>
      <p class="admin-help">${d.generating ? `<b data-daily-progress-count>${Number(d.generationProgress || 0)}/${Number(d.generationTarget || 50)}</b> QCM vérifiés et enregistrés. La carte est actualisée après chaque contrôle.` : `<b>${Number(d.count || 0)}</b> QCM préparés en PDF. ${d.status === 'published' ? 'Déjà disponible côté candidat dans Nouveaux QCM et Documents.' : 'Ouvre le fichier, corrige une question si nécessaire, vérifie le nouveau PDF, puis publie seulement après validation.'}`}</p>
      ${d.status !== 'published' && !d.generating ? `<label class="admin-select-line"><input type="checkbox" ${d.is_premium ? 'checked' : ''} onchange="setDailyDraftPremium(${idx}, this.checked)"><span>Publier en Premium <small>(sinon Gratuit)</small></span></label>` : ''}
      <div class="admin-q-actions">
        ${d.generating ? `<button class="edit" data-resume-daily="${escapeHtml(d.id || '')}" onclick="resumeDailyAiGeneration(${idx})">Reprendre la préparation</button>` : `<button class="edit" onclick="openDailyAiPdf(${idx})">Ouvrir / Vérifier PDF</button>`}
        ${!d.generating && d.status !== 'published' && !(d.orphanResource || d.orphanQuestions) ? `<button class="edit" onclick="verifyDailyAiDraft(${idx})">Vérifier les sources</button>` : ''}
        ${!d.generating && !(d.orphanResource || d.orphanQuestions) ? `<button class="pause" onclick="publishDailyAiDraft(${idx})" ${d.status !== 'published' && !dailyVerificationInfo(d).publishable ? 'disabled title="Vérifie toutes les sources avant publication"' : ''}>${d.status === 'published' ? 'Synchroniser' : dailyVerificationInfo(d).publishable ? `Publier en ${d.is_premium ? 'Premium' : 'Gratuit'}` : 'Publication bloquée'}</button>` : ''}
        ${d.status === 'published' ? `<button class="delete" onclick="unpublishDailyAiDraft(${idx})">Supprimer chez candidat</button>` : ''}
        ${!(d.orphanResource || d.orphanQuestions) ? `<button class="delete" onclick="deleteDailyAiDraft(${idx})">${d.status === 'published' ? 'Retirer de l’admin' : 'Supprimer'}</button>` : ''}
      </div>
    </div>`).join('');
}

async function fetchDailyAiPdfBlob(index){
  const d = aiDailyDraftCache[index];
  if (!d) throw new Error('PDF introuvable');
  const res = await fetchWithTimeout('/api/admin/ai/daily/' + encodeURIComponent(d.id) + '/pdf?inline=1&v=' + Date.now(), { headers:authHeaders({}), cache:'no-store' });
  if (!res.ok){
    const data = await res.json().catch(()=>({}));
    throw new Error(data.message || 'PDF indisponible');
  }
  return await res.blob();
}

function dailyAnswerLabel(index){ return ['A','B','C','D'][Number(index || 0)] || 'A'; }

function renderDailyPdfHtml(d){
  const wrap = $('#dailyPdfHtmlPreview');
  if (!wrap || !d) return;
  const questions = Array.isArray(d.questions) ? d.questions : [];
  wrap.innerHTML = `
    <div class="pdf-cover-preview">
      <div class="pdf-brand-line">
        <img src="img/logo.png" alt="Réussite Concours BF">
        <div><b>Réussite</b><strong>Concours BF</strong></div>
      </div>
      <span class="pdf-country">BURKINA FASO</span>
      <h1>PRÉPARATION</h1>
      <h2>INTENSIVE</h2>
      <h3>CONCOURS</h3>
      <div class="pdf-year">${new Date().getFullYear()}</div>
      <div class="pdf-preview-grid">
        <div><span>DATE DU SUJET</span><b>${escapeHtml(d.date || '')}</b></div>
        <div><span>SUJET</span><b>${Number(d.count || questions.length || 0)} QCM</b></div>
      </div>
      <div class="pdf-module-line"><b>MODULE : ${escapeHtml(d.category || 'Module')}</b><b>NIVEAU : ${escapeHtml(d.level || 'Niveau')}</b></div>
      <p>QCM corrigés pour entraînement intensif</p>
    </div>
    <div class="pdf-question-preview">
      <h2>Questions à choix multiple</h2>
      ${questions.map((q, idx)=>`
        <article class="pdf-preview-question">
          <div class="pdf-q-num">${idx + 1}.</div>
          <div class="pdf-q-body">
            <h3>${renderMathText(q.question_text || '')}</h3>
            <p><b>A.</b> ${renderMathText(q.option_a || '')}</p>
            <p><b>B.</b> ${renderMathText(q.option_b || '')}</p>
            <p><b>C.</b> ${renderMathText(q.option_c || '')}</p>
            <p><b>D.</b> ${renderMathText(q.option_d || '')}</p>
            <div class="pdf-preview-correction"><b>Réponse : ${dailyAnswerLabel(q.correct_answer)}</b><span>${renderMathText(q.explanation || '')}</span></div>
          </div>
        </article>`).join('')}
    </div>`;
}

function cloneDailyQuestions(questions){
  return (Array.isArray(questions) ? questions : []).map(question => ({
    question_text:String(question?.question_text || ''),
    option_a:String(question?.option_a || ''),
    option_b:String(question?.option_b || ''),
    option_c:String(question?.option_c || ''),
    option_d:String(question?.option_d || ''),
    correct_answer:Number(question?.correct_answer || 0),
    explanation:String(question?.explanation || ''),
    category:question?.category || '',
    level:question?.level || '',
    is_premium:Boolean(question?.is_premium),
    source:question?.source || '',
    evidence_type:question?.evidence_type || '',
    source_title:question?.source_title || '',
    source_url:question?.source_url || '',
    source_quote:question?.source_quote || '',
    source_date:question?.source_date || '',
    verification_status:question?.verification_status || 'generated',
    verification_score:Number(question?.verification_score || 0),
    verification_reason:question?.verification_reason || '',
    verified_at:question?.verified_at || '',
    verified_by:question?.verified_by || '',
    verified_fingerprint:question?.verified_fingerprint || '',
    verification_version:question?.verification_version || ''
  }));
}

function invalidateCurrentDailyPdf(){
  if (currentDailyPdfUrl) URL.revokeObjectURL(currentDailyPdfUrl);
  currentDailyPdfUrl = '';
}

function setDailyQuestionEditorStatus(message, tone=''){
  const status = $('#dailyQuestionEditorStatus');
  if (!status) return;
  status.className = `pay-note ${tone}`.trim();
  status.textContent = message || '';
}

function updateDailyQuestionEditorMeta(draft){
  if (!draft) return;
  $('#dailyPdfTitle') && ($('#dailyPdfTitle').textContent = draft.title || 'QCM quotidien');
  $('#dailyPdfMeta') && ($('#dailyPdfMeta').textContent = `${draft.date || ''} · ${draft.category || ''} · ${draft.level || ''} · ${Number(draft.count || draft.questions?.length || 0)} QCM${draft.pdf_revision ? ` · version corrigée ${draft.pdf_revision}` : ''}`);
  const verification = dailyVerificationInfo(draft);
  const summary = $('#dailyVerificationSummary');
  if (summary){
    summary.className = `qcm-publication-gate ${verification.publishable ? 'ready' : 'blocked'}`;
    summary.innerHTML = verification.publishable
      ? `<b>✓ Publication autorisée</b><span>${verification.verified}/${verification.total} réponses disposent d’une preuve vérifiée.</span>`
      : `<b>⚠ Publication bloquée</b><span>${verification.blocked || verification.total} question(s) sans validation suffisante. Corrige ou remplace les questions, puis clique sur « Vérifier les sources ».</span>`;
  }
  const publishButton = $('#dailyPublishVerifiedBtn');
  if (publishButton){
    publishButton.disabled = draft.status !== 'published' && !verification.publishable;
    publishButton.textContent = draft.status === 'published' ? 'Synchroniser les QCM publiés' : verification.publishable ? 'Publier les QCM vérifiés' : 'Publication bloquée — sources à vérifier';
  }
}

function applyDailyDraftEditorUpdate(index, draft){
  if (!draft || index < 0) return;
  aiDailyDraftCache[index] = draft;
  dailyQuestionEditorDraft = cloneDailyQuestions(draft.questions);
  dailyQuestionEditorDirty = false;
  invalidateCurrentDailyPdf();
  updateDailyQuestionEditorMeta(draft);
  renderDailyPdfHtml(draft);
  renderDailyAiDrafts();
  if (dailyQuestionEditorOpen) renderDailyQuestionEditor();
}

function toggleDailyQuestionEditor(forceOpen){
  const draft = aiDailyDraftCache[currentDailyPdfIndex];
  if (!draft) return;
  if (draft.status === 'published'){
    toast('Retire d’abord le PDF du côté candidat avant de le corriger.');
    return;
  }
  dailyQuestionEditorOpen = forceOpen === undefined ? !dailyQuestionEditorOpen : Boolean(forceOpen);
  if (dailyQuestionEditorOpen && (!dailyQuestionEditorDraft.length || !dailyQuestionEditorDirty)){
    dailyQuestionEditorDraft = cloneDailyQuestions(draft.questions);
  }
  renderDailyQuestionEditor();
}

function updateDailyQuestionField(index, field, value){
  const question = dailyQuestionEditorDraft[index];
  if (!question || !['question_text','option_a','option_b','option_c','option_d','correct_answer','explanation'].includes(field)) return;
  question[field] = field === 'correct_answer' ? Number(value) : value;
  question.verification_status = 'stale';
  question.verification_score = 0;
  question.verification_reason = 'Question modifiée après sa dernière vérification.';
  dailyQuestionEditorDirty = true;
  setDailyQuestionEditorStatus('Modification non vérifiée. Enregistre, puis relance « Vérifier les sources » avant publication.', 'warn');
}

function resetDailyQuestionEditor(){
  const draft = aiDailyDraftCache[currentDailyPdfIndex];
  if (!draft) return;
  if (dailyQuestionEditorDirty && !confirm('Annuler toutes les corrections non enregistrées ?')) return;
  dailyQuestionEditorDraft = cloneDailyQuestions(draft.questions);
  dailyQuestionEditorDirty = false;
  renderDailyQuestionEditor();
  setDailyQuestionEditorStatus('Les corrections non enregistrées ont été annulées.');
}

function removeDailyQuestionFromEditor(index){
  if (!dailyQuestionEditorDraft[index]) return;
  if (dailyQuestionEditorDraft.length <= 1){
    toast('Le PDF doit garder au moins une question.');
    return;
  }
  if (!confirm(`Supprimer la question ${index + 1} du PDF ?`)) return;
  dailyQuestionEditorDraft.splice(index, 1);
  dailyQuestionEditorDirty = true;
  renderDailyQuestionEditor();
  setDailyQuestionEditorStatus(`Question supprimée. Le nouveau PDF contiendra ${dailyQuestionEditorDraft.length} QCM après enregistrement.`, 'warn');
}

function renderQuestionVerificationProof(question){
  const verified = question?.verification_status === 'verified';
  const score = Number(question?.verification_score || 0);
  const sourceUrl = String(question?.source_url || '');
  const externalSource = /^https?:\/\//i.test(sourceUrl);
  const title = question?.source_title || (question?.evidence_type === 'calculation' ? 'Calcul contrôlé' : question?.evidence_type === 'language_rule' ? 'Règle de langue contrôlée' : 'Source non fournie');
  return `
    <div class="qcm-source-proof ${verified ? 'verified' : 'blocked'}">
      <div class="qcm-source-proof-head">
        <b>${verified ? '✓ Vérifié' : '⚠ Non validé'}${score ? ` · ${score}/100` : ''}</b>
        ${externalSource ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Ouvrir la source</a>` : ''}
      </div>
      <strong>${escapeHtml(title)}</strong>
      ${question?.source_quote ? `<p>« ${escapeHtml(question.source_quote)} »</p>` : ''}
      ${question?.verification_reason ? `<small>${escapeHtml(question.verification_reason)}</small>` : ''}
    </div>`;
}

function renderDailyQuestionEditor(){
  const editor = $('#dailyQuestionEditor');
  const toggle = $('#dailyQuestionEditorToggleBtn');
  const draft = aiDailyDraftCache[currentDailyPdfIndex];
  if (!editor) return;
  if (toggle) toggle.textContent = dailyQuestionEditorOpen ? 'Masquer l’éditeur' : 'Corriger les QCM du PDF';
  editor.style.display = dailyQuestionEditorOpen ? 'block' : 'none';
  if (!dailyQuestionEditorOpen) return;
  if (!draft || draft.status === 'published'){
    editor.innerHTML = '<div class="pay-note warn">Retire d’abord ce contenu du côté candidat avant de le modifier.</div>';
    return;
  }
  if (!dailyQuestionEditorDraft.length) dailyQuestionEditorDraft = cloneDailyQuestions(draft.questions);
  editor.innerHTML = `
    <div class="pdf-editor-head">
      <div><span>Correction du document</span><h3>${dailyQuestionEditorDraft.length} QCM modifiables</h3></div>
      <p>Ouvre seulement la question à corriger. Une modification annule sa validation jusqu’au prochain contrôle des sources.</p>
    </div>
    <div class="qcm-verification-toolbar">
      <div>${dailyVerificationBadge({ questions:dailyQuestionEditorDraft, verification:{ total:dailyQuestionEditorDraft.length, verified:dailyQuestionEditorDraft.filter(q => q.verification_status === 'verified').length, blocked:dailyQuestionEditorDraft.filter(q => q.verification_status !== 'verified').length, publishable:dailyQuestionEditorDraft.length > 0 && dailyQuestionEditorDraft.every(q => q.verification_status === 'verified') } })}<small>La publication exige une preuve pour chaque réponse.</small></div>
      <button class="btn btn-ghost" id="dailyVerifySourcesBtn" onclick="verifyDailyAiDraft(${currentDailyPdfIndex})">Vérifier les sources</button>
    </div>
    <div class="pay-note" id="dailyQuestionEditorStatus">${dailyQuestionEditorDirty ? 'Modifications non enregistrées et non vérifiées.' : 'Aucune correction non enregistrée.'}</div>
    <div class="pdf-question-editor-list">
      ${dailyQuestionEditorDraft.map((question, index) => `
        <details class="pdf-question-editor-card">
          <summary><b>Question ${index + 1} ${question.verification_status === 'verified' ? '✓' : '⚠'}</b><span>${escapeHtml(String(question.question_text || 'Question sans titre').slice(0, 110))}</span></summary>
          <div class="pdf-question-editor-body">
            <label class="field-label">Énoncé</label>
            <textarea class="input pdf-editor-textarea" oninput="updateDailyQuestionField(${index}, 'question_text', this.value)">${escapeHtml(question.question_text)}</textarea>
            <div class="pdf-editor-options-grid">
              ${['a','b','c','d'].map(letter => `<label><span>Option ${letter.toUpperCase()}</span><textarea class="input" oninput="updateDailyQuestionField(${index}, 'option_${letter}', this.value)">${escapeHtml(question[`option_${letter}`])}</textarea></label>`).join('')}
            </div>
            <label class="field-label">Bonne réponse</label>
            <select class="input" onchange="updateDailyQuestionField(${index}, 'correct_answer', this.value)">
              ${['A','B','C','D'].map((label, answerIndex) => `<option value="${answerIndex}" ${Number(question.correct_answer) === answerIndex ? 'selected' : ''}>${label} — Option ${label}</option>`).join('')}
            </select>
            <label class="field-label">Correction détaillée</label>
            <textarea class="input pdf-editor-textarea correction" oninput="updateDailyQuestionField(${index}, 'explanation', this.value)">${escapeHtml(question.explanation)}</textarea>
            ${renderQuestionVerificationProof(question)}
            <div class="admin-q-actions pdf-editor-question-actions">
              <button class="edit" id="dailyReplaceBtn${index}" onclick="replaceDailyQuestionWithAi(${index})">Remplacer cette question</button>
              <button class="delete" onclick="removeDailyQuestionFromEditor(${index})">Supprimer cette question</button>
            </div>
          </div>
        </details>`).join('')}
    </div>
    <div class="pdf-editor-savebar">
      <button class="btn btn-green" id="dailyQuestionSaveBtn" onclick="saveDailyQuestionCorrections()">Enregistrer et recréer le PDF</button>
      <button class="btn btn-ghost" onclick="resetDailyQuestionEditor()">Annuler les modifications</button>
    </div>`;
}

async function saveDailyQuestionCorrections(){
  const index = currentDailyPdfIndex;
  const draft = aiDailyDraftCache[index];
  if (!draft || draft.status === 'published') return;
  const btn = $('#dailyQuestionSaveBtn');
  setButtonLoading(btn, true, 'Recréation du PDF...');
  setDailyQuestionEditorStatus('Enregistrement des corrections et création du nouveau PDF...');
  try{
    const data = await adminFetch('/api/admin/ai/daily/' + encodeURIComponent(draft.id) + '/questions', {
      method:'PUT',
      body:JSON.stringify({ questions:dailyQuestionEditorDraft })
    });
    applyDailyDraftEditorUpdate(index, data.draft);
    setDailyQuestionEditorStatus(`${Number(data.saved || data.draft?.count || 0)} QCM enregistrés. Le PDF corrigé est prêt à être vérifié.`, 'success');
    toast('PDF corrigé recréé ✅');
  }catch(err){
    setDailyQuestionEditorStatus(err.message, 'error');
    toast(err.message);
  }finally{
    setButtonLoading(btn, false);
  }
}

async function verifyDailyAiDraft(index = currentDailyPdfIndex){
  const draft = aiDailyDraftCache[index];
  if (!draft || draft.status === 'published') return;
  if (currentDailyPdfIndex === index && dailyQuestionEditorDirty){
    dailyQuestionEditorOpen = true;
    renderDailyQuestionEditor();
    setDailyQuestionEditorStatus('Enregistre d’abord tes corrections avant de relancer la vérification des sources.', 'warn');
    toast('Enregistre d’abord les corrections.');
    return;
  }
  if (!confirm(`Vérifier factuellement les ${Number(draft.count || draft.questions?.length || 0)} QCM et leurs sources ? Les questions insuffisamment prouvées seront bloquées.`)) return;
  const btn = currentDailyPdfIndex === index ? $('#dailyVerifySourcesBtn') : null;
  setButtonLoading(btn, true, 'Vérification...');
  if (currentDailyPdfIndex === index) setDailyQuestionEditorStatus('Recherche des sources et double contrôle factuel en cours...');
  const result = $('#aiDailyResult');
  if (result) result.innerHTML = '<div class="pay-note">Vérification factuelle des réponses et des sources en cours...</div>';
  try{
    const data = await adminFetch('/api/admin/ai/daily/' + encodeURIComponent(draft.id) + '/verify', {
      method:'POST',
      body:JSON.stringify({ questions:draft.questions })
    });
    if (currentDailyPdfIndex === index) applyDailyDraftEditorUpdate(index, data.draft);
    else aiDailyDraftCache[index] = data.draft;
    renderDailyAiDrafts();
    const verification = data.verification || data.draft?.verification || {};
    const message = verification.publishable
      ? `${Number(verification.verified || 0)} QCM sourcés et vérifiés. Publication autorisée.`
      : `${Number(verification.verified || 0)}/${Number(verification.total || 0)} QCM validés. ${Number(verification.blocked || 0)} question(s) restent bloquées.`;
    if (currentDailyPdfIndex === index) setDailyQuestionEditorStatus(message, verification.publishable ? 'success' : 'warn');
    if (result) result.innerHTML = `<div class="pay-note ${verification.publishable ? 'success' : 'warn'}">${escapeHtml(message)}</div>`;
    toast(verification.publishable ? 'Toutes les sources sont vérifiées ✅' : 'Certaines questions doivent être remplacées.');
  }catch(err){
    if (currentDailyPdfIndex === index) setDailyQuestionEditorStatus(err.message, 'error');
    if (result) result.innerHTML = `<div class="pay-note error">${escapeHtml(err.message)}</div>`;
    toast(err.message);
  }finally{
    setButtonLoading(btn, false);
  }
}

async function replaceDailyQuestionWithAi(questionIndex){
  const index = currentDailyPdfIndex;
  const draft = aiDailyDraftCache[index];
  if (!draft || draft.status === 'published' || !dailyQuestionEditorDraft[questionIndex]) return;
  if (!confirm(`Remplacer entièrement la question ${questionIndex + 1} par une nouvelle question vérifiée ?`)) return;
  const btn = $(`#dailyReplaceBtn${questionIndex}`);
  setButtonLoading(btn, true, 'Remplacement...');
  setDailyQuestionEditorStatus(`Préparation d’une nouvelle question ${questionIndex + 1}...`);
  try{
    const data = await adminFetch('/api/admin/ai/daily/' + encodeURIComponent(draft.id) + '/replace-question', {
      method:'POST',
      body:JSON.stringify({ index:questionIndex, questions:dailyQuestionEditorDraft })
    });
    applyDailyDraftEditorUpdate(index, data.draft);
    setDailyQuestionEditorStatus(`Question ${questionIndex + 1} remplacée. Le PDF corrigé a été recréé.`, 'success');
    toast(`Question ${questionIndex + 1} remplacée ✅`);
  }catch(err){
    setDailyQuestionEditorStatus(err.message, 'error');
    toast(err.message);
  }finally{
    setButtonLoading(btn, false);
  }
}

async function ensureCurrentPdfBlob(){
  if (currentDailyPdfUrl) return currentDailyPdfUrl;
  if (currentDailyPdfIndex < 0) throw new Error('PDF introuvable');
  const blob = await fetchDailyAiPdfBlob(currentDailyPdfIndex);
  currentDailyPdfUrl = URL.createObjectURL(blob);
  return currentDailyPdfUrl;
}

async function openDailyAiPdf(index){
  const d = aiDailyDraftCache[index];
  if (!d) return;
  try{
    invalidateCurrentDailyPdf();
    currentDailyPdfIndex = index;
    dailyQuestionEditorDraft = cloneDailyQuestions(d.questions);
    dailyQuestionEditorOpen = false;
    dailyQuestionEditorDirty = false;
    updateDailyQuestionEditorMeta(d);
    $('#dailyPublishLevel') && ($('#dailyPublishLevel').value = d.level || 'Concours');
    refreshDailyPublishCategoryOptions(d.category || 'Culture générale');
    $('#dailyPublishPremium') && ($('#dailyPublishPremium').checked = Boolean(d.is_premium));
    updateAdminPublicationPreviews();
    renderDailyPdfHtml(d);
    renderDailyQuestionEditor();
    const editorLaunch = $('#dailyQuestionEditorLaunch');
    if (editorLaunch) editorLaunch.style.display = d.status === 'published' ? 'none' : 'block';
    show('pdfreview');
    ensureCurrentPdfBlob().catch(()=>{});
  }catch(err){ toast(err.message); }
}

function closeDailyPdfReview(){
  if (dailyQuestionEditorDirty && !confirm('Quitter sans enregistrer les corrections du PDF ?')) return;
  invalidateCurrentDailyPdf();
  dailyQuestionEditorDraft = [];
  dailyQuestionEditorOpen = false;
  dailyQuestionEditorDirty = false;
  show('admin');
  setAdminTab('ai');
}

async function downloadDailyAiPdf(index){
  const d = aiDailyDraftCache[index];
  if (!d) return;
  try{
    const blob = await fetchDailyAiPdfBlob(index);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = d.fileName || 'qcm-quotidien.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1200);
  }catch(err){ toast(err.message); }
}

function downloadCurrentDailyPdf(){
  if (currentDailyPdfIndex < 0) return;
  downloadDailyAiPdf(currentDailyPdfIndex);
}

async function openCurrentDailyPdfFull(){
  try{
    const url = await ensureCurrentPdfBlob();
    const draft = aiDailyDraftCache[currentDailyPdfIndex];
    await openPdfReader(url, draft?.title || 'QCM quotidien corrigé');
  }catch(err){ toast(err.message); }
}

function publishCurrentDailyPdf(){
  if (currentDailyPdfIndex < 0) return;
  if (dailyQuestionEditorDirty){
    dailyQuestionEditorOpen = true;
    renderDailyQuestionEditor();
    setDailyQuestionEditorStatus('Enregistre d’abord les corrections et recrée le PDF avant de publier.', 'warn');
    toast('Enregistre d’abord les corrections du PDF.');
    return;
  }
  const draft = aiDailyDraftCache[currentDailyPdfIndex];
  if (!dailyVerificationInfo(draft).publishable){
    dailyQuestionEditorOpen = true;
    renderDailyQuestionEditor();
    setDailyQuestionEditorStatus('Publication bloquée : vérifie les sources et remplace les questions rejetées.', 'warn');
    toast('Toutes les réponses doivent être sourcées et vérifiées.');
    return;
  }
  publishDailyAiDraft(currentDailyPdfIndex);
}

async function publishDailyAiDraft(index){
  const d = aiDailyDraftCache[index];
  if (!d) return;
  if (d.status !== 'published' && !dailyVerificationInfo(d).publishable){
    toast('Publication bloquée : vérifie toutes les sources avant publication.');
    if (currentDailyPdfIndex !== index) openDailyAiPdf(index);
    return;
  }
  const reviewOpen = currentDailyPdfIndex === index && $('#pdfreview')?.classList.contains('active');
  const level = reviewOpen ? ($('#dailyPublishLevel')?.value || d.level || 'Concours') : (d.level || 'Concours');
  if (reviewOpen) refreshDailyPublishCategoryOptions();
  const category = reviewOpen ? ($('#dailyPublishCategory')?.value || d.category || 'Culture générale') : (d.category || 'Culture générale');
  const compatibleCategories = DAILY_LEVEL_CATEGORY_RULES[normalizeDailyLevel(level)] || ALL_QCM_CATEGORIES;
  if (!compatibleCategories.includes(category)){ toast(`La catégorie « ${category} » n’est pas compatible avec le niveau ${level}.`); return; }
  const isPremium = reviewOpen ? Boolean($('#dailyPublishPremium')?.checked) : Boolean(d.is_premium);
  const destination = isPremium ? 'Premium' : 'Gratuit';
  const verb = d.status === 'published' ? 'Synchroniser' : 'Publier';
  if (!confirm(`${verb} les ${Number(d.count || 0)} QCM dans ${category} · ${level} · ${destination} ?`)) return;
  try{
    const data = await adminFetch('/api/admin/ai/daily/' + encodeURIComponent(d.id) + '/publish', {
      method:'POST',
      body:JSON.stringify({ category, level, is_premium:isPremium })
    });
    const result = $('#aiDailyResult');
    if (result) result.innerHTML = `<div class="pay-note success">${data.published || 0} QCM disponibles dans <b>Nouveaux QCM</b> et dans le module <b>${escapeHtml(category)}</b> · ${destination} ✅${data.resource ? '<br>PDF ajouté dans <b>Documents & fichiers</b> ✅' : ''}<br><button class="mini-btn" onclick="openPublishedQcmFromAdmin('${isPremium ? 'premium' : 'free'}')" style="margin-top:8px">Ouvrir les QCM ${destination}</button> <button class="mini-btn" onclick="openResourcesFromAdmin()" style="margin-top:8px">Ouvrir Documents</button></div>`;
    if (data.draft) aiDailyDraftCache[index] = data.draft;
    else aiDailyDraftCache[index] = { ...d, status:'published', is_premium:isPremium, category, level, published_at:new Date().toISOString() };
    showPublishedDailyDrafts = false;
    renderDailyAiDrafts();
    if (currentDailyPdfIndex === index && $('#pdfreview')?.classList.contains('active')) closeDailyPdfReview();
    toast(data.alreadyPublished ? 'Synchronisation terminée ✅' : 'QCM quotidiens publiés ✅');
    setTimeout(()=>Promise.allSettled([
      loadDailyAiDrafts(),
      loadAdminQuestions(),
      loadSupabaseQuestions(),
      loadPublishedQcm(isPremium ? 'premium' : 'free'),
      loadResources(),
      isAdmin() ? loadAdminResources() : Promise.resolve()
    ]).then(()=>renderFormations(currentFormFilter)), 350);
  }catch(err){ toast(err.message); }
}

async function unpublishDailyAiDraft(index){
  const d = aiDailyDraftCache[index];
  if (!d || d.status !== 'published') return;
  if (!confirm('Supprimer chez le candidat ? Les QCM disparaîtront de Nouveaux QCM et le PDF disparaîtra de Documents & fichiers. Le PDF restera dans l’admin pour correction ou republication.')) return;
  try{
    toast('Suppression en cours...');
    const data = await adminFetch('/api/admin/ai/daily/' + encodeURIComponent(d.id) + '/public', { method:'DELETE' });
    if (data.draft) aiDailyDraftCache[index] = data.draft;
    else aiDailyDraftCache[index] = { ...d, status:'draft', published_at:'', resource_id:'' };
    renderDailyAiDrafts();
    publishedQcmCache = publishedQcmCache.filter(set => set.title !== d.title);
    resourceCache = resourceCache.filter(r => r.title !== d.title);
    renderPublishedQcm();
    const result = $('#aiDailyResult');
    if (result) result.innerHTML = `<div class="pay-note success">Contenu retiré côté candidat ✅ ${Number(data.removedQuestions || 0)} QCM retiré${Number(data.removedQuestions || 0)>1?'s':''}. Le PDF peut être corrigé ou supprimé dans l’admin.</div>`;
    toast('Supprimé chez le candidat ✅');
    setTimeout(()=>Promise.allSettled([
      loadDailyAiDrafts(),
      loadPublishedQcm(currentPublishedQcmFilter || 'all'),
      loadResources(),
      isAdmin() ? loadAdminResources() : Promise.resolve()
    ]), 350);
  }catch(err){ toast(err.message); }
}

async function deleteDailyAiDraft(index){
  const d = aiDailyDraftCache[index];
  if (!d) return;
  const msg = d.status === 'published'
    ? 'Retirer ce PDF de l’historique publié ? Les QCM et le document restent visibles côté candidat.'
    : 'Supprimer ce PDF quotidien ?';
  if (!confirm(msg)) return;
  try{
    toast('Suppression en cours...');
    const data = await adminFetch('/api/admin/ai/daily/' + encodeURIComponent(d.id), { method:'DELETE', cache:'no-store' });
    if (!data.deleted) throw new Error('La suppression du PDF n’a pas été confirmée par le serveur.');
    aiDailyDraftCache.splice(index, 1);
    renderDailyAiDrafts();
    await Promise.allSettled([loadDailyAiDrafts(), d.status === 'published' ? loadResources() : Promise.resolve()]);
    toast(d.status === 'published' ? 'Retiré de l’administration ✅' : 'PDF supprimé définitivement ✅');
  }catch(err){ toast(err.message); }
}

async function generateAiQcm(){
  const btn = $('#aiGenerateBtn');
  const result = $('#aiResult');
  const list = $('#aiDraftList');
  const pdfFile = $('#aiPdfSource')?.files?.[0] || null;
  setButtonLoading(btn, true, pdfFile ? 'Lecture PDF...' : 'Génération...');
  if (result) result.innerHTML = pdfFile
    ? '<div class="pay-note">L’IA lit le PDF et prépare des propositions à relire avant publication.</div>'
    : '<div class="pay-note">L’IA prépare des propositions à relire avant publication.</div>';
  if (list) list.innerHTML = '<div class="empty">Génération en cours...</div>';
  try{
    refreshAiCategoryOptions();
    const publicationNameInput = ($('#aiPublicationName')?.value || '').trim();
    const payload = {
      category: $('#aiCategory')?.value || 'Culture générale',
      level: $('#aiLevel')?.value || 'Concours',
      theme: $('#aiTheme')?.value || '',
      count: Number($('#aiCount')?.value || 5),
      is_premium: Boolean($('#aiPremium')?.checked),
      publication_name: publicationNameInput
    };
    const compatibleCategories = DAILY_LEVEL_CATEGORY_RULES[normalizeDailyLevel(payload.level)] || ALL_QCM_CATEGORIES;
    if (!compatibleCategories.includes(payload.category)) throw new Error(`La catégorie « ${payload.category} » n’est pas compatible avec le niveau ${payload.level}. Choisis une autre catégorie ou un autre niveau.`);
    const publicationName = (publicationNameInput || payload.theme || (pdfFile?.name ? pdfFile.name.replace(/\.pdf$/i,'') : '') || ('QCM ' + formatDate(new Date().toISOString()))).trim();
    let data;
    if (pdfFile){
      const headers = authHeaders({
        'Content-Type': pdfFile.type || 'application/pdf',
        'X-File-Name': encodeURIComponent(pdfFile.name || 'source.pdf'),
        'X-Ai-Category': encodeURIComponent(payload.category),
        'X-Ai-Level': encodeURIComponent(payload.level),
        'X-Ai-Theme': encodeURIComponent(payload.theme || publicationName),
        'X-Ai-Count': String(payload.count),
        'X-Ai-Is-Premium': String(Boolean(payload.is_premium)),
        'X-Ai-Publication-Name': encodeURIComponent(publicationName)
      });
      const res = await fetchWithTimeout('/api/admin/ai/qcm-pdf', { method:'POST', headers, body:pdfFile });
      data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.message || 'Génération depuis PDF impossible');
    }else{
      data = await adminFetch('/api/admin/ai/qcm', { method:'POST', body:JSON.stringify(payload) });
    }
    aiDraftCache = (data.questions || []).map(q => ({...q, source:publicationName, is_premium:payload.is_premium, is_active:true, _published:false}));
    aiDraftSelectedIndexes.clear();
    if (result) result.innerHTML = `<div class="pay-note success">${aiDraftCache.length} proposition${aiDraftCache.length>1?'s':''} prête${aiDraftCache.length>1?'s':''}${pdfFile ? ' depuis le PDF' : ''} ✅</div>`;
    renderAiDrafts();
  }catch(err){
    aiDraftCache = [];
    if (result) result.innerHTML = `<div class="pay-note error">${err.message}</div>`;
    if (list) list.innerHTML = '';
  }finally{
    setButtonLoading(btn, false);
  }
}

function renderAiDrafts(){
  const wrap = $('#aiDraftList');
  if (!wrap) return;
  const visibleDrafts = aiDraftCache.map((q, idx)=>({q, idx})).filter(item => !item.q._published);
  if (!aiDraftCache.length || !visibleDrafts.length){ wrap.innerHTML = ''; return; }
  aiDraftSelectedIndexes = new Set([...aiDraftSelectedIndexes].filter(idx => aiDraftCache[idx] && !aiDraftCache[idx]._published));
  const pendingIndexes = visibleDrafts.map(item => item.idx);
  const selectedCount = aiDraftSelectedIndexes.size;
  const allPendingSelected = pendingIndexes.length && pendingIndexes.every(idx => aiDraftSelectedIndexes.has(idx));
  const publishAll = aiDraftCache.some(q => !q._published)
    ? '<button class="btn btn-green btn-block" onclick="publishAllAiDrafts()" style="margin-bottom:10px">Publier les QCM relus</button>'
    : '';
  const bulkBar = `
    <div class="admin-bulk-bar ai-bulk-bar">
      <label><input type="checkbox" ${allPendingSelected ? 'checked' : ''} onchange="toggleAllAiDraftSelection(this.checked)"> Sélectionner les propositions</label>
      <span><b>${selectedCount}</b> sélectionnée${selectedCount>1?'s':''}</span>
      <button class="mini-btn" onclick="bulkAiDrafts('publish')" ${selectedCount ? '' : 'disabled'}>Publier sélection</button>
      <button class="mini-btn danger" onclick="bulkAiDrafts('remove')" ${selectedCount ? '' : 'disabled'}>Retirer sélection</button>
      ${selectedCount ? '<button class="mini-btn" onclick="clearAiDraftSelection()">Annuler</button>' : ''}
    </div>`;
  wrap.innerHTML = publishAll + bulkBar + visibleDrafts.map(({q, idx})=>`
    <div class="admin-q-item ${q._published ? 'ai-published' : ''} ${aiDraftSelectedIndexes.has(idx) ? 'selected' : ''}">
      ${!q._published ? `<label class="admin-select-line"><input type="checkbox" ${aiDraftSelectedIndexes.has(idx) ? 'checked' : ''} onchange="toggleAiDraftSelection(${idx}, this.checked)"><span>Sélectionner</span></label>` : ''}
      <div class="admin-q-meta">
        <span>${escapeHtml(q.category || 'Catégorie')}</span>
        <span>${escapeHtml(q.level || '')}</span>
        ${q.is_premium ? '<span class="premium">Premium abonnés</span>' : '<span class="free">Gratuit</span>'}
        ${q._published ? '<span class="active">Publié</span>' : '<span>Proposition</span>'}
      </div>
      <h4>${renderMathText(q.question_text || '')}</h4>
      <p class="admin-destination-note">Nom du QCM : <b>${escapeHtml(q.source || 'QCM')}</b></p>
      <p class="admin-help"><b>A.</b> ${renderMathText(q.option_a)} · <b>B.</b> ${renderMathText(q.option_b)} · <b>C.</b> ${renderMathText(q.option_c)} · <b>D.</b> ${renderMathText(q.option_d)}</p>
      <p class="admin-help"><b>Correction :</b> ${renderMathText(q.explanation || '')}</p>
      ${renderQuestionVerificationProof(q)}
      ${!q._published ? `<label class="admin-select-line"><input type="checkbox" ${q.is_premium ? 'checked' : ''} onchange="setAiDraftPremium(${idx}, this.checked)"><span>Publier en Premium <small>(sinon Gratuit)</small></span></label>` : ''}
      <div class="admin-q-actions">
        <button class="edit" onclick="editAiDraft(${idx})">Relire / Modifier</button>
        <button class="pause" onclick="publishAiDraft(${idx})" ${q._published || q.verification_status !== 'verified' ? 'disabled title="Ce QCM doit être vérifié avant publication"' : ''}>${q.verification_status === 'verified' ? (q.is_premium ? 'Publier en Premium' : 'Publier en Gratuit') : 'Publication bloquée'}</button>
        <button class="delete" onclick="removeAiDraft(${idx})">Retirer</button>
      </div>
    </div>`).join('');
}

function toggleAiDraftSelection(index, checked){
  if (checked) aiDraftSelectedIndexes.add(index);
  else aiDraftSelectedIndexes.delete(index);
  renderAiDrafts();
}

function toggleAllAiDraftSelection(checked){
  aiDraftCache.forEach((q, idx) => {
    if (q._published) return;
    if (checked) aiDraftSelectedIndexes.add(idx);
    else aiDraftSelectedIndexes.delete(idx);
  });
  renderAiDrafts();
}

function clearAiDraftSelection(){
  aiDraftSelectedIndexes.clear();
  renderAiDrafts();
}

function setAiDraftPremium(index, checked){
  if (!aiDraftCache[index] || aiDraftCache[index]._published) return;
  aiDraftCache[index].is_premium = Boolean(checked);
  renderAiDrafts();
}

async function bulkAiDrafts(action){
  const indexes = [...aiDraftSelectedIndexes].filter(idx => aiDraftCache[idx] && !aiDraftCache[idx]._published).sort((a,b)=>a-b);
  if (!indexes.length) return toast('Sélectionne au moins une proposition');
  if (action === 'remove'){
    aiDraftCache = aiDraftCache.filter((_, idx) => !aiDraftSelectedIndexes.has(idx));
    aiDraftSelectedIndexes.clear();
    renderAiDrafts();
    return toast('Propositions retirées ✅');
  }
  for (const idx of indexes){
    if (aiDraftCache[idx] && !aiDraftCache[idx]._published) await publishAiDraft(idx);
  }
  aiDraftSelectedIndexes.clear();
  renderAiDrafts();
}

function editAiDraft(index){
  const q = aiDraftCache[index];
  if (!q) return;
  aiDraftEditingIndex = index;
  setAdminTab('create');
  $('#adminQuestionId') && ($('#adminQuestionId').value='');
  $('#adminCategory') && ($('#adminCategory').value=q.category || 'Culture générale');
  $('#adminLevel') && ($('#adminLevel').value=q.level || 'Concours');
  $('#adminQuestionText') && ($('#adminQuestionText').value=q.question_text || '');
  $('#adminOptionA') && ($('#adminOptionA').value=q.option_a || '');
  $('#adminOptionB') && ($('#adminOptionB').value=q.option_b || '');
  $('#adminOptionC') && ($('#adminOptionC').value=q.option_c || '');
  $('#adminOptionD') && ($('#adminOptionD').value=q.option_d || '');
  $('#adminCorrect') && ($('#adminCorrect').value=String(q.correct_answer ?? 0));
  $('#adminExplanation') && ($('#adminExplanation').value=q.explanation || '');
  $('#adminSource') && ($('#adminSource').value=q.source || 'Réussite Concours BF');
  $('#adminPremium') && ($('#adminPremium').checked=Boolean(q.is_premium));
  $('#adminActive') && ($('#adminActive').checked=true);
  $('#adminFormTitle') && ($('#adminFormTitle').textContent='Relire une proposition IA');
  $('#adminSaveBtn') && ($('#adminSaveBtn').textContent='Enregistrer et revérifier');
}

async function publishAiDraft(index){
  const q = aiDraftCache[index];
  if (!q || q._published) return;
  if (q.verification_status !== 'verified') return toast('Publication bloquée : corrige puis fais revérifier ce QCM.');
  try{
    toast('Publication en cours...');
    await adminFetch('/api/admin/questions', { method:'POST', body:JSON.stringify({
      category:q.category,
      level:q.level,
      question_text:q.question_text,
      options:[q.option_a,q.option_b,q.option_c,q.option_d],
      correct_answer:q.correct_answer,
      explanation:q.explanation,
      source:q.source || 'Réussite Concours BF',
      is_premium:Boolean(q.is_premium),
      is_active:true,
      ai_generated:true,
      evidence_type:q.evidence_type || '',
      source_title:q.source_title || '',
      source_url:q.source_url || '',
      source_quote:q.source_quote || '',
      source_date:q.source_date || '',
      verification_status:q.verification_status || '',
      verification_score:Number(q.verification_score || 0),
      verification_reason:q.verification_reason || '',
      verified_at:q.verified_at || '',
      verified_by:q.verified_by || '',
      verified_fingerprint:q.verified_fingerprint || '',
      verification_version:q.verification_version || ''
    }) });
    q._published = true;
    renderAiDrafts();
    const destination = qcmDestinationText(q);
    const result = $('#aiResult');
    if (result) result.innerHTML = `<div class="pay-note success">QCM publié dans <b>${destination}</b> ✅<br>Il apparaît dans <b>Nouveaux QCM</b> et dans le module <b>${escapeHtml(q.category || 'Culture générale')}</b>.<br>Il est rangé dans <b>Mes QCM → Voir historique publié</b><br><button class="mini-btn" onclick="openPublishedQcmFromAdmin()" style="margin-top:8px">Ouvrir les Nouveaux QCM</button></div>`;
    toast('QCM publié dans ' + destination + ' ✅');
    setTimeout(()=>Promise.allSettled([loadAdminQuestions(), loadSupabaseQuestions()]).then(()=>renderFormations(currentFormFilter)), 250);
  }catch(err){ toast(err.message); }
}

async function publishAllAiDrafts(){
  for (let i=0; i<aiDraftCache.length; i++){
    if (!aiDraftCache[i]._published) await publishAiDraft(i);
  }
}

function removeAiDraft(index){
  aiDraftCache.splice(index, 1);
  aiDraftSelectedIndexes.clear();
  renderAiDrafts();
}


async function scanOfficialNews(){
  const btn = $('#aiNewsScanBtn');
  const result = $('#aiNewsResult');
  const list = $('#aiNewsDraftList');
  setButtonLoading(btn, true, 'Recherche...');
  if (result) result.innerHTML = '<div class="pay-note">Recherche limitée aux concours directs et aux concours professionnels en cours. S’il n’y a aucune annonce officielle conforme, aucun résultat ne sera proposé.</div>';
  if (list) list.innerHTML = '<div class="empty">Recherche des concours directs et professionnels...</div>';
  try{
    const data = await adminFetch('/api/admin/ai/news-scan', { method:'POST', body:JSON.stringify({ limit:6 }) });
    aiNewsDraftCache = data.items || [];
    if (result){
      const note = data.notificationSent ? ' Notification envoyée.' : '';
      const fresh = data.today ? ` Filtre à jour appliqué (${data.today}).` : ' Filtre à jour appliqué.';
      result.innerHTML = `<div class="pay-note success">${aiNewsDraftCache.length} annonce${aiNewsDraftCache.length>1?'s':''} de concours direct ou professionnel préparée${aiNewsDraftCache.length>1?'s':''} ✅${fresh}${note}</div>`;
    }
    renderAiNewsDrafts();
    if (data.staged) loadAdminNews().catch(()=>{});
  }catch(err){
    aiNewsDraftCache = [];
    if (result) result.innerHTML = `<div class="pay-note error">${err.message}</div>`;
    if (list) list.innerHTML = '';
  }finally{
    setButtonLoading(btn, false);
  }
}

function renderAiNewsDrafts(){
  const wrap = $('#aiNewsDraftList');
  if (!wrap) return;
  if (!aiNewsDraftCache.length){
    wrap.innerHTML = '<div class="empty">Aucun concours direct ou professionnel officiel en cours détecté pour le moment.</div>';
    return;
  }
  wrap.innerHTML = aiNewsDraftCache.map((item, idx)=>`
    <div class="admin-q-item ai-news-draft">
      <div class="admin-q-meta">
        <span>${escapeHtml(item.type || 'Communiqué')}</span>
        <span>${escapeHtml(item.status || 'Info')}</span>
        <span>Proposition</span>
        ${item.hasPdf ? '<span>PDF joint</span>' : ''}
      </div>
      <h4>${escapeHtml(item.title || '')}</h4>
      <p class="admin-help">${escapeHtml(item.summary || item.organization || '')}</p>
      <p class="admin-destination-note">Source officielle : <b>${escapeHtml(item.sourceName || item.organization || 'Source')}</b></p>
      <div class="admin-q-actions">
        <button class="edit" onclick="prepareAiNewsDraft(${idx})">Relire / Préparer</button>
        ${item.hasPdf && (item.preparedId || item.id) ? `<button class="edit" onclick="openAdminNewsPdf('${escapeHtml(item.preparedId || item.id)}')">PDF</button>` : ''}
        <button class="pause" onclick="openAiNewsSource(${idx})">Ouvrir la source</button>
        <button class="delete" onclick="removeAiNewsDraft(${idx})">Retirer</button>
      </div>
    </div>`).join('');
}

function openAiNewsSource(index){
  const item = aiNewsDraftCache[index];
  if (item?.sourceUrl) window.open(item.sourceUrl, '_blank', 'noopener');
}

function prepareAiNewsDraft(index){
  const item = aiNewsDraftCache[index];
  if (!item) return;
  setAdminTab('news');
  const preparedId = item.preparedId || item.id || '';
  $('#adminNewsId') && ($('#adminNewsId').value=preparedId);
  $('#adminNewsTitle') && ($('#adminNewsTitle').value=item.title || '');
  $('#adminNewsType') && ($('#adminNewsType').value=item.type || 'Communiqué');
  $('#adminNewsStatus') && ($('#adminNewsStatus').value=item.status || 'Info');
  $('#adminNewsOrganization') && ($('#adminNewsOrganization').value=item.organization || item.sourceName || '');
  $('#adminNewsDeadline') && ($('#adminNewsDeadline').value=item.deadline || '');
  $('#adminNewsSummary') && ($('#adminNewsSummary').value=item.summary || '');
  $('#adminNewsContent') && ($('#adminNewsContent').value=item.content || item.summary || '');
  $('#adminNewsSource') && ($('#adminNewsSource').value=item.sourceUrl || '');
  $('#adminNewsActive') && ($('#adminNewsActive').checked=true);
  $('#adminNewsFormTitle') && ($('#adminNewsFormTitle').textContent='Relire une actualité officielle');
  $('#adminNewsSaveBtn') && ($('#adminNewsSaveBtn').textContent='Publier l’actualité');
  toast(item.hasPdf ? 'Proposition chargée avec PDF. Relis puis publie ✅' : 'Proposition chargée. Relis puis publie ✅');
}

function removeAiNewsDraft(index){
  aiNewsDraftCache.splice(index, 1);
  renderAiNewsDrafts();
}

function newsTypeIcon(type){
  const t = String(type || '').toLowerCase();
  if (t.includes('recrut')) return '🧾';
  if (t.includes('concours')) return '🏛️';
  if (t.includes('résultat') || t.includes('resultat')) return '✅';
  if (t.includes('calend')) return '📅';
  return '📢';
}

function newsStatusClass(status){
  const s = String(status || '').toLowerCase();
  if (s.includes('ouvert')) return 'open';
  if (s.includes('clôt') || s.includes('clot')) return 'closed';
  if (s.includes('bient')) return 'soon';
  return 'info';
}

async function loadNews(){
  const wrap = $('#newsList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Chargement des actualités...</div>';
  try{
    const res = await fetchWithTimeout('/api/news', { headers:authHeaders({}) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Actualités indisponibles');
    newsCache = data.news || [];
    renderNewsList();
  }catch(err){
    wrap.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }
}

function filterNews(el, type){
  currentNewsFilter = type || 'Tout';
  $$('.news-filter-row .chip').forEach(b=>b.classList.remove('on'));
  el && el.classList.add('on');
  renderNewsList();
}

function renderNewsList(){
  const wrap = $('#newsList');
  if (!wrap) return;
  const items = (newsCache || []).filter(n => currentNewsFilter === 'Tout' || n.type === currentNewsFilter);
  if (!items.length){
    wrap.innerHTML = '<div class="empty"><div class="big">📰</div>Aucune actualité disponible pour le moment.</div>';
    return;
  }
  wrap.innerHTML = items.map(n => {
    const source = n.sourceUrl ? `<a class="news-source" href="${escapeHtml(n.sourceUrl)}" target="_blank" rel="noopener">Source officielle</a>` : '';
    const pdf = n.hasPdf ? `<button class="news-source news-pdf-btn" onclick="openNewsPdf('${escapeHtml(n.id)}')">📄 Ouvrir le PDF</button>` : '';
    const deadline = n.deadline ? `<span>📅 ${formatDate(n.deadline)}</span>` : '';
    return `<article class="news-card">
      <div class="news-card-top">
        <div class="news-icon">${newsTypeIcon(n.type)}</div>
        <div>
          <div class="news-meta"><span>${escapeHtml(n.type || 'Communiqué')}</span><span class="${newsStatusClass(n.status)}">${escapeHtml(n.status || 'Info')}</span>${deadline}</div>
          <h3>${escapeHtml(n.title)}</h3>
          ${n.organization ? `<p class="news-org">${escapeHtml(n.organization)}</p>` : ''}
        </div>
      </div>
      <p>${escapeHtml(n.summary || n.content || '')}</p>
      ${n.content && n.content !== n.summary ? `<details><summary>Lire le communiqué</summary><div>${escapeHtml(n.content).replace(/\n/g,'<br>')}</div></details>` : ''}
      <div class="news-actions">${pdf}${source}</div>
    </article>`;
  }).join('');
}

async function openAdminNewsPdf(id){
  try{
    const res = await fetchWithTimeout('/api/admin/news/' + encodeURIComponent(id) + '/pdf', { headers:authHeaders({}) });
    if (!res.ok){
      const data = await res.json().catch(()=>({}));
      throw new Error(data.message || 'PDF indisponible');
    }
    const blob = await res.blob();
    await openPdfReader(blob, 'Document officiel');
  }catch(err){ toast(err.message || 'PDF indisponible'); }
}

async function openNewsPdf(id){
  try{
    const res = await fetchWithTimeout('/api/news/' + encodeURIComponent(id) + '/pdf', { headers:authHeaders({}) });
    if (!res.ok){
      const data = await res.json().catch(()=>({}));
      throw new Error(data.message || 'PDF indisponible');
    }
    const blob = await res.blob();
    await openPdfReader(blob, 'Document officiel');
  }catch(err){ toast(err.message || 'PDF indisponible'); }
}

function adminNewsPayload(){
  return {
    id: $('#adminNewsId')?.value || '',
    title: $('#adminNewsTitle')?.value || '',
    type: $('#adminNewsType')?.value || 'Communiqué',
    status: $('#adminNewsStatus')?.value || 'Info',
    organization: $('#adminNewsOrganization')?.value || '',
    deadline: $('#adminNewsDeadline')?.value || '',
    summary: $('#adminNewsSummary')?.value || '',
    content: $('#adminNewsContent')?.value || '',
    sourceUrl: $('#adminNewsSource')?.value || '',
    is_active: Boolean($('#adminNewsActive')?.checked)
  };
}

async function saveAdminNews(){
  const result = $('#adminNewsResult');
  const btn = $('#adminNewsSaveBtn');
  setButtonLoading(btn, true, 'Publication...');
  try{
    const payload = adminNewsPayload();
    const id = payload.id;
    const url = id ? '/api/admin/news/' + encodeURIComponent(id) : '/api/admin/news';
    const method = id ? 'PATCH' : 'POST';
    const data = await adminFetch(url, { method, body:JSON.stringify(payload) });
    const savedId = data.item?.id || id;
    const pdfFile = $('#adminNewsPdf')?.files?.[0];
    if (pdfFile && savedId) await uploadAdminNewsPdf(savedId, pdfFile);
    if (result) result.innerHTML = '<div class="pay-note success">Actualité enregistrée ✅</div>';
    resetAdminNewsForm(false);
    await loadAdminNews();
    await loadNews();
    toast('Actualité publiée ✅');
  }catch(err){
    if (result) result.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }finally{
    setButtonLoading(btn, false);
  }
}

async function uploadAdminNewsPdf(newsId, file){
  if (!file) return;
  const headers = authHeaders({
    'Content-Type': file.type || 'application/pdf',
    'X-File-Name': encodeURIComponent(file.name || 'communique.pdf')
  });
  const res = await fetchWithTimeout('/api/admin/news/' + encodeURIComponent(newsId) + '/pdf', { method:'POST', headers, body:file });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.message || 'Envoi du PDF impossible');
}

function resetAdminNewsForm(clearMessage = true){
  ['adminNewsId','adminNewsTitle','adminNewsOrganization','adminNewsDeadline','adminNewsSummary','adminNewsContent','adminNewsSource','adminNewsPdf'].forEach(id=>{ const el=$('#'+id); if (el) el.value=''; });
  $('#adminNewsType') && ($('#adminNewsType').value='Concours');
  $('#adminNewsStatus') && ($('#adminNewsStatus').value='Ouvert');
  $('#adminNewsActive') && ($('#adminNewsActive').checked=true);
  $('#adminNewsFormTitle') && ($('#adminNewsFormTitle').textContent='Nouvelle actualité');
  const saveBtn = $('#adminNewsSaveBtn');
  if (saveBtn){ saveBtn.textContent='Publier l’actualité'; delete saveBtn.dataset.label; }
  if (clearMessage && $('#adminNewsResult')) $('#adminNewsResult').innerHTML='';
}

async function loadAdminNews(){
  const wrap = $('#adminNewsList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Chargement des actualités...</div>';
  try{
    const data = await adminFetch('/api/admin/news');
    adminNewsCache = data.news || [];
    if (!adminNewsCache.length){
      wrap.innerHTML = '<div class="empty">Aucune actualité disponible pour le moment.</div>';
      return;
    }
    wrap.innerHTML = adminNewsCache.map((n, idx)=>`
      <div class="admin-q-item">
        <div class="admin-q-meta">
          <span>${newsTypeIcon(n.type)} ${escapeHtml(n.type || 'Communiqué')}</span>
          <span class="${n.is_active ? 'active' : ''}">${n.is_active ? 'Publié' : 'Masqué'}</span>
          <span>${escapeHtml(n.status || 'Info')}</span>
          ${n.hasPdf ? '<span>PDF joint</span>' : ''}
          ${n.deadline ? `<span>${formatDate(n.deadline)}</span>` : ''}
        </div>
        <h4>${escapeHtml(n.title || '')}</h4>
        <p class="admin-help">${escapeHtml(n.summary || n.organization || '')}</p>
        <div class="admin-q-actions">
          <button class="edit" onclick="editAdminNews(${idx})">Modifier</button>
          ${n.hasPdf ? `<button class="edit" onclick="openAdminNewsPdf('${escapeHtml(n.id)}')">PDF</button>` : ''}
          <button class="pause" onclick="toggleAdminNews(${idx})">${n.is_active ? 'Masquer' : 'Publier'}</button>
          <button class="delete" onclick="deleteAdminNews(${idx})">Supprimer</button>
        </div>
      </div>`).join('');
  }catch(err){
    wrap.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }
}

function editAdminNews(index){
  const n = adminNewsCache[index];
  if (!n) return;
  $('#adminNewsId') && ($('#adminNewsId').value=n.id || '');
  $('#adminNewsTitle') && ($('#adminNewsTitle').value=n.title || '');
  $('#adminNewsType') && ($('#adminNewsType').value=n.type || 'Communiqué');
  $('#adminNewsStatus') && ($('#adminNewsStatus').value=n.status || 'Info');
  $('#adminNewsOrganization') && ($('#adminNewsOrganization').value=n.organization || '');
  $('#adminNewsDeadline') && ($('#adminNewsDeadline').value=n.deadline || '');
  $('#adminNewsSummary') && ($('#adminNewsSummary').value=n.summary || '');
  $('#adminNewsContent') && ($('#adminNewsContent').value=n.content || '');
  $('#adminNewsSource') && ($('#adminNewsSource').value=n.sourceUrl || '');
  $('#adminNewsActive') && ($('#adminNewsActive').checked=Boolean(n.is_active));
  $('#adminNewsFormTitle') && ($('#adminNewsFormTitle').textContent='Modifier l’actualité');
  $('#adminNewsSaveBtn') && ($('#adminNewsSaveBtn').textContent='Enregistrer les modifications');
  setAdminTab('news');
}

async function toggleAdminNews(index){
  const n = adminNewsCache[index];
  if (!n) return;
  try{
    await adminFetch('/api/admin/news/' + encodeURIComponent(n.id) + '/status', { method:'PATCH', body:JSON.stringify({is_active:!n.is_active}) });
    await loadAdminNews();
    await loadNews();
    toast(!n.is_active ? 'Actualité publiée' : 'Actualité masquée');
  }catch(err){ toast(err.message); }
}

async function deleteAdminNews(index){
  const n = adminNewsCache[index];
  if (!n) return;
  if (!confirm('Supprimer définitivement cette actualité ?')) return;
  try{
    await adminFetch('/api/admin/news/' + encodeURIComponent(n.id), { method:'DELETE' });
    await loadAdminNews();
    await loadNews();
    toast('Actualité supprimée');
  }catch(err){ toast(err.message); }
}

function formatBytes(bytes){
  const n = Number(bytes || 0);
  if (n < 1024) return n + ' o';
  if (n < 1024*1024) return Math.round(n/1024) + ' Ko';
  return (n/1024/1024).toFixed(n > 10*1024*1024 ? 0 : 1).replace('.', ',') + ' Mo';
}

function isAdminResourceArchived(r){
  return Boolean(r?.admin_archived);
}

function resourceIcon(kind){
  if (kind === 'image') return '🖼️';
  if (kind === 'pdf') return '📄';
  if (kind === 'word') return '📝';
  return '📎';
}

function adminRevisionPayload(){
  return {
    title:String($('#adminRevisionTitle')?.value || '').trim(),
    category:$('#adminRevisionCategory')?.value || '',
    contentType:$('#adminRevisionContentType')?.value || 'Fiche de révision',
    competitionType:$('#adminRevisionCompetitionType')?.value || 'Concours direct',
    level:$('#adminRevisionLevel')?.value || 'Tous niveaux',
    duration:$('#adminRevisionDuration')?.value || '3 min',
    points:String($('#adminRevisionPoints')?.value || '').split(/\n+/).map(value => value.trim()).filter(Boolean),
    remember:String($('#adminRevisionRemember')?.value || '').trim(),
    is_premium:Boolean($('#adminRevisionPremium')?.checked),
    is_active:true
  };
}

function resetAdminRevisionForm(){
  $('#adminRevisionId') && ($('#adminRevisionId').value = '');
  $('#adminRevisionFormTitle') && ($('#adminRevisionFormTitle').textContent = 'Publier une fiche ou une notion');
  $('#adminRevisionTitle') && ($('#adminRevisionTitle').value = '');
  $('#adminRevisionPoints') && ($('#adminRevisionPoints').value = '');
  $('#adminRevisionRemember') && ($('#adminRevisionRemember').value = '');
  $('#adminRevisionContentType') && ($('#adminRevisionContentType').value = 'Fiche de révision');
  $('#adminRevisionCompetitionType') && ($('#adminRevisionCompetitionType').value = 'Concours direct');
  $('#adminRevisionLevel') && ($('#adminRevisionLevel').value = 'Tous niveaux');
  $('#adminRevisionPremium') && ($('#adminRevisionPremium').checked = false);
  $('#adminRevisionSaveBtn') && ($('#adminRevisionSaveBtn').textContent = 'Publier la fiche ou notion');
  $('#adminRevisionResult') && ($('#adminRevisionResult').innerHTML = '');
  updateAdminPublicationPreviews();
}

async function saveAdminRevisionFiche(){
  const payload = adminRevisionPayload();
  if (!ALL_QCM_CATEGORIES.includes(payload.category)){ toast('Choisis la catégorie de publication'); return; }
  if (payload.title.length < 4){ toast('Ajoute un titre clair'); return; }
  if (payload.points.length < 2){ toast('Ajoute au moins deux points essentiels'); return; }
  if (payload.remember.length < 5){ toast('Ajoute le point à retenir'); return; }
  const id = $('#adminRevisionId')?.value || '';
  const btn = $('#adminRevisionSaveBtn');
  const result = $('#adminRevisionResult');
  if (!confirm(`Publier dans « Fiches de révision → ${payload.contentType} → ${payload.competitionType} → ${payload.category} → ${payload.level} → ${payload.is_premium ? 'Premium' : 'Gratuit'} » ?`)) return;
  setButtonLoading(btn, true, id ? 'Modification...' : 'Publication...');
  try{
    const data = await adminFetch('/api/admin/revision-fiches' + (id ? '/' + encodeURIComponent(id) : ''), {
      method:id ? 'PATCH' : 'POST',
      body:JSON.stringify(payload)
    });
    resetAdminRevisionForm();
    if (result) result.innerHTML = `<div class="pay-note success">${escapeHtml(payload.contentType)} publiée dans <b>${escapeHtml(payload.category)}</b> ✅</div>`;
    toast('Publication enregistrée ✅');
    await Promise.all([loadAdminRevisionFiches(), loadRevisionFiches(true)]);
    return data;
  }catch(err){
    if (result) result.innerHTML = `<div class="pay-note error">${escapeHtml(err.message)}</div>`;
  }finally{ setButtonLoading(btn, false); }
}

function editAdminRevisionFiche(index){
  const fiche = adminRevisionCache[index];
  if (!fiche) return;
  $('#adminRevisionId') && ($('#adminRevisionId').value = fiche.id || '');
  $('#adminRevisionFormTitle') && ($('#adminRevisionFormTitle').textContent = 'Modifier la fiche ou notion');
  $('#adminRevisionCategory') && ($('#adminRevisionCategory').value = fiche.category || fiche.cat || 'Culture générale');
  $('#adminRevisionContentType') && ($('#adminRevisionContentType').value = fiche.contentType || 'Fiche de révision');
  $('#adminRevisionCompetitionType') && ($('#adminRevisionCompetitionType').value = fiche.competitionType || 'Concours direct');
  $('#adminRevisionLevel') && ($('#adminRevisionLevel').value = fiche.level || 'Tous niveaux');
  $('#adminRevisionDuration') && ($('#adminRevisionDuration').value = fiche.time || '3 min');
  $('#adminRevisionTitle') && ($('#adminRevisionTitle').value = fiche.title || '');
  $('#adminRevisionPoints') && ($('#adminRevisionPoints').value = (fiche.points || []).join('\n'));
  $('#adminRevisionRemember') && ($('#adminRevisionRemember').value = fiche.remember || '');
  $('#adminRevisionPremium') && ($('#adminRevisionPremium').checked = Boolean(fiche.is_premium));
  $('#adminRevisionSaveBtn') && ($('#adminRevisionSaveBtn').textContent = 'Enregistrer les modifications');
  updateAdminPublicationPreviews();
  window.scrollTo({ top:$('#adminRevisionPane')?.offsetTop || 0, behavior:'smooth' });
}

async function deleteAdminRevisionFiche(index){
  const fiche = adminRevisionCache[index];
  if (!fiche || !confirm(`Supprimer définitivement « ${fiche.title} » ?`)) return;
  try{
    await adminFetch('/api/admin/revision-fiches/' + encodeURIComponent(fiche.id), { method:'DELETE' });
    await Promise.all([loadAdminRevisionFiches(), loadRevisionFiches(true)]);
    toast('Publication supprimée définitivement');
  }catch(err){ toast(err.message); }
}

async function loadAdminRevisionFiches(){
  const wrap = $('#adminRevisionList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="admin-empty">Chargement...</div>';
  try{
    const data = await adminFetch('/api/admin/revision-fiches');
    adminRevisionCache = Array.isArray(data.fiches) ? data.fiches : [];
    if (!adminRevisionCache.length){ wrap.innerHTML = '<div class="admin-empty">Aucune fiche ou notion publiée.</div>'; return; }
    wrap.innerHTML = adminRevisionCache.map((fiche, index) => `
      <article class="admin-row">
        <div class="admin-row-main">
          <span class="admin-badge ${fiche.is_premium ? 'premium' : 'free'}">${fiche.is_premium ? 'Premium' : 'Gratuit'}</span>
          <h4>${escapeHtml(fiche.title)}</h4>
          <p><b>${escapeHtml(fiche.contentType || 'Fiche de révision')}</b> · ${escapeHtml(fiche.category || fiche.cat)} · ${escapeHtml(fiche.competitionType || 'Concours direct')}</p>
          <small>${escapeHtml(fiche.level || 'Tous niveaux')} · ${escapeHtml(fiche.time || '3 min')} · Bloc : Fiches de révision</small>
        </div>
        <div class="admin-q-actions"><button class="edit" onclick="editAdminRevisionFiche(${index})">Modifier</button><button class="delete" onclick="deleteAdminRevisionFiche(${index})">Supprimer</button></div>
      </article>`).join('');
  }catch(err){ wrap.innerHTML = `<div class="pay-note error">${escapeHtml(err.message)}</div>`; }
}

async function loadRevisionFiches(force=false){
  if (!force && revisionRemoteFiches.length) return revisionRemoteFiches;
  try{
    const res = await fetchWithTimeout('/api/revision-fiches?v=' + Date.now(), { cache:'no-store' });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Fiches indisponibles');
    revisionRemoteFiches = Array.isArray(data.fiches) ? data.fiches : [];
    if (currentScreenId === 'revision') renderRevisionFiches(currentRevisionFilter);
  }catch(err){
    if (force) toast(err.message || 'Fiches indisponibles');
  }
  return revisionRemoteFiches;
}

async function loadResources(){
  const wrap = $('#resourceList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Chargement des documents...</div>';
  try{
    const res = await fetchWithTimeout('/api/resources?v=' + Date.now(), { headers:authHeaders({}), cache:'no-store' });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Documents indisponibles');
    resourceCache = data.resources || [];
    if (!resourceCache.length){
      wrap.innerHTML = '<div class="empty">Aucun document disponible pour le moment.</div>';
      return;
    }
    wrap.innerHTML = resourceCache.map(r => {
      const locked = !hasOpenAccess();
      return `
      <div class="resource-card ${locked ? 'locked' : ''}">
        <div class="resource-icon">${locked ? '🔒' : resourceIcon(r.kind)}</div>
        <div>
          <h3>${escapeHtml(r.title)}</h3>
          <p>${escapeHtml(r.description || 'Document de révision pour t’aider à progresser.')}</p>
          <div class="resource-meta">
            <span>${escapeHtml(r.category || 'Documents')}</span>
            <span>${formatBytes(r.size)}</span>
            <span class="premium">Premium</span>
          </div>
          <button class="mini-btn ${locked ? 'btn-ghost' : ''}" onclick="openResource('${escapeHtml(r.id)}')">${locked ? 'Débloquer Premium' : 'Ouvrir'}</button>
        </div>
      </div>`;
    }).join('');
  }catch(err){
    wrap.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }
}

async function openResource(id){
  const item = (resourceCache || []).find(r => r.id === id);
  if (!hasOpenAccess()){
    openPremium(item?.title || 'Document Premium');
    return;
  }
  try{
    const res = await fetchWithTimeout('/api/resources/' + encodeURIComponent(id) + '/download', { headers:authHeaders({}) });
    if (!res.ok){
      const data = await res.json().catch(()=>({}));
      if (res.status === 402){ openPremium(item?.title || 'Document Premium'); return; }
      throw new Error(data.message || 'Ouverture impossible');
    }
    const blob = await res.blob();
    const isPdf = item?.kind === 'pdf' || /application\/pdf/i.test(blob.type) || /\.pdf$/i.test(String(item?.file_name || item?.title || ''));
    if (isPdf){
      await openPdfReader(blob, item?.title || 'Document PDF');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  }catch(err){
    toast(err.message || 'Document indisponible');
  }
}

function clearAdminResourceForm(){
  $('#adminResourceTitle') && ($('#adminResourceTitle').value='');
  $('#adminResourceDescription') && ($('#adminResourceDescription').value='');
  $('#adminResourceFile') && ($('#adminResourceFile').value='');
  $('#adminResourcePremium') && ($('#adminResourcePremium').checked=false);
  $('#adminResourceActive') && ($('#adminResourceActive').checked=true);
}

async function uploadAdminResource(){
  const btn = $('#adminResourceSaveBtn');
  const result = $('#adminResourceResult');
  const file = $('#adminResourceFile')?.files?.[0];
  if (!file){
    if (result) result.innerHTML = '<div class="pay-note error">Choisis un fichier PDF, Word ou image.</div>';
    return;
  }
  setButtonLoading(btn, true, 'Publication...');
  try{
    const headers = authHeaders({
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'document'),
      'X-Title': encodeURIComponent($('#adminResourceTitle')?.value || file.name || 'Document'),
      'X-Category': encodeURIComponent($('#adminResourceCategory')?.value || 'Documents'),
      'X-Description': encodeURIComponent($('#adminResourceDescription')?.value || ''),
      'X-Is-Premium': String(Boolean($('#adminResourcePremium')?.checked)),
      'X-Is-Active': 'true',
      'X-Admin-Archived': 'true'
    });
    const res = await fetchWithTimeout('/api/admin/resources/upload', { method:'POST', headers, body:file });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Publication impossible');
    if (result) result.innerHTML = '<div class="pay-note success">Document publié avec succès ✅<br>Il est rangé dans <b>Voir historique publié</b> et reste visible chez le candidat.</div>';
    clearAdminResourceForm();
    await loadAdminResources();
    await loadResources();
    toast('Document publié ✅');
  }catch(err){
    if (result) result.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }finally{
    setButtonLoading(btn, false);
  }
}

function toggleAdminResourceHistory(){
  showAdminResourceHistory = !showAdminResourceHistory;
  renderAdminResourcesFromCache();
}

function setAdminResourceFilter(filter, el){
  showAdminResourceHistory = filter !== 'current';
  $$('#adminResourceFilterRow .chip').forEach(c=>c.classList.remove('on'));
  if (el) el.classList.add('on');
  renderAdminResourcesFromCache();
}

function adminResourceHistoryItems(){
  return adminResourceCache.map((r, idx)=>({r, idx}));
}

function renderAdminResourceCards(items){
  if (!items.length) return '';
  return items.map(({r, idx})=>`
      <div class="admin-q-item">
        <div class="admin-q-meta">
          <span>${resourceIcon(r.kind)} ${escapeHtml(r.kind || 'document')}</span>
          <span>${escapeHtml(r.category || 'Documents')}</span>
          <span class="active">Publié</span>
          ${r.is_premium ? '<span class="premium">Premium</span>' : '<span>Gratuit</span>'}
        </div>
        <h4>${escapeHtml(r.title || r.fileName || 'Document')}</h4>
        <p class="admin-help">${escapeHtml(r.description || r.fileName || '')} · ${formatBytes(r.size)}</p>
        <div class="admin-q-actions">
          <button class="edit" onclick="openResource('${escapeHtml(r.id)}')">Ouvrir</button>
          <button class="delete" onclick="deleteAdminResource(${idx})">Supprimer</button>
        </div>
      </div>`).join('');
}

function renderAdminResourcesFromCache(){
  const wrap = $('#adminResourceList');
  if (!wrap) return;
  const historyItems = adminResourceHistoryItems();
  const historyCount = historyItems.length;
  const summary = $('#adminResourceSummary');
  if (summary){
    summary.innerHTML = `
      <div><b>${historyCount}</b><span>Historique publié</span></div>
      <div><b>${historyItems.filter(item => !item.r.is_premium).length}</b><span>Gratuit</span></div>
      <div><b>${historyItems.filter(item => item.r.is_premium).length}</b><span>Premium</span></div>`;
  }
  const controls = $('#adminResourceHistoryControls');
  if (controls){
    controls.innerHTML = historyCount ? `<button class="mini-btn" onclick="toggleAdminResourceHistory()">${showAdminResourceHistory ? 'Masquer l’historique publié' : `Voir historique publié (${historyCount})`}</button>` : '';
  }
  if (!historyCount){
    wrap.innerHTML = '<div class="empty">Aucun document publié pour le moment.</div>';
    return;
  }
  if (!showAdminResourceHistory){
    wrap.innerHTML = '<div class="empty">Les documents publiés sont rangés dans l’historique pour garder cet espace léger.</div>';
    return;
  }
  wrap.innerHTML = renderAdminResourceCards(historyItems) || '<div class="empty">Aucun document dans l’historique.</div>';
}

async function loadAdminResources(){
  const wrap = $('#adminResourceList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Chargement des documents...</div>';
  try{
    const data = await adminFetch('/api/admin/resources?v=' + Date.now(), { cache:'no-store' });
    adminResourceCache = data.resources || [];
    renderAdminResourcesFromCache();
  }catch(err){
    wrap.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }
}

async function deleteAdminResource(index){
  const r = adminResourceCache[index];
  if (!r) return;
  if (!confirm('Supprimer définitivement ce document de « Documents & fichiers » ? Il disparaîtra aussi chez les candidats.')) return;
  try{
    toast('Suppression définitive du document...');
    const data = await adminFetch('/api/admin/resources/' + encodeURIComponent(r.id), { method:'DELETE', cache:'no-store' });
    if (!data.deleted || !data.persisted) throw new Error('La suppression n’a pas été confirmée par le serveur.');
    adminResourceCache = adminResourceCache.filter(item => item.id !== r.id && item.title !== r.title);
    resourceCache = resourceCache.filter(item => item.id !== r.id && item.title !== r.title);
    await Promise.all([loadAdminResources(), loadResources()]);
    toast('Document supprimé définitivement ✅');
  }catch(err){ toast(err.message); }
}

async function loadAdminNotificationStatus(){
  const wrap = $('#adminNotificationStatus');
  if (!wrap) return;
  try{
    const data = await adminFetch('/api/admin/notifications/status');
    wrap.innerHTML = `
      <div><b>${data.emailConfigured ? 'Prêt' : 'Non actif'}</b><span>E-mail</span></div>
      <div><b>${data.smsConfigured ? 'Prêt' : 'Non actif'}</b><span>SMS</span></div>
      <div><b>Test</b><span>Admin</span></div>`;
  }catch(err){
    wrap.innerHTML = `<div><b>Erreur</b><span>${escapeHtml(err.message)}</span></div>`;
  }
}

async function sendAdminNotificationTest(){
  const btn = $('#adminTestNotificationBtn');
  const result = $('#adminNotificationResult');
  const email = ($('#adminTestEmail')?.value || state.user?.email || '').trim();
  const phone = normalizePhone($('#adminTestPhone')?.value || state.user?.phone || '');
  if (!email && !phone){ toast('Entre un e-mail ou un téléphone'); return; }
  setButtonLoading(btn, true, 'Envoi...');
  try{
    const data = await adminFetch('/api/admin/notifications/test', {
      method:'POST',
      body:JSON.stringify({ email, phone: fullPhone(phone), channel:'both' })
    });
    const emailText = data.results?.email?.sent ? 'E-mail envoyé ✅' : (data.results?.email?.attempted ? 'E-mail non envoyé' : 'E-mail non vérifié');
    const smsText = data.results?.sms?.sent ? 'SMS envoyé ✅' : (data.results?.sms?.attempted ? 'SMS non envoyé' : 'SMS non vérifié');
    if (result) result.innerHTML = `<div class="pay-note ${data.results?.email?.sent || data.results?.sms?.sent ? 'success' : 'warn'}">${emailText}<br>${smsText}</div>`;
    await loadAdminNotificationStatus();
  }catch(err){
    if (result) result.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }finally{
    setButtonLoading(btn, false);
  }
}

function campaignStatusLabel(status){
  return ({ pending:'Programmé', processing:'En cours', completed:'Terminé', failed:'Échec' })[status] || 'Programmé';
}

async function loadAdminEmailCampaigns(){
  const wrap = $('#adminCampaignList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="admin-empty">Chargement...</div>';
  try{
    const data = await adminFetch('/api/admin/email-campaigns');
    const rows = Array.isArray(data.campaigns) ? data.campaigns : [];
    if (!rows.length){ wrap.innerHTML = '<div class="admin-empty">Aucune campagne.</div>'; return; }
    wrap.innerHTML = rows.map(item => `
      <article class="admin-row">
        <div class="admin-row-main">
          <span class="admin-badge ${item.status === 'completed' ? 'free' : 'premium'}">${escapeHtml(campaignStatusLabel(item.status))}</span>
          <h4>${escapeHtml(item.subject || 'Message')}</h4>
          <p>${escapeHtml((item.text_body || '').slice(0, 170))}</p>
          <small>${formatDate(item.created_at)} · ${Number(item.sent_count || 0)} envoyé${Number(item.sent_count || 0) > 1 ? 's' : ''}${Number(item.failed_count || 0) ? ` · ${Number(item.failed_count)} échec${Number(item.failed_count) > 1 ? 's' : ''}` : ''}</small>
        </div>
      </article>`).join('');
  }catch(err){ wrap.innerHTML = `<div class="pay-note error">${escapeHtml(err.message)}</div>`; }
}

async function createAdminEmailCampaign(){
  const subject = String($('#adminCampaignSubject')?.value || '').trim();
  const text = String($('#adminCampaignText')?.value || '').trim();
  const ctaLabel = String($('#adminCampaignCtaLabel')?.value || 'Découvrir').trim();
  const ctaUrl = String($('#adminCampaignCtaUrl')?.value || location.origin + '/').trim();
  if (subject.length < 4){ toast('Ajoute un objet clair'); return; }
  if (text.length < 10){ toast('Ajoute un message plus complet'); return; }
  if (!confirm('Programmer cet e-mail pour les candidats ayant accepté les nouveautés ?')) return;
  const btn = $('#adminCampaignSubmitBtn');
  const result = $('#adminCampaignResult');
  setButtonLoading(btn, true, 'Programmation...');
  try{
    const data = await adminFetch('/api/admin/email-campaigns', { method:'POST', body:JSON.stringify({ subject, text, ctaLabel, ctaUrl }) });
    if (result) result.innerHTML = `<div class="pay-note success">${escapeHtml(data.message || 'Campagne programmée ✅')}</div>`;
    if ($('#adminCampaignSubject')) $('#adminCampaignSubject').value = '';
    if ($('#adminCampaignText')) $('#adminCampaignText').value = '';
    await loadAdminEmailCampaigns();
  }catch(err){
    if (result) result.innerHTML = `<div class="pay-note error">${escapeHtml(err.message)}</div>`;
  }finally{ setButtonLoading(btn, false); }
}

/* ---------- abonnement & paiements ---------- */
const BF_PAYMENT_PREFIXES = Object.freeze({
  ORANGE_MONEY:['04','05','06','07','44','45','46','54','55','56','57','64','65','66','67','74','75','76','77'],
  MOOV_MONEY:['01','02','03','50','51','52','53','60','61','62','63','70','71','72','73'],
  TELECEL:['58','68','69','78','79']
});

function burkinaPaymentOperator(phone){
  const local = normalizePhone(phone);
  if (!/^\d{8}$/.test(local)) return local ? 'INVALID' : '';
  const prefix = local.slice(0, 2);
  if (BF_PAYMENT_PREFIXES.ORANGE_MONEY.includes(prefix)) return 'ORANGE_MONEY';
  if (BF_PAYMENT_PREFIXES.MOOV_MONEY.includes(prefix)) return 'MOOV_MONEY';
  if (BF_PAYMENT_PREFIXES.TELECEL.includes(prefix)) return 'TELECEL';
  return 'UNKNOWN';
}

function paymentProviderLabel(provider){
  return provider === 'MOOV_MONEY' ? 'Moov Money (Telmob)' : provider === 'ORANGE_MONEY' ? 'Orange Money' : 'Mobile Money';
}

function paymentPhoneValidation(phone, provider=state.selectedProvider){
  const local = normalizePhone(phone);
  if (!local) return { valid:false, complete:false, tone:'', message:'Le numéro à débiter peut être différent du numéro de connexion.' };
  if (local.length !== 8) return { valid:false, complete:false, tone:'', message:'Entre les 8 chiffres du numéro Mobile Money.' };
  const operator = burkinaPaymentOperator(local);
  if (operator === 'TELECEL') return { valid:false, complete:true, tone:'error', message:'Numéro Telecel détecté. Le paiement est disponible uniquement avec Orange Money ou Moov Money.' };
  if (operator === 'UNKNOWN' || operator === 'INVALID') return { valid:false, complete:true, tone:'error', message:'Ce préfixe mobile n’est pas reconnu pour Orange ou Moov au Burkina Faso.' };
  if (operator !== provider){
    const detected = paymentProviderLabel(operator);
    return { valid:false, complete:true, tone:'error', operator, message:`Numéro ${detected} détecté. Sélectionne ${detected} pour continuer.` };
  }
  const label = paymentProviderLabel(operator);
  return { valid:true, complete:true, tone:'success', operator, message:`✓ Numéro ${label} reconnu.` };
}

function updatePaymentPhoneNetworkHint(){
  const input = $('#subPhone');
  const hint = $('#paymentNetworkHint');
  const button = $('#payBtn');
  if (!input || !hint) return;
  const validation = paymentPhoneValidation(input.value, state.selectedProvider);
  hint.className = `payment-network-hint ${validation.tone || ''}`.trim();
  hint.textContent = validation.message;
  input.classList.toggle('input-error', validation.complete && !validation.valid);
  input.classList.toggle('input-success', validation.valid);
  input.setAttribute('aria-invalid', validation.complete && !validation.valid ? 'true' : 'false');
  if (button) button.disabled = !validation.valid || isAdmin();
}

function handlePaymentPhoneInput(input){
  if (input) input.value = input.value.replace(/[^0-9 +]/g, '').slice(0, 15);
  runtimePaymentMessage = '';
  updatePaymentPhoneNetworkHint();
}

function selectProvider(provider, clearMessage=false){
  state.selectedProvider = provider;
  if (clearMessage) runtimePaymentMessage = '';
  save();
  $$('#providerGrid .provider-option').forEach(btn=>btn.classList.toggle('on', btn.dataset.provider === provider));
  updatePaymentPhoneNetworkHint();
}

function selectPlan(planId){
  state.selectedPlan = subscriptionPlan(planId).id;
  runtimePaymentMessage = '';
  save();
  renderSubscription();
}

function planPriceHtml(plan){
  if (plan.id === 'premium_annual'){
    return `<del>${money(plan.regularAmount)}</del> ${money(plan.amount)} <span>/ an</span>`;
  }
  return `${money(plan.amount)} <span>/ mois</span>`;
}

function renderSubscription(){
  renderAccount();
  const plan = selectedSubscriptionPlan();
  selectProvider(state.selectedProvider || 'ORANGE_MONEY');
  $$('#planChoiceGrid .plan-choice').forEach(btn=>btn.classList.toggle('on', btn.dataset.plan === plan.id));

  const payBox = $('#subscription .pay-box');
  const integrationNote = $('#subscription .integration-note');
  const planBadge = $('#subscription .plan-badge');
  const instruction = $('#paymentInstruction');
  if (ACCESS_OPEN_UNTIL_PAYMENT){
    if (planBadge) planBadge.textContent = '✅ Accès découverte';
    if (payBox) payBox.style.display = 'none';
    if (integrationNote){
      integrationNote.style.display = 'block';
      integrationNote.innerHTML = '<b>Accès découverte :</b> révise les contenus disponibles librement pendant la période d’accès.';
    }
    const status = $('#subStatus');
    if (status){
      status.className = 'sub-status active';
      status.innerHTML = '✅ Accès découverte actif : révise les QCM corrigés disponibles librement.';
    }
    return;
  } else {
    if (payBox) payBox.style.display = '';
    if (integrationNote) integrationNote.style.display = '';
    if (planBadge) planBadge.textContent = '⭐ Réussite Premium';
    if (instruction) instruction.innerHTML = `Abonnement sélectionné : <b>${plan.label}</b> — ${money(plan.amount)} / ${plan.durationLabel}. Choisis ton réseau puis valide le paiement.`;
  }

  const subPhone = $('#subPhone');
  if (subPhone && !subPhone.value && state.user?.phone) subPhone.value = prettyPhone(state.user.phone);
  updatePaymentPhoneNetworkHint();

  const status = $('#subStatus');
  if (status){
    if (isAdmin()){
      status.className = 'sub-status active';
      status.innerHTML = '🔓 Accès complet actif — ton compte administrateur est au niveau Pro.';
    } else if (isPremium()){
      status.className = 'sub-status active';
      status.innerHTML = `✅ Premium actif — expire le <b>${formatDate(state.subscription.expiresAt)}</b> (${premiumDaysLeft()} jour${premiumDaysLeft()>1?'s':''} restant${premiumDaysLeft()>1?'s':''})`;
    } else if (state.pendingPayment){
      status.className = 'sub-status pending';
      const pendingPlan = subscriptionPlan(state.pendingPayment.plan || state.selectedPlan);
      status.innerHTML = `⏳ Paiement ${pendingPlan.label} en attente — référence <b>${state.pendingPayment.ref}</b>`;
    } else if (paywallFeature){
      status.className = 'sub-status premium-prompt';
      status.innerHTML = `🔓 Premium ouvre <b>${paywallFeature}</b> et tous les entraînements avancés.`;
    } else {
      status.className = 'sub-status premium-prompt';
      status.innerHTML = 'Avec Premium, révise sans limite avec toutes les matières, les examens blancs et la correction de tes erreurs.';
    }
  }

  const payBtn = $('#payBtn');
  if (payBtn) payBtn.textContent = isAdmin() ? 'Accès complet actif' : `${isPremium() ? 'Renouveler' : plan.actionLabel} — ${money(plan.amount)}`;
  const demoBtn = $('#demoPayBtn');
  if (demoBtn) demoBtn.style.display = (PAYMENT_CONFIG.demoMode && !isPremium()) ? 'flex' : 'none';

  const result = $('#paymentResult');
  if (result){
    if (runtimePaymentMessage){
      result.innerHTML = runtimePaymentMessage;
    } else {
      result.innerHTML = `<div class="pay-note">Choisis <b>${plan.label}</b>, ton réseau Mobile Money, entre ton numéro puis appuie sur “${plan.actionLabel}”.</div>`;
    }
  }
}

function makeTxRef(){
  return 'RCBF-' + Date.now() + '-' + Math.random().toString(36).slice(2,8).toUpperCase();
}

function paymentApiBase(){
  return (PAYMENT_CONFIG.backendBaseUrl || location.origin).replace(/\/$/, '');
}

async function startSubscriptionPayment(){
  if (!state.user){
    nextAfterLogin = 'subscription';
    toast('Connecte ton numéro avant de payer');
    authMode = 'login';
    show('login');
    return;
  }

  const phone = normalizePhone($('#subPhone')?.value || '');
  const phoneValidation = paymentPhoneValidation(phone, state.selectedProvider);
  if (!phoneValidation.valid){
    runtimePaymentMessage = `<div class="pay-note error">${escapeHtml(phoneValidation.message)}</div>`;
    renderSubscription();
    toast(phoneValidation.message);
    return;
  }

  const plan = selectedSubscriptionPlan();
  const txRef = makeTxRef();
  const payload = {
    amount: plan.amount,
    currency: PAYMENT_CONFIG.currency,
    plan: plan.id,
    provider: state.selectedProvider,
    transactionId: txRef,
    customer: {phone: fullPhone(phone), email: state.user.email || ''},
    returnUrl: location.origin + location.pathname + '#subscription'
  };

  const btn = $('#payBtn');
  setButtonLoading(btn, true, 'Initialisation...');

  try{
    const res = await fetchWithTimeout(paymentApiBase() + '/api/payments/saspay/init', {
      method:'POST',
      headers: authHeaders({'Content-Type':'application/json'}),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Impossible de lancer le paiement');

    state.pendingPayment = {
      ref: data.transactionId || txRef,
      paymentId: data.paymentId || null,
      sessionId: data.sessionId || null,
      amount: plan.amount,
      currency: PAYMENT_CONFIG.currency,
      plan: plan.id,
      provider: state.selectedProvider,
      phone,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    save();

    if (data.paymentUrl){
      location.href = data.paymentUrl;
      return;
    }
    runtimePaymentMessage = data.mode === 'checkout'
      ? `<div class="pay-note warn">La page de paiement n’a pas pu s’ouvrir. Réessaie le paiement dans quelques instants. Réf. <b>${state.pendingPayment.ref}</b></div>`
      : `<div class="pay-note success"><b>Demande ${paymentProviderLabel(state.selectedProvider)} envoyée.</b><br>Numéro à débiter : <b>${escapeHtml(prettyPhone(phone))}</b>.<br>Abonnement : <b>${plan.label}</b> (${money(plan.amount)}). Valide sur le téléphone puis clique sur “Vérifier mon paiement”. Réf. <b>${state.pendingPayment.ref}</b></div>`;
    renderSubscription();
  }catch(err){
    const detail = String(err?.message || '');
    const safeDetail = /^(Ce numéro|Ce préfixe|Entre un numéro|Choisis Orange|Numéro (Orange|Moov|Telecel)|Seuls Orange)/i.test(detail)
      ? detail
      : 'Paiement indisponible pour le moment. Vérifie le numéro puis réessaie.';
    runtimePaymentMessage = `<div class="pay-note error">${escapeHtml(safeDetail)}</div>`;
    renderSubscription();
  }finally{
    setButtonLoading(btn, false);
    updatePaymentPhoneNetworkHint();
  }
}

async function checkPaymentStatus(){
  if (!state.user){ nextAfterLogin='subscription'; show('login'); return; }
  const btn = $('#checkPayBtn');
  setButtonLoading(btn, true, 'Vérification...');
  try{
    const pending = state.pendingPayment || {};
    const params = new URLSearchParams({ phone: fullPhone(state.user.phone) });
    if (pending.ref) params.set('transactionId', pending.ref);
    if (pending.paymentId) params.set('paymentId', pending.paymentId);
    if (pending.sessionId) params.set('sessionId', pending.sessionId);
    const url = pending.ref
      ? paymentApiBase() + '/api/payments/saspay/status?' + params.toString()
      : paymentApiBase() + '/api/subscription/status?phone=' + encodeURIComponent(fullPhone(state.user.phone));
    const res = await fetchWithTimeout(url, { headers: authHeaders({}) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Statut indisponible');
    if (data.active){
      state.subscription = {status:'premium', expiresAt:data.expiresAt, txRef:data.txRef, provider:data.provider || state.selectedProvider, plan:data.plan || state.pendingPayment?.plan || state.selectedPlan};
      state.pendingPayment = null;
      save();
      state.sessionGreeting = { text:`Premium activé pour ${displayUserName()}`, sub:`Renouvellement à prévoir le ${formatDate(state.subscription.expiresAt)}.` };
      runtimePaymentMessage = '<div class="pay-note success">Paiement confirmé ✅ Premium activé.</div>';
      renderAccount();
      await loadSupabaseQuestions();
      renderFormations(currentFormFilter);
      confetti();
    } else {
      runtimePaymentMessage = `<div class="pay-note warn">${escapeHtml(data.message || 'Paiement en cours de confirmation par le réseau. Clique de nouveau sur “Vérifier mon paiement” dans quelques instants.')}</div>`;
    }
    renderSubscription();
  }catch(err){
    runtimePaymentMessage = '<div class="pay-note error">Vérification indisponible pour le moment. Réessaie dans quelques instants.</div>'; 
    renderSubscription();
  }finally{
    setButtonLoading(btn, false);
  }
}

async function simulatePaymentSuccess(){
  if (!state.user){
    nextAfterLogin = 'subscription';
    toast('Connecte-toi d’abord');
    show('login');
    return;
  }
  const tx = state.pendingPayment?.ref || ('TEST-' + Date.now());
  const plan = selectedSubscriptionPlan();
  activatePremium(plan.days, tx, state.selectedProvider);
  state.subscription.plan = plan.id;
  runtimePaymentMessage = `<div class="pay-note success">Premium activé pour ${plan.days} jours ✅</div>`;
  paywallFeature = null;
  renderSubscription();
  renderAccount();
  await loadSupabaseQuestions();
  renderFormations(currentFormFilter);
  toast('Premium activé ✅');
  confetti();
}

/* ---------- rendus ---------- */

function allRevisionFiches(){
  return Array.isArray(revisionRemoteFiches) ? revisionRemoteFiches : [];
}

function revisionReadSet(){
  return new Set(Array.isArray(state.revisionRead) ? state.revisionRead : []);
}

function revisionFilteredList(filter = currentRevisionFilter){
  const f = filter || 'Tout';
  return allRevisionFiches().filter(item => {
    if (f === 'Tout') return true;
    const paid = item.is_premium === undefined ? isPaidCategory(item.cat) : Boolean(item.is_premium);
    if (f === 'Gratuit') return !paid;
    if (f === 'Premium') return paid;
    return item.cat === f;
  });
}

function filterRevisionFiches(el, filter){
  currentRevisionFilter = filter || 'Tout';
  $$('#revisionFilterRow .chip').forEach(c=>c.classList.remove('on'));
  if (el) el.classList.add('on');
  renderRevisionFiches(currentRevisionFilter);
}

function openRecommendedRevision(){
  currentRevisionFilter = smartRecommendedCategory();
  show('revision');
}

function markRevisionFiche(id){
  if (!id) return;
  const read = revisionReadSet();
  read.add(id);
  state.revisionRead = [...read];
  save();
  renderRevisionFiches(currentRevisionFilter);
  toast('Fiche marquée comme lue ✅');
}

function renderRevisionFiches(filter = currentRevisionFilter){
  renderAccount();
  currentRevisionFilter = filter || 'Tout';
  const allFiches = allRevisionFiches();
  const hasFiches = allFiches.length > 0;
  const filterRow = $('#revisionFilterRow');
  if (filterRow) filterRow.style.display = hasFiches ? '' : 'none';
  $$('#revisionFilterRow .chip').forEach(c=>c.classList.toggle('on', c.dataset.filter === currentRevisionFilter));

  const progress = $('#revisionProgressCard');
  if (progress) progress.style.display = hasFiches ? '' : 'none';
  const wrap = $('#revisionList');
  if (!wrap) return;
  if (!hasFiches){
    wrap.innerHTML = `<div class="revision-empty">
      <span>📘</span>
      <h3>Aucune fiche publiée pour le moment</h3>
      <p>Les fiches de révision et notions importantes pour les concours directs et professionnels apparaîtront ici après leur publication.</p>
    </div>`;
    return;
  }

  const list = revisionFilteredList(currentRevisionFilter);
  const read = revisionReadSet();
  const readCount = allFiches.filter(f=>read.has(f.id)).length;
  const pct = Math.round(readCount / allFiches.length * 100);
  const recCat = smartRecommendedCategory();
  const rec = allFiches.find(f=>f.cat === recCat) || allFiches[0];
  if (progress){
    progress.innerHTML = `
      <div class="revision-progress-copy">
        <span>Progression fiches</span>
        <b>${readCount}/${allFiches.length} lue${readCount>1?'s':''}</b>
        <small>Conseil du jour : ${escapeHtml(rec.title)}</small>
      </div>
      <div class="revision-progress-actions">
        <button class="mini-btn" onclick="openRecommendedRevision()">Lire la fiche conseillée</button>
        <i><em style="width:${pct}%"></em></i>
      </div>`;
  }
  if (!list.length){
    wrap.innerHTML = '<div class="revision-empty compact"><span>📂</span><h3>Aucun contenu pour ce choix</h3><p>Essaie une autre catégorie ou un autre accès.</p></div>';
    return;
  }
  wrap.innerHTML = list.map(f=>{
    const paid = Boolean(f.is_premium);
    const locked = paid && !hasOpenAccess();
    const done = read.has(f.id);
    const access = paid ? 'Premium' : 'Gratuit';
    const contentType = f.contentType || 'Fiche de révision';
    const competitionType = f.competitionType || 'Concours directs et professionnels';
    const points = Array.isArray(f.points) ? f.points : [];
    const body = locked
      ? `<div class="revision-locked-note"><b>Contenu Premium</b><span>Active Premium pour lire cette publication.</span></div>`
      : `<ul class="revision-points">${points.map(p=>`<li>${escapeHtml(p)}</li>`).join('')}</ul>
         <div class="revision-remember"><b>À retenir</b><span>${escapeHtml(f.remember || '')}</span></div>`;
    const action = locked
      ? `<button class="btn btn-green" onclick="openPremium('les fiches de révision Premium')">Débloquer Premium</button>`
      : `<button class="btn btn-ghost" onclick='markRevisionFiche(${JSON.stringify(f.id)})'>${done?'Lue ✅':'Marquer comme lue'}</button>`;
    return `<article class="revision-card ${locked?'locked':''} ${done?'read':''}">
      <div class="revision-head">
        <img class="revision-thumb" src="${escapeHtml(f.img || 'img/study.jpg')}" alt="${escapeHtml(f.cat || f.category || 'Révision')}">
        <div>
          <div class="revision-meta">
            <span>${escapeHtml(contentType)}</span>
            <span class="${paid?'premium':'free'}">${paid?'🔒 ':''}${access}</span>
            <span>${escapeHtml(f.time || '3 min')}</span>
          </div>
          <h3>${escapeHtml(f.title)}</h3>
          <p>${escapeHtml(f.cat || f.category)} · ${escapeHtml(competitionType)} · ${escapeHtml(f.level || 'Tous niveaux')}</p>
        </div>
      </div>
      ${body}
      <div class="revision-actions">${action}</div>
    </article>`;
  }).join('');
}

function smartSuccessRate(){
  const answered = Number(state.answered || 0);
  return answered ? Math.round((Number(state.correct || 0) / answered) * 100) : 0;
}

function smartCandidateLevel(){
  const answered = Number(state.answered || 0);
  if (answered >= 500) return 'Avancé';
  if (answered >= 200) return 'Solide';
  if (answered >= 50) return 'Régulier';
  return answered ? 'En progression' : 'Nouveau départ';
}

function smartWeakCategory(){
  const rows = Object.entries(state.catStats || {})
    .map(([cat, stat]) => ({ cat, ok:Number(stat?.ok || 0), total:Number(stat?.total || 0) }))
    .filter(row => row.total >= 3)
    .map(row => ({ ...row, rate:Math.round((row.ok / row.total) * 100) }))
    .sort((a, b) => a.rate - b.rate || b.total - a.total);
  return rows[0] || null;
}

function smartRecommendedCategory(){
  const weak = smartWeakCategory();
  if (weak?.cat) return weak.cat;
  if (!state.answered) return 'Burkina Faso';
  return hasOpenAccess() ? 'Mathématiques' : 'Culture générale';
}

function startSmartRecommendation(){
  const cat = smartRecommendedCategory();
  const title = smartWeakCategory()?.cat ? `Renforcer ${cat}` : `Réviser ${cat}`;
  if (isPaidCategory(cat)){
    startFormationQuiz(title, cat);
    return;
  }
  const n = hasOpenAccess() ? 'all' : 10;
  startQuiz({n, time:0, title, cat, free:!hasOpenAccess()});
}

function renderSmartDashboard(){
  const card = $('#smartDashboardCard');
  if (!card) return;
  if (!state.user){
    card.style.display = 'none';
    card.innerHTML = '';
    return;
  }
  const firstName = escapeHtml((displayUserName().split(/\s+/)[0] || 'Candidat'));
  const answered = Number(state.answered || 0);
  const rate = smartSuccessRate();
  const level = smartCandidateLevel();
  const errors = state.errors.length;
  const weak = smartWeakCategory();
  const recCat = smartRecommendedCategory();
  const dailyDone = state.dailyDone === today();
  const focusText = weak
    ? `${escapeHtml(weak.cat)} · ${weak.rate}% de réussite`
    : `${escapeHtml(recCat)} · 10 QCM pour commencer`;
  const dailyText = dailyDone ? 'Défi du jour validé' : '10 QCM gratuits à faire aujourd’hui';
  const mainLabel = dailyDone ? 'Continuer ma révision' : 'Faire le défi du jour';
  const mainAction = dailyDone ? "show('formations')" : 'startDaily()';
  const secondLabel = errors ? `Revoir ${errors} erreur${errors>1?'s':''}` : 'Voir les nouveaux QCM';
  const secondAction = errors ? "show('errors')" : "show('publishedqcm')";
  card.style.display = 'block';
  card.innerHTML = `
    <div class="smart-top">
      <div>
        <span>Tableau de bord</span>
        <h2>Bonjour ${firstName}</h2>
        <p>${dailyText}. Concentre-toi sur ce qui peut améliorer ton score aujourd’hui.</p>
      </div>
      <div class="smart-ring" style="--p:${rate}"><b>${rate}%</b><small>réussite</small></div>
    </div>
    <div class="smart-stats">
      <div><b>${answered}</b><span>QCM faits</span></div>
      <div><b>${level}</b><span>Niveau</span></div>
      <div><b>${errors}</b><span>À revoir</span></div>
    </div>
    <div class="smart-focus">
      <span>🎯 Priorité</span>
      <b>${focusText}</b>
    </div>
    <div class="smart-actions">
      <button class="btn btn-green" onclick="${mainAction}">${mainLabel}</button>
      <button class="btn btn-ghost" onclick="${secondAction}">${secondLabel}</button>
      <button class="btn btn-ghost" onclick="startSmartRecommendation()">Réviser la priorité</button>
    </div>`;
}

function renderHome(){
  renderAccount();
  renderSmartDashboard();
  const homeToolsTitle = $('#homeToolsTitle');
  if (homeToolsTitle) homeToolsTitle.textContent = state.user ? 'Mon espace de révision' : 'Tes outils';
  $('#streakVal').textContent = state.streak;
  $('#errCount').textContent = state.errors.length;
  $('#errCount').style.display = state.errors.length ? 'grid' : 'none';
  $('#errSub').textContent = state.errors.length ? state.errors.length + ' question' + (state.errors.length>1?'s':'') + ' à revoir' : 'Aucune pour l\u2019instant';
  const done = state.dailyDone === today();
  $('#dailyCard').style.opacity = done ? .55 : 1;
  $('#dailySub').textContent = done ? 'Déjà fait aujourd\u2019hui ✅' : '10 QCM gratuits · chaque jour';
}

function renderPassport(){
  renderAccount();
  const lvl = Math.floor(state.xp/200)+1;
  const inLvl = state.xp % 200;
  const names = ['Débutant','Apprenti','Étudiant sérieux','Candidat solide','Expert','Maître des concours'];
  $('#lvlName').textContent = 'Niveau '+lvl+' · '+ (names[Math.min(lvl-1, names.length-1)]);
  $('#xpTxt').textContent = inLvl+' / 200 XP — total '+state.xp+' XP';
  setTimeout(()=>{ $('#xpFill').style.width = (inLvl/200*100)+'%'; }, 80);

  const badges = [
    {id:'b1', icon:'🥇', name:'Premier quiz', desc:'Terminer 1 quiz', won: state.quizDone>=1},
    {id:'b2', icon:'🔥', name:'Régulier', desc:'Série de 3 jours', won: state.streak>=3},
    {id:'b3', icon:'💯', name:'Sans faute', desc:'Score de 100%', won: state.bestScore>=100},
    {id:'b4', icon:'📚', name:'Studieux', desc:'100 réponses', won: state.answered>=100},
    {id:'b5', icon:'🎯', name:'Précis', desc:'80% ou plus', won: state.bestScore>=80},
    {id:'b6', icon:'🏆', name:'Marathonien', desc:'10 quiz terminés', won: state.quizDone>=10},
  ];
  $('#badgeGrid').innerHTML = badges.map(b=>`
    <div class="badge ${b.won?'won':''}">
      <div class="bi">${b.icon}</div>
      <h5>${b.name}</h5><p>${b.desc}</p>
    </div>`).join('');
}

function renderStats(){
  renderAccount();
  $('#stQuiz').textContent = state.quizDone;
  $('#stAns').textContent = state.answered;
  $('#stRate').textContent = state.answered ? Math.round(state.correct/state.answered*100)+'%' : '—';
  $('#stStreak').textContent = state.streak+' j';
  const cats = Object.entries(state.catStats);
  if (!cats.length){
    $('#barWrap').innerHTML = '<div class="empty"><div class="big">📊</div>Fais ton premier quiz pour voir tes statistiques par matière.</div>';
    return;
  }
  $('#barWrap').innerHTML = cats.map(([c,s])=>{
    const p = Math.round(s.ok/s.total*100);
    return `<div class="bar-row"><span class="lbl">${c}</span><div class="track"><div class="fill" data-p="${p}"></div></div><span class="pct">${p}%</span></div>`;
  }).join('');
  setTimeout(()=>$$('#barWrap .fill').forEach(f=>f.style.width=f.dataset.p+'%'), 80);
}

function renderErrors(){
  renderAccount();
  const w = $('#errList');
  if (!state.errors.length){
    w.innerHTML = '<div class="empty"><div class="big">🎉</div>Aucune erreur enregistrée.<br>Continue comme ça !</div>';
    $('#errReviewBtn').style.display='none';
    return;
  }
  $('#errReviewBtn').style.display='flex';
  w.innerHTML = state.errors.map(e=>`
    <div class="err-item">
      <h4>${e.q}</h4>
      <div class="good">✔ ${e.good}</div>
      <div class="exp">${e.exp}</div>
    </div>`).join('');
}

function formationGroups(){
  return {
    'Matières':[
      ['img/subject-history-geo.svg','Histoire-Géographie','Histoire-Géo',''],
      ['img/subject-svt.svg','SVT','SVT',''],
      ['img/subject-french.svg','Français','Français',''],
      ['img/subject-math.svg','Mathématiques','Mathématiques',''],
      ['img/subject-svt.svg','Physique-Chimie','Physique-Chimie',''],
      ['img/subject-psychotech.svg','Psychotechnique','Psychotechnique','']
    ],
    'Concours & examens':[
      ['img/level-bac.svg','BAC','Culture générale','BAC'],
      ['img/level-bepc.svg','BEPC','Culture générale','BEPC'],
      ['img/subject-greffier.svg','Greffier (SG & Parquet)','Greffier / Droit','Concours'],
      ['img/subject-economy.svg','Économie & Droit','Greffier / Droit','Concours']
    ],
    'Culture & monde':[
      ['img/subject-culture.svg','Culture générale','Culture générale',''],
      ['img/subject-history-geo.svg','Géographie du monde','Histoire-Géo','']
    ],
    'Burkina Faso':[
      ['img/subject-burkina.svg','Les 47 provinces','Burkina Faso',''],
      ['img/subject-history-geo.svg','Histoire du Faso','Burkina Faso',''],
      ['img/subject-culture.svg','Culture burkinabè','Burkina Faso','']
    ]
  };
}

function startFormationQuiz(title, cat, level=''){
  const paid = isPaidCategory(cat);
  if (paid){
    startQuiz({n:'all', time:0, title, cat, level:level || undefined});
    return;
  }
  const freeLimit = hasOpenAccess() ? 'all' : 10;
  startQuiz({n:freeLimit, time:0, title, cat, level:level || undefined, free:true});
}

function normalizeModuleCategory(value){
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (['histoire geo','histoire geographie'].includes(normalized)) return 'histoire geo';
  if (['physique chimie','physique'].includes(normalized)) return 'physique chimie';
  if (['greffier droit','droit greffier'].includes(normalized)) return 'greffier droit';
  return normalized;
}

function publicationMatchesModule(set, module=currentModuleQcm){
  if (normalizeModuleCategory(set?.category) !== normalizeModuleCategory(module?.category)) return false;
  return !module?.level || String(set?.level || '').toLowerCase() === String(module.level).toLowerCase();
}

function categoryHasPublishedAccess(category, premium){
  return publishedQcmCache.some(set => normalizeModuleCategory(set.category) === normalizeModuleCategory(category) && Boolean(set.is_premium) === Boolean(premium));
}

function moduleBankCount(module=currentModuleQcm){
  return questionBank().filter(q => q.c === module.category && (!module.level || q.level === module.level)).length;
}

function openFormationModule(title, category, level='', image='img/subject-culture.svg'){
  currentModuleQcm = { title, category, level:level || '', image:image || 'img/subject-culture.svg' };
  show('moduleqcm');
  renderCurrentModuleHeader();
  loadCurrentModuleQcm(true);
}

function renderCurrentModuleHeader(){
  const module = currentModuleQcm;
  const count = moduleBankCount(module);
  const paidBank = isPaidCategory(module.category);
  const title = module.title || module.category || 'Formation';
  $('#moduleQcmTitle') && ($('#moduleQcmTitle').textContent = title);
  $('#moduleQcmHeading') && ($('#moduleQcmHeading').textContent = title);
  const image = $('#moduleQcmImage');
  if (image){ image.src = module.image || 'img/subject-culture.svg'; image.alt = 'Illustration ' + title; }
  $('#moduleQcmAccess') && ($('#moduleQcmAccess').textContent = 'Séries gratuites et Premium du même module');
  $('#moduleQcmDescription') && ($('#moduleQcmDescription').textContent = `Les QCM publiés en ${module.category}${module.level ? ' · ' + module.level : ''} sont classés ici automatiquement.`);
  const meta = $('#moduleBankMeta');
  if (meta) meta.textContent = `${formatQcmCount(count)} corrigés${paidBank ? ' · banque Premium' : hasOpenAccess() ? ' disponibles' : ' · 10 gratuits par session'}`;
  const button = $('#moduleBankButton');
  button?.classList.toggle('locked', paidBank && !hasOpenAccess());
}

function startCurrentModuleBank(){
  const module = currentModuleQcm;
  startFormationQuiz(module.title, module.category, module.level || '');
}

async function loadCurrentModuleQcm(force=false){
  const wrap = $('#modulePublishedQcmList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Chargement des QCM du module...</div>';
  try{
    await fetchPublishedQcmPublications(force);
    renderCurrentModulePublications();
  }catch(err){
    wrap.innerHTML = `<div class="pay-note error">${escapeHtml(err.message || 'QCM du module indisponibles')}</div>`;
  }
}

function renderCurrentModulePublications(){
  const wrap = $('#modulePublishedQcmList');
  if (!wrap) return;
  const items = publishedQcmCache.map((set, idx)=>({set, idx})).filter(({set})=>publicationMatchesModule(set));
  if (!items.length){
    wrap.innerHTML = '<div class="empty"><div class="big">📭</div>Aucune nouvelle série publiée dans ce module pour le moment.<br>La banque du module reste disponible ci-dessus.</div>';
    return;
  }
  wrap.innerHTML = items.map(({set, idx})=>publishedQcmCardHtml(set, idx)).join('');
}

function renderFormations(filter){
  renderAccount();
  currentFormFilter = filter || currentFormFilter || 'Tout';
  const groups = formationGroups();
  const accessFilter = currentFormFilter === 'Gratuit' || currentFormFilter === 'Premium';
  const keys = accessFilter || currentFormFilter === 'Tout' ? Object.keys(groups) : [currentFormFilter];
  const html = keys.map(g=>{
    const rawItems = groups[g] || [];
    const items = rawItems.filter(([, , cat]) => {
      if (currentFormFilter === 'Gratuit') return isFreeCategory(cat) || categoryHasPublishedAccess(cat, false);
      if (currentFormFilter === 'Premium') return isPaidCategory(cat) || categoryHasPublishedAccess(cat, true);
      return true;
    });
    if (!items.length) return '';
    return `
    <div class="section"><div class="section-head"><h2>${g}</h2></div>
    <div class="form-list">
      ${items.map(([img,name,cat,level])=>{
        const total = questionBank().filter(q=>q.c === cat && (!level || q.level === level)).length;
        const paid = isPaidCategory(cat);
        const publishedCount = publishedQcmCache.filter(set=>publicationMatchesModule(set,{category:cat,level:level || ''})).length;
        const titleHtml = escapeHtml(name);
        const bankDesc = paid
          ? `Banque du module : ${formatQcmCount(total)} Premium`
          : `${hasOpenAccess() ? formatQcmCount(total) + ' corrigés disponibles' : '10 QCM gratuits pour débuter'}`;
        const desc = publishedCount ? `${bankDesc} · ${publishedCount} nouvelle${publishedCount>1?'s':''} série${publishedCount>1?'s':''}` : bankDesc;
        return `<button class="form-item" onclick='openFormationModule(${JSON.stringify(name)},${JSON.stringify(cat)},${JSON.stringify(level || '')},${JSON.stringify(img)})'>
          <img class="form-thumb" src="${img}" alt="${escapeHtml(name)}">
          <span class="fi-body"><h4>${titleHtml}</h4><p>${desc}</p></span>
          <span class="chev">›</span>
        </button>`;
      }).join('')}
    </div></div>`;
  }).join('');
  $('#formWrap').innerHTML = html || '<div class="section"><div class="empty">Aucune formation dans ce filtre.</div></div>';
}

function filterForm(el, f){
  currentFormFilter = f;
  $$('#chipRow .chip').forEach(c=>c.classList.remove('on'));
  if (el) el.classList.add('on');
  renderFormations(f);
}

function filterFormAccess(f){
  currentFormFilter = f;
  $$('#chipRow .chip').forEach(c=>c.classList.toggle('on', c.textContent.trim().toLowerCase().includes(f.toLowerCase())));
  renderFormations(f);
}


/* ---------- Nouveaux QCM ---------- */
function mapPublishedQuestion(row){
  return {
    c:row.category,
    level:row.level,
    q:row.question_text,
    o:[row.option_a,row.option_b,row.option_c,row.option_d].filter(option => String(option || '').trim()),
    a:Number(row.correct_answer),
    e:row.explanation || '',
    premium:Boolean(row.is_premium)
  };
}

async function fetchPublishedQcmPublications(force=false){
  if (!force && publishedQcmLoadedAt && Date.now() - publishedQcmLoadedAt < 30000) return publishedQcmCache;
  const res = await fetchWithTimeout('/api/qcm-publications', { headers:authHeaders({ 'Cache-Control':'no-cache' }), cache:'no-store' });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.message || 'Nouveaux QCM indisponibles');
  publishedQcmCache = data.publications || [];
  publishedQcmLoadedAt = Date.now();
  return publishedQcmCache;
}

async function loadPublishedQcm(filter){
  currentPublishedQcmFilter = filter || currentPublishedQcmFilter || 'all';
  const wrap = $('#publishedQcmList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Chargement des nouveaux QCM...</div>';
  try{
    await fetchPublishedQcmPublications(true);
    renderPublishedQcm();
    if (currentScreenId === 'formations') renderFormations(currentFormFilter);
  }catch(err){
    wrap.innerHTML = `<div class="pay-note error">${escapeHtml(err.message || 'Nouveaux QCM indisponibles')}</div>`;
  }
}

function publishedQcmCardHtml(set, idx){
  const locked = Boolean(set.locked || (set.is_premium && !hasOpenAccess()));
  const date = set.date ? formatDate(set.date) : 'Date non précisée';
  const count = Number(set.questionCount || set.questions?.length || 0);
  const action = locked ? 'Débloquer Premium' : (!hasOpenAccess() && !set.is_premium ? 'Commencer 10 QCM gratuits' : 'Commencer le quiz');
  return `<div class="published-qcm-card ${set.is_premium ? 'premium' : 'free'} ${locked ? 'locked' : ''}">
    <div class="published-qcm-top">
      <span>${set.is_premium ? '🔒 Premium' : '✅ Gratuit'}</span>
      <span>📅 ${escapeHtml(date)}</span>
    </div>
    <h3>${escapeHtml(set.title || 'Nouveau QCM')}</h3>
    <p>${escapeHtml(set.category || 'Catégorie')} · ${escapeHtml(set.level || 'Niveau')} · ${count} QCM</p>
    <button class="btn ${locked ? 'btn-ghost' : 'btn-green'} btn-block" onclick="startPublishedQcm(${idx})">${action}</button>
  </div>`;
}

function renderPublishedQcm(){
  const wrap = $('#publishedQcmList');
  if (!wrap) return;
  const items = publishedQcmCache.map((set, idx)=>({set, idx})).filter(({set}) => {
    if (currentPublishedQcmFilter === 'free') return !set.is_premium;
    if (currentPublishedQcmFilter === 'premium') return set.is_premium;
    return true;
  });
  if (!items.length){
    wrap.innerHTML = '<div class="empty">Aucun nouveau QCM dans ce filtre pour le moment.</div>';
    return;
  }
  wrap.innerHTML = items.map(({set, idx})=>publishedQcmCardHtml(set, idx)).join('');
}

function filterPublishedQcm(el, filter){
  currentPublishedQcmFilter = filter || 'all';
  $$('#publishedQcmFilterRow .chip').forEach(c=>c.classList.remove('on'));
  if (el) el.classList.add('on');
  renderPublishedQcm();
}

function startPublishedQcm(index){
  const set = publishedQcmCache[index];
  if (!set) return;
  if (set.locked || (set.is_premium && !hasOpenAccess())){
    openPremium(set.title || 'QCM Premium');
    return;
  }
  const qs = (set.questions || []).map(mapPublishedQuestion).filter(q => q.q && q.o.length >= 2 && q.o.length <= 4 && q.a >= 0 && q.a < q.o.length);
  const limit = (!hasOpenAccess() && !set.is_premium) ? Math.min(10, qs.length) : qs.length;
  startQuestionListQuiz(qs, { title:set.title || 'Nouveau QCM', limit });
}

function openPublishedQcmFromAdmin(filter='all'){
  currentPublishedQcmFilter = filter || 'all';
  show('publishedqcm');
  setTimeout(()=>{
    $$('#publishedQcmFilterRow .chip').forEach(btn=>{
      const txt = btn.textContent.trim().toLowerCase();
      btn.classList.toggle('on', (currentPublishedQcmFilter === 'all' && txt.includes('tout')) || (currentPublishedQcmFilter === 'free' && txt.includes('gratuit')) || (currentPublishedQcmFilter === 'premium' && txt.includes('premium')));
    });
    loadPublishedQcm(currentPublishedQcmFilter);
  }, 50);
}

function openResourcesFromAdmin(){
  show('resources');
  setTimeout(()=>loadResources(), 50);
}

/* ---------- daily / mock ---------- */
function startDaily(){
  if (state.dailyDone === today()){ toast('Défi déjà relevé aujourd\u2019hui ! Reviens demain 🔥'); return; }
  startQuiz({n:10, time:10*60, title:'Défi du jour', daily:true, free:true});
}

/* ---------- modal offre ---------- */
function openOffer(){ if (!state.phoneSaved && !hasOpenAccess()) $('#offerModal').classList.add('show'); }
function closeOffer(){ $('#offerModal').classList.remove('show'); }
async function submitOffer(){
  const v = normalizePhone($('#phoneInput').value.trim());
  if (v.length !== 8){ toast('Numéro invalide — 8 chiffres attendus'); return; }
  try{ await apiPost('/api/leads/offer', { phone: fullPhone(v), source:'landing_modal' }); }catch(e){}
  state.phoneSaved = true;
  if (!state.user) state.user = {phone:v, createdAt:new Date().toISOString(), lastLoginAt:new Date().toISOString()};
  save();
  closeOffer();
  renderAccount();
  toast('Merci ! Tu recevras nos offres 🎁');
}

/* ---------- share ---------- */
function shareApp(){
  const data = {title:'Réussite Concours BF', text:'Prépare tes examens et concours avec Réussite Concours BF ! Plus de 2 000 QCM uniques et corrigés 🇧🇫', url: location.href};
  if (navigator.share) navigator.share(data).catch(()=>{});
  else { navigator.clipboard && navigator.clipboard.writeText(data.text+' '+data.url); toast('Lien copié ! 📋'); }
}


/* ---------- bouton WhatsApp déplaçable ---------- */
function clampWhatsappPosition(x, y, btn){
  const margin = 8;
  const rect = btn.getBoundingClientRect();
  const w = rect.width || 56;
  const h = rect.height || 56;
  return {
    x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - w - margin)),
    y: Math.min(Math.max(margin, y), Math.max(margin, window.innerHeight - h - margin))
  };
}

function setWhatsappFloatPosition(btn, x, y){
  const pos = clampWhatsappPosition(x, y, btn);
  btn.style.left = pos.x + 'px';
  btn.style.top = pos.y + 'px';
  btn.style.right = 'auto';
  btn.style.bottom = 'auto';
  btn.classList.add('is-positioned');
  return pos;
}

function initDraggableWhatsapp(){
  const btn = document.querySelector('.whatsapp-float');
  if (!btn) return;
  const saved = store.get('whatsappFloatPos', null);
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)){
    setTimeout(()=>setWhatsappFloatPosition(btn, Number(saved.x), Number(saved.y)), 60);
  }
  let pointerId = null;
  let startX = 0, startY = 0, originX = 0, originY = 0;
  let moved = false;

  btn.addEventListener('pointerdown', (e)=>{
    if (e.button !== undefined && e.button !== 0) return;
    const rect = btn.getBoundingClientRect();
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    originX = rect.left;
    originY = rect.top;
    moved = false;
    btn.classList.add('dragging');
    try{ btn.setPointerCapture(pointerId); }catch{}
  });

  btn.addEventListener('pointermove', (e)=>{
    if (pointerId !== e.pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 7) return;
    moved = true;
    setWhatsappFloatPosition(btn, originX + dx, originY + dy);
    e.preventDefault();
  });

  const finishDrag = (e)=>{
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    btn.classList.remove('dragging');
    try{ btn.releasePointerCapture(e.pointerId); }catch{}
    if (moved){
      const rect = btn.getBoundingClientRect();
      const pos = setWhatsappFloatPosition(btn, rect.left, rect.top);
      store.set('whatsappFloatPos', pos);
      btn.dataset.dragged = '1';
      setTimeout(()=>{ delete btn.dataset.dragged; }, 350);
    }
  };
  btn.addEventListener('pointerup', finishDrag);
  btn.addEventListener('pointercancel', finishDrag);

  btn.addEventListener('click', (e)=>{
    if (btn.dataset.dragged === '1'){
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  window.addEventListener('resize', ()=>{
    const rect = btn.getBoundingClientRect();
    if (btn.classList.contains('is-positioned')){
      const pos = setWhatsappFloatPosition(btn, rect.left, rect.top);
      store.set('whatsappFloatPos', pos);
    }
  });
}


let deferredInstallPrompt = null;

function setupAndroidInstall(){
  const btn = $('#installAppBtn');
  if (!btn) return;
  window.addEventListener('beforeinstallprompt', (event)=>{
    event.preventDefault();
    deferredInstallPrompt = event;
    btn.style.display = 'inline-flex';
  });
  window.addEventListener('appinstalled', ()=>{
    deferredInstallPrompt = null;
    btn.style.display = 'none';
    toast('Application installée ✅');
  });
}

async function installAndroidApp(){
  if (!deferredInstallPrompt){
    toast('Sur Android : menu Chrome → Installer l’application.');
    return;
  }
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice.catch(()=>null);
  deferredInstallPrompt = null;
  $('#installAppBtn') && ($('#installAppBtn').style.display = 'none');
  if (choice?.outcome === 'accepted') toast('Installation lancée ✅');
}

function refreshCurrentOnlineScreen(){
  if (!navigator.onLine) return;
  if (currentScreenId === 'resources') loadResources();
  if (currentScreenId === 'publishedqcm') loadPublishedQcm(currentPublishedQcmFilter);
  if (currentScreenId === 'moduleqcm') loadCurrentModuleQcm(true);
  if (currentScreenId === 'formations') Promise.all([loadSupabaseQuestions(), fetchPublishedQcmPublications(true).catch(()=>[]) ]).then(()=>renderFormations(currentFormFilter));
}

async function checkAppBuildVersion(){
  try{
    const res = await fetchWithTimeout('/health?ts=' + Date.now(), { cache:'no-store' });
    const data = await res.json().catch(()=>({}));
    if (data.build && data.build !== 'qcm-pdf-mobile-fit-v25') location.reload();
  }catch{}
}

function registerOfflineApp(){
  if (!('serviceWorker' in navigator)) return;
  let reloadedBySw = false;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if (reloadedBySw) return;
    reloadedBySw = true;
    location.reload();
  });
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('/sw.js?v=qcm-pdf-mobile-fit-v25')
      .then(reg => {
        reg.update().catch(()=>{});
        setInterval(()=>reg.update().catch(()=>{}), 15 * 60 * 1000);
      })
      .catch(err => console.warn('Service worker:', err.message));
  });
  window.addEventListener('online', refreshCurrentOnlineScreen);
  window.addEventListener('focus', ()=>{ refreshCurrentOnlineScreen(); checkAppBuildVersion(); });
  document.addEventListener('visibilitychange', ()=>{ if (!document.hidden){ refreshCurrentOnlineScreen(); checkAppBuildVersion(); } });
}

/* ---------- init ---------- */
window.addEventListener('scroll', ()=>{
  $('#topbar').classList.toggle('scrolled', window.scrollY>10);
});

document.addEventListener('DOMContentLoaded', ()=>{
  Promise.all([loadSupabaseQuestions(), fetchPublishedQcmPublications().catch(()=>[]) ]).then(()=>renderFormations(currentFormFilter));
  renderHome();
  renderFormations('Tout');
  renderAccount();
  initDraggableWhatsapp();
  setupAndroidInstall();
  registerOfflineApp();
  setTimeout(openOffer, 15000);
  if (location.hash === '#subscription'){
    show('subscription');
    setTimeout(checkPaymentStatus, 600);
  }
});
