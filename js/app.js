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
const ALL_QCM_CATEGORIES = ['Burkina Faso', 'Culture générale', 'Histoire-Géo', 'Mathématiques', 'Psychotechnique', 'Français', 'SVT', 'Greffier / Droit'];
const PAID_CATEGORIES = ALL_QCM_CATEGORIES.filter(cat => !FREE_CATEGORIES.includes(cat));
function isFreeCategory(cat){ return FREE_CATEGORIES.includes(cat); }
function isPaidCategory(cat){ return !isFreeCategory(cat); }
const CATEGORY_TOTALS = {
  'Mathématiques': 1200,
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
  if (loading){
    btn.dataset.label = btn.textContent;
    btn.textContent = label || 'Chargement...';
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.label || btn.textContent;
    btn.disabled = false;
  }
}

function authHeaders(extra = {}){
  const headers = {...extra};
  if (state.authToken) headers.Authorization = 'Bearer ' + state.authToken;
  return headers;
}

async function apiPost(path, body){
  const res = await fetch(path, {
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
    o:[r.option_a,r.option_b,r.option_c,r.option_d],
    a:Number(r.correct_answer),
    e:r.explanation || '',
    premium: Boolean(r.is_premium)
  })).filter(q=>q.q && q.o.every(Boolean));
  const existing = new Set(QUESTIONS.map(q=>q.q));
  mapped.forEach(q=>{ if (!existing.has(q.q)) QUESTIONS.push(q); });
}

async function loadSupabaseQuestions(){
  if (typeof QUESTIONS === 'undefined') return;
  // Mode actuel : les 5000 QCM validés sont déjà intégrés directement dans l'application.
  // On ne fusionne pas les anciennes lignes Supabase pour éviter des totaux incohérents.
  if (ACCESS_OPEN_UNTIL_PAYMENT) return;

  // Les questions Premium sont servies uniquement aux comptes Premium connectés.
  try{
    const res = await fetch('/api/questions', { headers: authHeaders({}) });
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
    const res = await fetch(url, {
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
  const navIds = ['home','formations','publishedqcm','news','resources','revision','passport','stats','subscription','account'];
  $('#bottomNav').style.display = navIds.includes(id) ? 'flex' : 'none';

  if (id==='stats') setTimeout(renderStats, 60);
  if (id==='passport') setTimeout(renderPassport, 60);
  if (id==='home') renderHome();
  if (id==='errors') renderErrors();
  if (id==='formations') renderFormations(currentFormFilter);
  if (id==='publishedqcm') loadPublishedQcm(currentPublishedQcmFilter);
  if (id==='news') loadNews();
  if (id==='resources') loadResources();
  if (id==='revision') renderRevisionFiches(currentRevisionFilter);
  if (id==='subscription') setTimeout(renderSubscription, 20);
  if (id==='account') setTimeout(renderAccountScreen, 20);
  if (id==='admin') setTimeout(()=>renderAdminPanel(false), 20);
  if (id==='login') setTimeout(renderLogin, 20);
}

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
  const chip = $('#accountChip');
  const name = displayUserName();
  if (chip){
    chip.classList.toggle('premium', isPremium());
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

  const premiumHome = $('#premiumHomeCard');
  if (premiumHome){
    if (ACCESS_OPEN_UNTIL_PAYMENT){
      premiumHome.classList.add('active-premium');
      premiumHome.innerHTML = `
        <img class="premium-mini-img" src="img/success.jpg" alt="Accès ouvert">
        <div class="premium-copy">
          <div class="premium-kicker">Accès ouvert</div>
          <h3>5000 QCM corrigés accessibles</h3>
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
  renderSmartDashboard();

  const adminBtn = $('#adminPanelBtn');
  if (adminBtn) adminBtn.style.display = isAdmin() ? 'flex' : 'none';
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
  if (opts.n === 'all') return 'Banque complète 5000 QCM';
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
  const clean = (Array.isArray(qs) ? qs : []).filter(q => q?.q && Array.isArray(q.o) && q.o.length === 4);
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
      <span class="q-tag">${q.c}</span>
      <span class="q-count">${quiz.i+1} / ${quiz.qs.length}</span>
    </div>
    <div class="q-text">${q.q}</div>
    <div class="opts">
      ${q.o.map((o,idx)=>`<button class="opt" data-i="${idx}"><span class="key">${'ABCD'[idx]}</span><span>${o}</span></button>`).join('')}
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
      <p>${q.e}</p>
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
}

async function loginUser(){
  const isRegister = authMode !== 'login';
  const phone = normalizePhone($('#authPhone')?.value);
  const pin = String($('#authPin')?.value || '').replace(/\D/g, '');
  const firstName = ($('#firstName')?.value || '').trim();
  const lastName = ($('#lastName')?.value || '').trim();
  const email = ($('#authEmail')?.value || '').trim().toLowerCase();
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
    const data = await apiPost(endpoint, { phone: fullPhone(phone), pin, firstName, lastName, email, avatarData });
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
  renderAccount();
  toast('Compte déconnecté');
  show('home');
}


/* ---------- administration ---------- */
let adminQuestionCache = [];
let adminResourceCache = [];
let adminNewsCache = [];
let aiDraftCache = [];
let aiNewsDraftCache = [];
let resourceCache = [];
let newsCache = [];
let publishedQcmCache = [];
let currentNewsFilter = 'Tout';
let currentPublishedQcmFilter = 'all';
let currentRevisionFilter = 'Tout';
let currentScreenId = 'home';
let quizReturnScreen = 'home';
let adminQuestionFilter = 'all';
let adminTab = 'create';

async function adminFetch(path, options = {}){
  const res = await fetch(path, {
    ...options,
    headers: authHeaders({'Content-Type':'application/json', ...(options.headers || {})})
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.message || 'Action administrateur impossible');
  return data;
}

function setAdminTab(tab){
  adminTab = tab || 'create';
  $('#adminCreatePane') && ($('#adminCreatePane').style.display = adminTab === 'create' ? 'block' : 'none');
  $('#adminListPane') && ($('#adminListPane').style.display = adminTab === 'list' ? 'block' : 'none');
  $('#adminResourcesPane') && ($('#adminResourcesPane').style.display = adminTab === 'resources' ? 'block' : 'none');
  $('#adminNewsPane') && ($('#adminNewsPane').style.display = adminTab === 'news' ? 'block' : 'none');
  $('#adminAiPane') && ($('#adminAiPane').style.display = adminTab === 'ai' ? 'block' : 'none');
  $('#adminNotificationsPane') && ($('#adminNotificationsPane').style.display = adminTab === 'notifications' ? 'block' : 'none');
  $('#adminTabCreate')?.classList.toggle('on', adminTab === 'create');
  $('#adminTabList')?.classList.toggle('on', adminTab === 'list');
  $('#adminTabResources')?.classList.toggle('on', adminTab === 'resources');
  $('#adminTabNews')?.classList.toggle('on', adminTab === 'news');
  $('#adminTabAi')?.classList.toggle('on', adminTab === 'ai');
  $('#adminTabNotifications')?.classList.toggle('on', adminTab === 'notifications');
  if (adminTab === 'list') loadAdminQuestions();
  if (adminTab === 'resources') loadAdminResources();
  if (adminTab === 'news') loadAdminNews();
  if (adminTab === 'ai') loadAiStatus();
  if (adminTab === 'notifications') loadAdminNotificationStatus();
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
    is_active: Boolean($('#adminActive')?.checked)
  };
}

async function saveAdminQuestion(){
  const result = $('#adminResult');
  const btn = $('#adminSaveBtn');
  setButtonLoading(btn, true, 'Publication...');
  try{
    const payload = adminFormPayload();
    const id = payload.id;
    const method = id ? 'PATCH' : 'POST';
    const url = id ? '/api/admin/questions/' + encodeURIComponent(id) : '/api/admin/questions';
    const data = await adminFetch(url, { method, body:JSON.stringify(payload) });
    const destination = payload.is_premium ? 'Premium abonnés' : 'Gratuit tous les candidats';
    if (result) result.innerHTML = `<div class="pay-note success">QCM enregistré dans <b>${destination}</b> ✅<br><button class="mini-btn" onclick="openPublishedQcmFromAdmin()" style="margin-top:8px">Ouvrir les Nouveaux QCM</button></div>`;
    resetAdminForm(false);
    await loadAdminQuestions();
    await loadSupabaseQuestions();
    renderFormations(currentFormFilter);
    toast('QCM ajouté dans ' + destination + ' ✅');
  }catch(err){
    if (result) result.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }finally{
    setButtonLoading(btn, false);
  }
}

function resetAdminForm(clearMessage = true){
  ['adminQuestionId','adminQuestionText','adminOptionA','adminOptionB','adminOptionC','adminOptionD','adminExplanation','adminSource'].forEach(id=>{ const el=$('#'+id); if (el) el.value=''; });
  $('#adminCorrect') && ($('#adminCorrect').value='0');
  $('#adminPremium') && ($('#adminPremium').checked=false);
  $('#adminActive') && ($('#adminActive').checked=true);
  $('#adminFormTitle') && ($('#adminFormTitle').textContent='Nouveau QCM');
  const saveBtn = $('#adminSaveBtn');
  if (saveBtn){ saveBtn.textContent='Publier le QCM'; delete saveBtn.dataset.label; }
  if (clearMessage && $('#adminResult')) $('#adminResult').innerHTML='';
}

function qcmDestinationText(q){
  return q?.is_premium ? 'Premium abonnés' : 'Gratuit tous les candidats';
}

function setAdminQuestionFilter(filter, el){
  adminQuestionFilter = filter || 'all';
  $$('#adminQuestionFilterRow .chip').forEach(c=>c.classList.remove('on'));
  if (el) el.classList.add('on');
  loadAdminQuestions();
}

function renderAdminQuestionCards(items){
  return items.map(({q, idx})=>`
    <div class="admin-q-item ${q.is_premium ? 'premium-zone' : 'free-zone'}">
      <div class="admin-q-meta">
        <span>${escapeHtml(q.category || 'Catégorie')}</span>
        <span>${escapeHtml(q.level || '')}</span>
        <span class="${q.is_active ? 'active' : ''}">${q.is_active ? 'Publié' : 'Masqué'}</span>
        ${q.is_premium ? '<span class="premium">Premium abonnés</span>' : '<span class="free">Gratuit</span>'}
      </div>
      <h4>${escapeHtml(q.question_text || '')}</h4>
      <p class="admin-destination-note">Nom du QCM : <b>${escapeHtml(q.source || 'Nouveau QCM')}</b> · Date : <b>${escapeHtml(formatDate(q.created_at))}</b></p>
      <p class="admin-destination-note">Destination : <b>${qcmDestinationText(q)}</b></p>
      <div class="admin-q-actions">
        <button class="edit" onclick="openPublishedQcmFromAdmin()">Ouvrir le quiz</button>
        <button class="edit" onclick="editAdminQuestion(${idx})">Modifier</button>
        <button class="pause" onclick="toggleAdminQuestion(${idx})">${q.is_active ? 'Masquer' : 'Publier'}</button>
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
    const data = await adminFetch('/api/admin/questions?limit=100&search=' + search);
    adminQuestionCache = data.questions || [];
    const allItems = adminQuestionCache.map((q, idx)=>({q, idx}));
    const freeItems = allItems.filter(item => !item.q.is_premium && item.q.is_active !== false);
    const premiumItems = allItems.filter(item => item.q.is_premium && item.q.is_active !== false);
    const hiddenItems = allItems.filter(item => item.q.is_active === false);
    const summary = $('#adminQuestionSummary');
    if (summary){
      summary.innerHTML = `
        <div><b>${freeItems.length}</b><span>Gratuits actifs</span></div>
        <div><b>${premiumItems.length}</b><span>Premium actifs</span></div>
        <div><b>${hiddenItems.length}</b><span>Masqués</span></div>`;
    }
    if (!adminQuestionCache.length){
      wrap.innerHTML = '<div class="empty">Aucun QCM ajouté pour le moment.</div>';
      return;
    }
    let html = '';
    if (adminQuestionFilter === 'free'){
      html = renderAdminQuestionGroup('QCM gratuits', 'Ces questions sont visibles par tous les candidats.', freeItems, 'free');
    }else if (adminQuestionFilter === 'premium'){
      html = renderAdminQuestionGroup('QCM Premium', 'Ces questions sont réservées aux abonnés Premium.', premiumItems, 'premium');
    }else if (adminQuestionFilter === 'hidden'){
      html = renderAdminQuestionGroup('QCM masqués', 'Ces questions existent mais ne sont pas visibles par les candidats.', hiddenItems, 'hidden');
    }else{
      html = renderAdminQuestionGroup('QCM gratuits', 'Visible par tous les candidats.', freeItems, 'free')
        + renderAdminQuestionGroup('QCM Premium', 'Visible uniquement après abonnement Premium.', premiumItems, 'premium')
        + renderAdminQuestionGroup('QCM masqués', 'Non visibles tant qu’ils restent masqués.', hiddenItems, 'hidden');
    }
    wrap.innerHTML = html || '<div class="empty">Aucun QCM dans ce filtre.</div>';
  }catch(err){
    wrap.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }
}

function editAdminQuestion(index){
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
  $('#adminActive') && ($('#adminActive').checked=Boolean(q.is_active));
  $('#adminFormTitle') && ($('#adminFormTitle').textContent='Modifier le QCM');
  $('#adminSaveBtn') && ($('#adminSaveBtn').textContent='Enregistrer les modifications');
}

async function toggleAdminQuestion(index){
  const q = adminQuestionCache[index];
  if (!q) return;
  try{
    await adminFetch('/api/admin/questions/' + encodeURIComponent(q.id) + '/status', { method:'PATCH', body:JSON.stringify({is_active:!q.is_active}) });
    await loadAdminQuestions();
    await loadSupabaseQuestions();
    renderFormations(currentFormFilter);
    toast(!q.is_active ? 'QCM visible' : 'QCM masqué');
  }catch(err){ toast(err.message); }
}

async function deleteAdminQuestion(index){
  const q = adminQuestionCache[index];
  if (!q) return;
  if (!confirm('Supprimer définitivement ce QCM ?')) return;
  try{
    await adminFetch('/api/admin/questions/' + encodeURIComponent(q.id), { method:'DELETE' });
    await loadAdminQuestions();
    await loadSupabaseQuestions();
    renderFormations(currentFormFilter);
    toast('QCM supprimé');
  }catch(err){ toast(err.message); }
}


async function loadAiStatus(){
  const wrap = $('#adminAiStatus');
  if (!wrap) return;
  try{
    const data = await adminFetch('/api/admin/ai/status');
    wrap.innerHTML = `
      <div><b>${data.configured ? 'Prête' : 'Non active'}</b><span>IA QCM</span></div>
      <div><b>Relecture</b><span>Non publié</span></div>
      <div><b>Admin</b><span>Validation</span></div>`;
  }catch(err){
    wrap.innerHTML = `<div><b>Erreur</b><span>${escapeHtml(err.message)}</span></div>`;
  }
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
    const payload = {
      category: $('#aiCategory')?.value || 'Culture générale',
      level: $('#aiLevel')?.value || 'Concours',
      theme: $('#aiTheme')?.value || '',
      count: Number($('#aiCount')?.value || 5),
      is_premium: Boolean($('#aiPremium')?.checked)
    };
    const publicationName = ($('#aiPublicationName')?.value || payload.theme || (pdfFile?.name ? pdfFile.name.replace(/\.pdf$/i,'') : '') || ('QCM IA ' + formatDate(new Date().toISOString()))).trim();
    let data;
    if (pdfFile){
      const headers = authHeaders({
        'Content-Type': pdfFile.type || 'application/pdf',
        'X-File-Name': encodeURIComponent(pdfFile.name || 'source.pdf'),
        'X-Ai-Category': encodeURIComponent(payload.category),
        'X-Ai-Level': encodeURIComponent(payload.level),
        'X-Ai-Theme': encodeURIComponent(payload.theme || publicationName),
        'X-Ai-Count': String(payload.count),
        'X-Ai-Is-Premium': String(Boolean(payload.is_premium))
      });
      const res = await fetch('/api/admin/ai/qcm-pdf', { method:'POST', headers, body:pdfFile });
      data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.message || 'Génération depuis PDF impossible');
    }else{
      data = await adminFetch('/api/admin/ai/qcm', { method:'POST', body:JSON.stringify(payload) });
    }
    aiDraftCache = (data.questions || []).map(q => ({...q, source:publicationName, is_premium:payload.is_premium, is_active:true, _published:false}));
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
  if (!aiDraftCache.length){ wrap.innerHTML = ''; return; }
  const publishAll = aiDraftCache.some(q => !q._published)
    ? '<button class="btn btn-green btn-block" onclick="publishAllAiDrafts()" style="margin-bottom:10px">Publier les QCM relus</button>'
    : '';
  wrap.innerHTML = publishAll + aiDraftCache.map((q, idx)=>`
    <div class="admin-q-item ${q._published ? 'ai-published' : ''}">
      <div class="admin-q-meta">
        <span>${escapeHtml(q.category || 'Catégorie')}</span>
        <span>${escapeHtml(q.level || '')}</span>
        ${q.is_premium ? '<span class="premium">Premium abonnés</span>' : '<span class="free">Gratuit</span>'}
        ${q._published ? '<span class="active">Publié</span>' : '<span>Proposition IA</span>'}
      </div>
      <h4>${escapeHtml(q.question_text || '')}</h4>
      <p class="admin-destination-note">Nom du QCM : <b>${escapeHtml(q.source || 'QCM IA')}</b></p>
      <p class="admin-destination-note">Destination après validation : <b>${qcmDestinationText(q)}</b></p>
      <p class="admin-help"><b>A.</b> ${escapeHtml(q.option_a)} · <b>B.</b> ${escapeHtml(q.option_b)} · <b>C.</b> ${escapeHtml(q.option_c)} · <b>D.</b> ${escapeHtml(q.option_d)}</p>
      <p class="admin-help"><b>Correction :</b> ${escapeHtml(q.explanation || '')}</p>
      <div class="admin-q-actions">
        <button class="edit" onclick="editAiDraft(${idx})">Relire / Modifier</button>
        <button class="pause" onclick="publishAiDraft(${idx})" ${q._published ? 'disabled' : ''}>${q.is_premium ? 'Publier en Premium' : 'Publier en Gratuit'}</button>
        <button class="delete" onclick="removeAiDraft(${idx})">Retirer</button>
      </div>
    </div>`).join('');
}

function editAiDraft(index){
  const q = aiDraftCache[index];
  if (!q) return;
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
  $('#adminSource') && ($('#adminSource').value=q.source || 'Créé avec l’aide de l’IA');
  $('#adminPremium') && ($('#adminPremium').checked=Boolean(q.is_premium));
  $('#adminActive') && ($('#adminActive').checked=true);
  $('#adminFormTitle') && ($('#adminFormTitle').textContent='Relire une proposition IA');
}

async function publishAiDraft(index){
  const q = aiDraftCache[index];
  if (!q || q._published) return;
  try{
    await adminFetch('/api/admin/questions', { method:'POST', body:JSON.stringify({
      category:q.category,
      level:q.level,
      question_text:q.question_text,
      options:[q.option_a,q.option_b,q.option_c,q.option_d],
      correct_answer:q.correct_answer,
      explanation:q.explanation,
      source:q.source || 'Créé avec l’aide de l’IA',
      is_premium:Boolean(q.is_premium),
      is_active:true
    }) });
    q._published = true;
    renderAiDrafts();
    await loadAdminQuestions();
    await loadSupabaseQuestions();
    renderFormations(currentFormFilter);
    const destination = qcmDestinationText(q);
    const result = $('#aiResult');
    if (result) result.innerHTML = `<div class="pay-note success">QCM ajouté dans <b>Mes QCM → ${destination}</b> ✅<br><button class="mini-btn" onclick="openPublishedQcmFromAdmin()" style="margin-top:8px">Ouvrir les Nouveaux QCM</button></div>`;
    toast('QCM IA publié dans ' + destination + ' ✅');
  }catch(err){ toast(err.message); }
}

async function publishAllAiDrafts(){
  for (let i=0; i<aiDraftCache.length; i++){
    if (!aiDraftCache[i]._published) await publishAiDraft(i);
  }
}

function removeAiDraft(index){
  aiDraftCache.splice(index, 1);
  renderAiDrafts();
}


async function scanOfficialNews(){
  const btn = $('#aiNewsScanBtn');
  const result = $('#aiNewsResult');
  const list = $('#aiNewsDraftList');
  setButtonLoading(btn, true, 'Recherche...');
  if (result) result.innerHTML = '<div class="pay-note">Recherche sur les sources officielles avec filtre à jour : année en cours, échéances non dépassées. Les propositions doivent être relues avant publication.</div>';
  if (list) list.innerHTML = '<div class="empty">Analyse des communiqués en cours...</div>';
  try{
    const data = await adminFetch('/api/admin/ai/news-scan', { method:'POST', body:JSON.stringify({ limit:6 }) });
    aiNewsDraftCache = data.items || [];
    if (result){
      const note = data.notificationSent ? ' Notification envoyée.' : '';
      const fresh = data.today ? ` Filtre à jour appliqué (${data.today}).` : ' Filtre à jour appliqué.';
      result.innerHTML = `<div class="pay-note success">${aiNewsDraftCache.length} nouvelle${aiNewsDraftCache.length>1?'s':''} actuelle${aiNewsDraftCache.length>1?'s':''} proposée${aiNewsDraftCache.length>1?'s':''} par la veille IA ✅${fresh}${note}</div>`;
    }
    renderAiNewsDrafts();
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
    wrap.innerHTML = '<div class="empty">Aucune actualité officielle récente ou échéance non dépassée détectée pour le moment.</div>';
    return;
  }
  wrap.innerHTML = aiNewsDraftCache.map((item, idx)=>`
    <div class="admin-q-item ai-news-draft">
      <div class="admin-q-meta">
        <span>${escapeHtml(item.type || 'Communiqué')}</span>
        <span>${escapeHtml(item.status || 'Info')}</span>
        <span>Proposition IA</span>
      </div>
      <h4>${escapeHtml(item.title || '')}</h4>
      <p class="admin-help">${escapeHtml(item.summary || item.organization || '')}</p>
      <p class="admin-destination-note">Source officielle : <b>${escapeHtml(item.sourceName || item.organization || 'Source')}</b></p>
      <div class="admin-q-actions">
        <button class="edit" onclick="prepareAiNewsDraft(${idx})">Relire / Préparer</button>
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
  $('#adminNewsId') && ($('#adminNewsId').value='');
  $('#adminNewsTitle') && ($('#adminNewsTitle').value=item.title || '');
  $('#adminNewsType') && ($('#adminNewsType').value=item.type || 'Communiqué');
  $('#adminNewsStatus') && ($('#adminNewsStatus').value=item.status || 'Info');
  $('#adminNewsOrganization') && ($('#adminNewsOrganization').value=item.organization || item.sourceName || '');
  $('#adminNewsDeadline') && ($('#adminNewsDeadline').value=item.deadline || '');
  $('#adminNewsSummary') && ($('#adminNewsSummary').value=item.summary || '');
  $('#adminNewsContent') && ($('#adminNewsContent').value=item.content || item.summary || '');
  $('#adminNewsSource') && ($('#adminNewsSource').value=item.sourceUrl || '');
  $('#adminNewsActive') && ($('#adminNewsActive').checked=true);
  $('#adminNewsFormTitle') && ($('#adminNewsFormTitle').textContent='Relire une actualité IA');
  $('#adminNewsSaveBtn') && ($('#adminNewsSaveBtn').textContent='Publier l’actualité');
  toast('Proposition chargée. Relis puis publie ✅');
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
    const res = await fetch('/api/news', { headers:authHeaders({}) });
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

async function openNewsPdf(id){
  try{
    const res = await fetch('/api/news/' + encodeURIComponent(id) + '/pdf', { headers:authHeaders({}) });
    if (!res.ok){
      const data = await res.json().catch(()=>({}));
      throw new Error(data.message || 'PDF indisponible');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = 'communique.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
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
  const res = await fetch('/api/admin/news/' + encodeURIComponent(newsId) + '/pdf', { method:'POST', headers, body:file });
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
          ${n.hasPdf ? `<button class="edit" onclick="openNewsPdf('${escapeHtml(n.id)}')">PDF</button>` : ''}
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

function resourceIcon(kind){
  if (kind === 'image') return '🖼️';
  if (kind === 'pdf') return '📄';
  if (kind === 'word') return '📝';
  return '📎';
}

async function loadResources(){
  const wrap = $('#resourceList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Chargement des documents...</div>';
  try{
    const res = await fetch('/api/resources', { headers:authHeaders({}) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Documents indisponibles');
    resourceCache = data.resources || [];
    if (!resourceCache.length){
      wrap.innerHTML = '<div class="empty">Aucun document disponible pour le moment.</div>';
      return;
    }
    wrap.innerHTML = resourceCache.map(r => `
      <div class="resource-card">
        <div class="resource-icon">${resourceIcon(r.kind)}</div>
        <div>
          <h3>${escapeHtml(r.title)}</h3>
          <p>${escapeHtml(r.description || 'Document de révision pour t’aider à progresser.')}</p>
          <div class="resource-meta">
            <span>${escapeHtml(r.category || 'Documents')}</span>
            <span>${formatBytes(r.size)}</span>
            ${r.is_premium ? '<span class="premium">Premium</span>' : '<span>Gratuit</span>'}
          </div>
          <button class="mini-btn" onclick="openResource('${escapeHtml(r.id)}')">Ouvrir</button>
        </div>
      </div>`).join('');
  }catch(err){
    wrap.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }
}

async function openResource(id){
  try{
    const res = await fetch('/api/resources/' + encodeURIComponent(id) + '/download', { headers:authHeaders({}) });
    if (!res.ok){
      const data = await res.json().catch(()=>({}));
      throw new Error(data.message || 'Ouverture impossible');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    const disp = res.headers.get('Content-Disposition') || '';
    const m = disp.match(/filename\*=UTF-8''([^;]+)/);
    if (m) a.download = decodeURIComponent(m[1]);
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
      'X-Is-Active': String(Boolean($('#adminResourceActive')?.checked))
    });
    const res = await fetch('/api/admin/resources/upload', { method:'POST', headers, body:file });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Publication impossible');
    if (result) result.innerHTML = '<div class="pay-note success">Document publié avec succès ✅</div>';
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

async function loadAdminResources(){
  const wrap = $('#adminResourceList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Chargement des documents...</div>';
  try{
    const data = await adminFetch('/api/admin/resources');
    adminResourceCache = data.resources || [];
    if (!adminResourceCache.length){
      wrap.innerHTML = '<div class="empty">Aucun document disponible pour le moment.</div>';
      return;
    }
    wrap.innerHTML = adminResourceCache.map((r, idx)=>`
      <div class="admin-q-item">
        <div class="admin-q-meta">
          <span>${resourceIcon(r.kind)} ${escapeHtml(r.kind || 'document')}</span>
          <span>${escapeHtml(r.category || 'Documents')}</span>
          <span class="${r.is_active ? 'active' : ''}">${r.is_active ? 'Publié' : 'Masqué'}</span>
          ${r.is_premium ? '<span class="premium">Premium</span>' : '<span>Gratuit</span>'}
        </div>
        <h4>${escapeHtml(r.title || r.fileName || 'Document')}</h4>
        <p class="admin-help">${escapeHtml(r.description || r.fileName || '')} · ${formatBytes(r.size)}</p>
        <div class="admin-q-actions">
          <button class="edit" onclick="openResource('${escapeHtml(r.id)}')">Ouvrir</button>
          <button class="pause" onclick="toggleAdminResource(${idx})">${r.is_active ? 'Masquer' : 'Publier'}</button>
          <button class="delete" onclick="deleteAdminResource(${idx})">Supprimer</button>
        </div>
      </div>`).join('');
  }catch(err){
    wrap.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }
}

async function toggleAdminResource(index){
  const r = adminResourceCache[index];
  if (!r) return;
  try{
    await adminFetch('/api/admin/resources/' + encodeURIComponent(r.id) + '/status', { method:'PATCH', body:JSON.stringify({is_active:!r.is_active}) });
    await loadAdminResources();
    await loadResources();
    toast(!r.is_active ? 'Document publié' : 'Document masqué');
  }catch(err){ toast(err.message); }
}

async function deleteAdminResource(index){
  const r = adminResourceCache[index];
  if (!r) return;
  if (!confirm('Supprimer définitivement ce document ?')) return;
  try{
    await adminFetch('/api/admin/resources/' + encodeURIComponent(r.id), { method:'DELETE' });
    await loadAdminResources();
    await loadResources();
    toast('Document supprimé');
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

/* ---------- abonnement & paiements ---------- */
function selectProvider(provider){
  state.selectedProvider = provider;
  save();
  $$('#providerGrid .provider-option').forEach(btn=>btn.classList.toggle('on', btn.dataset.provider === provider));
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

  const phone = normalizePhone($('#subPhone')?.value || state.user.phone);
  if (phone.length !== 8){ toast('Numéro Mobile Money invalide'); return; }
  state.user.phone = phone;
  state.phoneSaved = true;

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
    const res = await fetch(paymentApiBase() + '/api/payments/saspay/init', {
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
      : `<div class="pay-note success">${data.message || 'Paiement lancé.'}<br>Abonnement : <b>${plan.label}</b> (${money(plan.amount)}). Valide sur ton téléphone puis clique sur “Vérifier mon paiement”. Réf. <b>${state.pendingPayment.ref}</b></div>`;
    renderSubscription();
  }catch(err){
    runtimePaymentMessage = '<div class="pay-note error">Paiement indisponible pour le moment. Vérifie le numéro puis réessaie.</div>'; 
    renderSubscription();
  }finally{
    setButtonLoading(btn, false);
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
    const res = await fetch(url, { headers: authHeaders({}) });
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
      runtimePaymentMessage = '<div class="pay-note warn">Paiement non confirmé pour le moment. Réessaie après validation Mobile Money.</div>';
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

const REVISION_FICHES = [
  {
    id:'bf-reperes', cat:'Burkina Faso', img:'img/subject-burkina.svg', title:'Burkina Faso : repères indispensables', time:'2 min', level:'Base concours', quizTitle:'QCM repères Burkina Faso',
    points:['Capitale à retenir : Ouagadougou.', 'Monnaie utilisée : franc CFA (XOF).', 'Révise les institutions, les régions/provinces, les symboles nationaux et les grandes dates.'],
    remember:'Dans les QCM, commence par identifier si la question porte sur un lieu, une institution, une date ou un symbole.'
  },
  {
    id:'bf-citoyennete', cat:'Burkina Faso', img:'img/subject-burkina.svg', title:'Citoyenneté : droits, devoirs et institutions', time:'3 min', level:'Concours', quizTitle:'QCM citoyenneté Burkina Faso',
    points:['Un citoyen connaît ses droits mais respecte aussi ses devoirs.', 'Distingue pouvoir exécutif, pouvoir législatif et pouvoir judiciaire.', 'Les sujets demandent souvent de relier une institution à son rôle.'],
    remember:'Pour répondre vite, cherche le verbe clé : gouverner, voter la loi, rendre la justice, contrôler.'
  },
  {
    id:'culture-organisations', cat:'Culture générale', img:'img/subject-culture.svg', title:'Organisations et sigles fréquents', time:'2 min', level:'Tous niveaux', quizTitle:'QCM organisations et sigles',
    points:['ONU : coopération internationale, paix et sécurité.', 'Union africaine : coopération entre États africains.', 'Dans l’actualité régionale, lis toujours le sigle puis son rôle.'],
    remember:'Ne mémorise pas seulement le sigle : retiens aussi pourquoi l’organisation existe.'
  },
  {
    id:'histoire-geo-methode', cat:'Histoire-Géo', img:'img/subject-history-geo.svg', title:'Histoire-Géo : méthode pour ne pas confondre', time:'3 min', level:'BEPC/BAC', quizTitle:'QCM méthode Histoire-Géo',
    points:['Classe les informations en trois familles : dates, lieux, acteurs.', 'En géographie, repère d’abord l’échelle : pays, région, continent ou monde.', 'En histoire, cherche la chronologie avant de choisir la réponse.'],
    remember:'Une bonne réponse en Histoire-Géo est souvent la plus précise dans le temps et dans l’espace.'
  },
  {
    id:'maths-pourcentages', cat:'Mathématiques', img:'img/subject-math.svg', title:'Maths : pourcentages rapides', time:'3 min', level:'BEPC/BAC', quizTitle:'QCM pourcentages',
    points:['x% signifie x divisé par 100.', 'Augmenter de 20% revient à multiplier par 1,20.', 'Diminuer de 15% revient à multiplier par 0,85.'],
    remember:'Pour gagner du temps, transforme le pourcentage en coefficient multiplicateur.'
  },
  {
    id:'francais-accords', cat:'Français', img:'img/subject-french.svg', title:'Français : accords à surveiller', time:'3 min', level:'Tous niveaux', quizTitle:'QCM accords en français',
    points:['Le verbe s’accorde avec son sujet.', 'Avec être, le participe passé s’accorde généralement avec le sujet.', 'Avec avoir, il s’accorde avec le COD si le COD est placé avant le verbe.'],
    remember:'Dans une phrase longue, retrouve d’abord le sujet réel avant de choisir l’accord.'
  },
  {
    id:'svt-sante-environnement', cat:'SVT', img:'img/subject-svt.svg', title:'SVT : santé et environnement', time:'2 min', level:'BEPC/BAC', quizTitle:'QCM santé et environnement',
    points:['Prévention : agir avant la maladie ou le risque.', 'Hygiène : ensemble des pratiques qui protègent la santé.', 'Écosystème : êtres vivants, milieu et relations entre eux.'],
    remember:'Quand deux réponses semblent proches, choisis celle qui décrit le mécanisme le plus complet.'
  },
  {
    id:'psycho-series', cat:'Psychotechnique', img:'img/subject-psychotech.svg', title:'Psychotechnique : séries logiques', time:'2 min', level:'Concours', quizTitle:'QCM séries logiques',
    points:['Cherche d’abord l’opération : +, −, ×, ÷, alternance.', 'Teste si la suite avance par deux séries séparées : positions paires et impaires.', 'Pour les formes, compare nombre, orientation, couleur et ordre.'],
    remember:'Ne réponds pas trop vite : écris mentalement la règle avant de choisir.'
  },
  {
    id:'droit-vocabulaire', cat:'Greffier / Droit', img:'img/subject-law.svg', title:'Droit : vocabulaire de base', time:'3 min', level:'Concours pro', quizTitle:'QCM vocabulaire juridique',
    points:['Une juridiction est un organe chargé de rendre la justice.', 'Une infraction est un comportement puni par la loi.', 'Une procédure est l’ensemble des règles à suivre dans une affaire.'],
    remember:'En droit, la précision des mots compte : lis chaque terme avant de choisir.'
  }
];

function revisionReadSet(){
  return new Set(Array.isArray(state.revisionRead) ? state.revisionRead : []);
}

function revisionFilteredList(filter = currentRevisionFilter){
  const f = filter || 'Tout';
  return REVISION_FICHES.filter(item => {
    if (f === 'Tout') return true;
    if (f === 'Gratuit') return isFreeCategory(item.cat);
    if (f === 'Premium') return isPaidCategory(item.cat);
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

function startRevisionQuiz(cat, title){
  startFormationQuiz(title || ('QCM ' + cat), cat);
}

function renderRevisionFiches(filter = currentRevisionFilter){
  renderAccount();
  currentRevisionFilter = filter || 'Tout';
  $$('#revisionFilterRow .chip').forEach(c=>c.classList.toggle('on', c.dataset.filter === currentRevisionFilter));
  const list = revisionFilteredList(currentRevisionFilter);
  const read = revisionReadSet();
  const readCount = REVISION_FICHES.filter(f=>read.has(f.id)).length;
  const pct = Math.round(readCount / REVISION_FICHES.length * 100);
  const recCat = smartRecommendedCategory();
  const rec = REVISION_FICHES.find(f=>f.cat === recCat) || REVISION_FICHES[0];
  const progress = $('#revisionProgressCard');
  if (progress){
    progress.innerHTML = `
      <div class="revision-progress-copy">
        <span>Progression fiches</span>
        <b>${readCount}/${REVISION_FICHES.length} lue${readCount>1?'s':''}</b>
        <small>Conseil du jour : ${escapeHtml(rec.title)}</small>
      </div>
      <div class="revision-progress-actions">
        <button class="mini-btn" onclick="openRecommendedRevision()">Lire la fiche conseillée</button>
        <i><em style="width:${pct}%"></em></i>
      </div>`;
  }
  const wrap = $('#revisionList');
  if (!wrap) return;
  if (!list.length){
    wrap.innerHTML = '<div class="empty">Aucune fiche dans ce filtre.</div>';
    return;
  }
  wrap.innerHTML = list.map(f=>{
    const paid = isPaidCategory(f.cat);
    const locked = paid && !hasOpenAccess();
    const done = read.has(f.id);
    const meta = paid ? 'Premium' : 'Gratuit';
    return `<article class="revision-card ${locked?'locked':''} ${done?'read':''}">
      <div class="revision-head">
        <img class="revision-thumb" src="${escapeHtml(f.img)}" alt="${escapeHtml(f.cat)}">
        <div>
          <div class="revision-meta">
            <span class="${paid?'premium':''}">${paid?'🔒 ':''}${meta}</span>
            <span>${escapeHtml(f.time)}</span>
            <span>${escapeHtml(f.level)}</span>
          </div>
          <h3>${escapeHtml(f.title)}</h3>
          <p>${escapeHtml(f.cat)}</p>
        </div>
      </div>
      <ul class="revision-points">
        ${f.points.map(p=>`<li>${escapeHtml(p)}</li>`).join('')}
      </ul>
      <div class="revision-remember"><b>À retenir</b><span>${escapeHtml(f.remember)}</span></div>
      <div class="revision-actions">
        <button class="btn btn-green" onclick='startRevisionQuiz(${JSON.stringify(f.cat)},${JSON.stringify(f.quizTitle)})'>Lancer un QCM lié</button>
        <button class="btn btn-ghost" onclick='markRevisionFiche(${JSON.stringify(f.id)})'>${done?'Lue ✅':'Marquer comme lue'}</button>
      </div>
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
      ['img/subject-history-geo.svg','Histoire-Géographie','Histoire-Géo'],
      ['img/subject-svt.svg','SVT','SVT'],
      ['img/subject-french.svg','Français','Français'],
      ['img/subject-math.svg','Mathématiques','Mathématiques'],
      ['img/subject-psychotech.svg','Psychotechnique','Psychotechnique']
    ],
    'Concours & examens':[
      ['img/level-bac.svg','BAC','Culture générale'],
      ['img/level-bepc.svg','BEPC','Culture générale'],
      ['img/subject-greffier.svg','Greffier (SG & Parquet)','Greffier / Droit'],
      ['img/subject-economy.svg','Économie & Droit','Greffier / Droit']
    ],
    'Culture & monde':[
      ['img/subject-culture.svg','Culture générale','Culture générale'],
      ['img/subject-history-geo.svg','Géographie du monde','Histoire-Géo']
    ],
    'Burkina Faso':[
      ['img/subject-burkina.svg','Les 47 provinces','Burkina Faso'],
      ['img/subject-history-geo.svg','Histoire du Faso','Burkina Faso'],
      ['img/subject-culture.svg','Culture burkinabè','Burkina Faso']
    ]
  };
}

function startFormationQuiz(title, cat){
  const paid = isPaidCategory(cat);
  if (paid){
    startQuiz({n:'all', time:0, title, cat});
    return;
  }
  const freeLimit = hasOpenAccess() ? 'all' : 10;
  startQuiz({n:freeLimit, time:0, title, cat, free:true});
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
      if (currentFormFilter === 'Gratuit') return isFreeCategory(cat);
      if (currentFormFilter === 'Premium') return isPaidCategory(cat);
      return true;
    });
    if (!items.length) return '';
    return `
    <div class="section"><div class="section-head"><h2>${g}</h2></div>
    <div class="form-list">
      ${items.map(([img,name,cat])=>{
        const total = qcmCount(cat);
        const paid = isPaidCategory(cat);
        const locked = paid && !hasOpenAccess();
        const safeTitle = name.replace(/'/g,"\'");
        const safeCat = cat.replace(/'/g,"\'");
        const titleHtml = paid ? `${name} <span class="premium-pill">🔒 PREMIUM</span>` : name;
        const desc = paid
          ? `${formatQcmCount(total)} corrigés Premium · abonnement requis`
          : `${hasOpenAccess() ? formatQcmCount(total) + ' corrigés disponibles' : '10 QCM gratuits pour débuter aujourd’hui'}`;
        return `<button class="form-item ${locked?'locked':''} ${paid?'paid':''}" onclick="startFormationQuiz('${safeTitle}','${safeCat}')">
          <img class="form-thumb" src="${img}" alt="${name}">
          <span class="fi-body"><h4>${titleHtml}</h4><p>${desc}</p></span>
          <span class="${paid?'lock-dot':'chev'}">${paid?'🔒':'›'}</span>
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
    o:[row.option_a,row.option_b,row.option_c,row.option_d],
    a:Number(row.correct_answer),
    e:row.explanation || '',
    premium:Boolean(row.is_premium)
  };
}

async function loadPublishedQcm(filter){
  currentPublishedQcmFilter = filter || currentPublishedQcmFilter || 'all';
  const wrap = $('#publishedQcmList');
  if (!wrap) return;
  wrap.innerHTML = '<div class="empty">Chargement des nouveaux QCM...</div>';
  try{
    const res = await fetch('/api/qcm-publications', { headers:authHeaders({}) });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Nouveaux QCM indisponibles');
    publishedQcmCache = data.publications || [];
    renderPublishedQcm();
  }catch(err){
    wrap.innerHTML = `<div class="pay-note error">${err.message}</div>`;
  }
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
  wrap.innerHTML = items.map(({set, idx})=>{
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
  }).join('');
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
  const qs = (set.questions || []).map(mapPublishedQuestion).filter(q => q.q && q.o.every(Boolean));
  const limit = (!hasOpenAccess() && !set.is_premium) ? Math.min(10, qs.length) : qs.length;
  startQuestionListQuiz(qs, { title:set.title || 'Nouveau QCM', limit });
}

function openPublishedQcmFromAdmin(){
  currentPublishedQcmFilter = 'all';
  show('publishedqcm');
  setTimeout(()=>loadPublishedQcm('all'), 50);
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
  const data = {title:'Réussite Concours BF', text:'Prépare tes examens et concours avec Réussite Concours BF ! +5000 questions corrigées 🇧🇫', url: location.href};
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

/* ---------- init ---------- */
window.addEventListener('scroll', ()=>{
  $('#topbar').classList.toggle('scrolled', window.scrollY>10);
});

document.addEventListener('DOMContentLoaded', ()=>{
  loadSupabaseQuestions().then(()=>renderFormations(currentFormFilter));
  renderHome();
  renderFormations('Tout');
  renderAccount();
  initDraggableWhatsapp();
  setTimeout(openOffer, 15000);
  if (location.hash === '#subscription'){
    show('subscription');
    setTimeout(checkPaymentStatus, 600);
  }
});
