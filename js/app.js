/* ============ FasoPrépa — logique de l'application ============ */

/* ---------- configuration paiement ---------- */
const PAYMENT_CONFIG = window.FASOPREPA_PAYMENT_CONFIG || {
  amount: 1500,
  currency: 'XOF',
  plan: 'premium_monthly',
  // À renseigner quand le backend est déployé, ex: https://api.fasoprepa.com
  backendBaseUrl: '',
  // Laisse true pour tester le verrouillage premium dans l'aperçu local.
  // En production, mettre false et activer le backend CinetPay/Ligdicash.
  demoMode: true
};

const FREE_CATEGORIES = ['Burkina Faso', 'Culture générale', 'Histoire-Géo'];
let nextAfterLogin = 'home';
let paywallFeature = null;
let currentFormFilter = 'Tout';
let runtimePaymentMessage = '';

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
  selectedProvider: store.get('selectedProvider', 'ORANGE_MONEY')
};

function save(){
  for (const k of ['xp','quizDone','correct','answered','errors','catStats','streak','lastDay','dailyDone','bestScore','phoneSaved','user','subscription','pendingPayment','selectedProvider'])
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

/* ---------- navigation ---------- */
function show(id){
  if ((id === 'stats' || id === 'errors') && !isPremium()){
    openPremium(id === 'stats' ? 'Ma progression détaillée' : 'Mes erreurs');
    return;
  }

  const target = $('#'+id);
  if (!target) return;
  $$('.screen').forEach(s=>s.classList.remove('active'));
  target.classList.add('active');
  window.scrollTo({top:0});
  $$('.nav-btn').forEach(b=>b.classList.toggle('on', b.dataset.target===id));
  const navIds = ['home','formations','passport','stats','subscription'];
  $('#bottomNav').style.display = navIds.includes(id) ? 'flex' : 'none';

  if (id==='stats') setTimeout(renderStats, 60);
  if (id==='passport') setTimeout(renderPassport, 60);
  if (id==='home') renderHome();
  if (id==='errors') renderErrors();
  if (id==='formations') renderFormations(currentFormFilter);
  if (id==='subscription') setTimeout(renderSubscription, 20);
  if (id==='login') setTimeout(renderLogin, 20);
}

function openPremium(feature){
  paywallFeature = feature || 'Cette fonctionnalité';
  toast('Fonction Premium 🔒');
  show('subscription');
}

function openAccountMenu(){
  if (state.user) show('subscription');
  else { nextAfterLogin = 'home'; show('login'); }
}

function renderAccount(){
  const chip = $('#accountChip');
  if (chip){
    chip.classList.toggle('premium', isPremium());
    if (isPremium()) chip.textContent = '⭐ Premium';
    else if (state.user) chip.textContent = '👤 ' + prettyPhone(state.user.phone);
    else chip.textContent = '👤 Connexion';
  }

  $$('.premium-locked').forEach(card=>{
    card.classList.toggle('is-unlocked', isPremium());
  });
  $$('.lock-tag').forEach(tag=>{
    tag.textContent = isPremium() ? 'Ouvert' : 'Premium';
  });

  const premiumHome = $('#premiumHomeCard');
  if (premiumHome){
    if (isPremium()){
      premiumHome.classList.add('active-premium');
      premiumHome.innerHTML = `
        <div class="premium-icon">✅</div>
        <div class="premium-copy">
          <div class="premium-kicker">Premium actif</div>
          <h3>Accès illimité encore ${premiumDaysLeft()} jour${premiumDaysLeft()>1?'s':''}</h3>
          <p>Valable jusqu'au ${formatDate(state.subscription.expiresAt)}.</p>
        </div>
        <button class="mini-btn" onclick="show('subscription')">Gérer</button>`;
    } else {
      premiumHome.classList.remove('active-premium');
      premiumHome.innerHTML = `
        <div class="premium-icon">⭐</div>
        <div class="premium-copy">
          <div class="premium-kicker">FasoPrépa Premium</div>
          <h3>Débloque tout pour ${money(PAYMENT_CONFIG.amount)}/mois</h3>
          <p>Examens blancs, erreurs, statistiques détaillées et matières avancées.</p>
        </div>
        <button class="mini-btn" onclick="show('subscription')">Voir</button>`;
    }
  }
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
  if (!opts || opts.free || opts.daily) return null;
  if (opts.errorsMode) return 'Révision de tes erreurs';
  if (opts.title === 'Examen blanc') return 'Examen blanc chronométré';
  if (opts.n && opts.n > 10) return opts.n + ' questions';
  if (opts.cat && !FREE_CATEGORIES.includes(opts.cat)) return 'Formation ' + opts.cat;
  return null;
}

function startQuiz(opts){
  opts = opts || {};
  const required = premiumLockForQuiz(opts);
  if (required && !isPremium()){
    openPremium(required);
    return;
  }

  // opts: {n, time (sec, 0=sans), title, cat (opt), errorsMode, free}
  let pool;
  if (opts.errorsMode){
    const errQs = state.errors.map(e=>e.q);
    pool = QUESTIONS.filter(q=>errQs.includes(q.q));
    if (!pool.length){ toast('Aucune erreur à réviser 🎉'); return; }
  } else if (opts.cat){
    pool = QUESTIONS.filter(q=>q.c===opts.cat);
  } else {
    pool = QUESTIONS;
  }
  const qs = shuffle(pool).slice(0, Math.min(opts.n || 10, pool.length));
  quiz = {
    qs, i:0, ok:0, ko:0, title:opts.title || 'Quiz', daily:opts.daily||false,
    time: opts.time||0, left: opts.time||0, answered:false, wrongList:[]
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

function quitQuiz(){
  if (quiz && quiz.timer) clearInterval(quiz.timer);
  quiz = null;
  show('home');
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
  if (!setup.level){ toast('Choisis d\u2019abord ton niveau 👆'); return; }
  startQuiz({n: setup.n, time: setup.n*60, title: setup.level});
}

/* ---------- compte candidat ---------- */
function renderLogin(){
  const phoneInput = $('#authPhone');
  const pinInput = $('#authPin');
  if (phoneInput && state.user) phoneInput.value = prettyPhone(state.user.phone);
  if (pinInput) pinInput.value = '';
  const logoutBtn = $('#logoutBtn');
  if (logoutBtn) logoutBtn.style.display = state.user ? 'flex' : 'none';
}

function loginUser(){
  const phone = normalizePhone($('#authPhone')?.value);
  const pin = String($('#authPin')?.value || '').replace(/\D/g, '');
  if (phone.length !== 8){ toast('Numéro invalide — 8 chiffres attendus'); return; }
  if (pin.length < 4){ toast('Choisis un PIN de 4 chiffres minimum'); return; }
  const createdAt = state.user?.createdAt || new Date().toISOString();
  state.user = {phone, createdAt, lastLoginAt:new Date().toISOString()};
  state.phoneSaved = true;
  save();
  renderAccount();
  toast('Compte connecté ✅');
  const go = nextAfterLogin || 'home';
  nextAfterLogin = 'home';
  show(go);
}

function logoutUser(){
  state.user = null;
  save();
  renderAccount();
  toast('Compte déconnecté');
  show('home');
}

/* ---------- abonnement & paiements ---------- */
function selectProvider(provider){
  state.selectedProvider = provider;
  save();
  $$('#providerGrid .provider-option').forEach(btn=>btn.classList.toggle('on', btn.dataset.provider === provider));
}

function renderSubscription(){
  renderAccount();
  selectProvider(state.selectedProvider || 'ORANGE_MONEY');

  const subPhone = $('#subPhone');
  if (subPhone && !subPhone.value && state.user?.phone) subPhone.value = prettyPhone(state.user.phone);

  const status = $('#subStatus');
  if (status){
    if (isPremium()){
      status.className = 'sub-status active';
      status.innerHTML = `✅ Premium actif — expire le <b>${formatDate(state.subscription.expiresAt)}</b> (${premiumDaysLeft()} jour${premiumDaysLeft()>1?'s':''} restant${premiumDaysLeft()>1?'s':''})`;
    } else if (state.pendingPayment){
      status.className = 'sub-status pending';
      status.innerHTML = `⏳ Paiement en attente — référence <b>${state.pendingPayment.ref}</b>`;
    } else if (paywallFeature){
      status.className = 'sub-status locked';
      status.innerHTML = `🔒 <b>${paywallFeature}</b> nécessite Premium.`;
    } else {
      status.className = 'sub-status';
      status.innerHTML = 'Ton compte est actuellement en formule gratuite.';
    }
  }

  const payBtn = $('#payBtn');
  if (payBtn) payBtn.textContent = isPremium() ? 'Renouveler 1 500 FCFA' : 'Payer 1 500 FCFA';
  const demoBtn = $('#demoPayBtn');
  if (demoBtn) demoBtn.style.display = (PAYMENT_CONFIG.demoMode && !isPremium()) ? 'flex' : 'none';

  const result = $('#paymentResult');
  if (result){
    if (runtimePaymentMessage){
      result.innerHTML = runtimePaymentMessage;
    } else if (!PAYMENT_CONFIG.backendBaseUrl){
      result.innerHTML = `<div class="pay-note">⚙️ Aperçu local : le verrouillage Premium est fonctionnel. Pour encaisser réellement, configure <b>PAYMENT_CONFIG.backendBaseUrl</b> et les clés marchandes dans le backend.</div>`;
    } else {
      result.innerHTML = '<div class="pay-note">API paiement configurée. Clique sur “Payer” pour lancer la transaction.</div>';
    }
  }
}

function makeTxRef(){
  return 'FP-' + Date.now() + '-' + Math.random().toString(36).slice(2,8).toUpperCase();
}

async function startSubscriptionPayment(){
  if (!state.user){
    nextAfterLogin = 'subscription';
    toast('Connecte ton numéro avant de payer');
    show('login');
    return;
  }

  const phone = normalizePhone($('#subPhone')?.value || state.user.phone);
  if (phone.length !== 8){ toast('Numéro Mobile Money invalide'); return; }
  state.user.phone = phone;
  state.phoneSaved = true;

  const txRef = makeTxRef();
  const payload = {
    amount: PAYMENT_CONFIG.amount,
    currency: PAYMENT_CONFIG.currency,
    plan: PAYMENT_CONFIG.plan,
    provider: state.selectedProvider,
    transactionId: txRef,
    customer: {phone: fullPhone(phone)},
    returnUrl: location.origin + location.pathname + '#subscription'
  };

  const btn = $('#payBtn');
  setButtonLoading(btn, true, 'Initialisation...');

  if (!PAYMENT_CONFIG.backendBaseUrl){
    state.pendingPayment = {
      ref: txRef,
      amount: PAYMENT_CONFIG.amount,
      currency: PAYMENT_CONFIG.currency,
      provider: state.selectedProvider,
      phone,
      status: 'waiting_backend',
      createdAt: new Date().toISOString()
    };
    save();
    runtimePaymentMessage = `<div class="pay-note warn">Transaction préparée : <b>${txRef}</b>.<br>Le serveur paiement n’est pas encore relié. Déploie le backend, ajoute tes clés CinetPay/Ligdicash, puis l'utilisateur recevra la demande de paiement sur son téléphone.</div>`;
    setButtonLoading(btn, false);
    renderSubscription();
    return;
  }

  try{
    const res = await fetch(PAYMENT_CONFIG.backendBaseUrl.replace(/\/$/, '') + '/api/payments/cinetpay/init', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Impossible de lancer le paiement');

    state.pendingPayment = {
      ref: data.transactionId || txRef,
      amount: PAYMENT_CONFIG.amount,
      currency: PAYMENT_CONFIG.currency,
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
    runtimePaymentMessage = `<div class="pay-note success">Paiement lancé. Valide la demande sur ton téléphone puis clique sur “Vérifier mon paiement”. Réf. <b>${state.pendingPayment.ref}</b></div>`;
    renderSubscription();
  }catch(err){
    runtimePaymentMessage = `<div class="pay-note error">${err.message || 'Erreur paiement'}</div>`;
    renderSubscription();
  }finally{
    setButtonLoading(btn, false);
  }
}

async function checkPaymentStatus(){
  if (!state.user){ nextAfterLogin='subscription'; show('login'); return; }
  if (!PAYMENT_CONFIG.backendBaseUrl){
    runtimePaymentMessage = '<div class="pay-note warn">Aucun backend paiement n’est configuré dans cet aperçu. Utilise le bouton “mode test” pour vérifier le verrouillage, ou configure le serveur réel.</div>';
    renderSubscription();
    return;
  }

  const btn = $('#checkPayBtn');
  setButtonLoading(btn, true, 'Vérification...');
  try{
    const url = PAYMENT_CONFIG.backendBaseUrl.replace(/\/$/, '') + '/api/subscription/status?phone=' + encodeURIComponent(fullPhone(state.user.phone));
    const res = await fetch(url);
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.message || 'Statut indisponible');
    if (data.active){
      state.subscription = {status:'premium', expiresAt:data.expiresAt, txRef:data.txRef, provider:data.provider || state.selectedProvider};
      state.pendingPayment = null;
      save();
      runtimePaymentMessage = '<div class="pay-note success">Paiement confirmé ✅ Premium activé.</div>';
      renderAccount();
      renderFormations(currentFormFilter);
      confetti();
    } else {
      runtimePaymentMessage = '<div class="pay-note warn">Paiement non confirmé pour le moment. Réessaie après validation Mobile Money.</div>';
    }
    renderSubscription();
  }catch(err){
    runtimePaymentMessage = `<div class="pay-note error">${err.message || 'Erreur de vérification'}</div>`;
    renderSubscription();
  }finally{
    setButtonLoading(btn, false);
  }
}

function simulatePaymentSuccess(){
  if (!state.user){
    nextAfterLogin = 'subscription';
    toast('Connecte-toi d’abord');
    show('login');
    return;
  }
  const tx = state.pendingPayment?.ref || ('TEST-' + Date.now());
  activatePremium(30, tx, state.selectedProvider);
  runtimePaymentMessage = '<div class="pay-note success">Mode test : Premium activé pour 30 jours ✅</div>';
  paywallFeature = null;
  renderSubscription();
  renderAccount();
  renderFormations(currentFormFilter);
  toast('Premium activé ✅');
  confetti();
}

/* ---------- rendus ---------- */
function renderHome(){
  renderAccount();
  $('#streakVal').textContent = state.streak;
  $('#errCount').textContent = state.errors.length;
  $('#errCount').style.display = state.errors.length ? 'grid' : 'none';
  $('#errSub').textContent = state.errors.length ? state.errors.length + ' question' + (state.errors.length>1?'s':'') + ' à revoir' : 'Aucune pour l\u2019instant';
  const done = state.dailyDone === today();
  $('#dailyCard').style.opacity = done ? .55 : 1;
  $('#dailySub').textContent = done ? 'Déjà fait aujourd\u2019hui ✅' : '15 questions · 1 fois/jour';
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

function renderFormations(filter){
  renderAccount();
  currentFormFilter = filter || currentFormFilter || 'Tout';
  const groups = {
    'Matières':[['📚','Histoire-Géographie','Histoire-Géo'],['🧬','SVT','SVT'],['✍️','Français','Français'],['➗','Mathématiques','Mathématiques'],['🧠','Psychotechnique','Psychotechnique']],
    'Concours & examens':[['🎓','BAC','Culture générale'],['📖','BEPC','Culture générale'],['⚖️','Greffier (SG & Parquet)','Culture générale'],['🏛️','Économie & Droit','Culture générale']],
    'Culture & monde':[['🌍','Culture générale','Culture générale'],['🗺️','Géographie du monde','Histoire-Géo']],
    'Burkina Faso':[['🇧🇫','Les 47 provinces','Burkina Faso'],['🏛️','Histoire du Faso','Burkina Faso'],['🎭','Culture burkinabè','Burkina Faso']]
  };
  const keys = currentFormFilter && currentFormFilter!=='Tout' ? [currentFormFilter] : Object.keys(groups);
  $('#formWrap').innerHTML = keys.map(g=>`
    <div class="section"><div class="section-head"><h2>${g}</h2></div>
    <div class="form-list">
      ${groups[g].map(([em,name,cat])=>{
        const free = FREE_CATEGORIES.includes(cat);
        const locked = !free && !isPremium();
        return `<button class="form-item ${locked?'locked':''}" onclick="startQuiz({n:10,time:0,title:'${name.replace(/'/g,"\\'")}',cat:'${cat}'})">
          <span class="emoji">${em}</span>
          <span class="fi-body"><h4>${name}</h4><p>${free ? '10 questions gratuites · corrections incluses' : (isPremium() ? 'Premium ouvert · corrections incluses' : 'Premium · 1 500 FCFA/mois')}</p></span>
          <span class="${locked?'lock-dot':'chev'}">${locked?'🔒':'›'}</span>
        </button>`;
      }).join('')}
    </div></div>`).join('');
}

function filterForm(el, f){
  currentFormFilter = f;
  $$('#chipRow .chip').forEach(c=>c.classList.remove('on'));
  el.classList.add('on');
  renderFormations(f);
}

/* ---------- daily / mock ---------- */
function startDaily(){
  if (state.dailyDone === today()){ toast('Défi déjà relevé aujourd\u2019hui ! Reviens demain 🔥'); return; }
  startQuiz({n:15, time:15*60, title:'Défi du jour', daily:true});
}

/* ---------- modal offre ---------- */
function openOffer(){ if (!state.phoneSaved && !isPremium()) $('#offerModal').classList.add('show'); }
function closeOffer(){ $('#offerModal').classList.remove('show'); }
function submitOffer(){
  const v = normalizePhone($('#phoneInput').value.trim());
  if (v.length !== 8){ toast('Numéro invalide — 8 chiffres attendus'); return; }
  state.phoneSaved = true;
  if (!state.user) state.user = {phone:v, createdAt:new Date().toISOString(), lastLoginAt:new Date().toISOString()};
  save();
  closeOffer();
  renderAccount();
  toast('Merci ! Tu recevras nos offres 🎁');
}

/* ---------- share ---------- */
function shareApp(){
  const data = {title:'FasoPrépa', text:'Prépare tes examens et concours avec FasoPrépa ! +5000 questions corrigées 🇧🇫', url: location.href};
  if (navigator.share) navigator.share(data).catch(()=>{});
  else { navigator.clipboard && navigator.clipboard.writeText(data.text+' '+data.url); toast('Lien copié ! 📋'); }
}

/* ---------- init ---------- */
window.addEventListener('scroll', ()=>{
  $('#topbar').classList.toggle('scrolled', window.scrollY>10);
});

document.addEventListener('DOMContentLoaded', ()=>{
  renderHome();
  renderFormations('Tout');
  renderAccount();
  setTimeout(openOffer, 15000);
  if (location.hash === '#subscription'){
    show('subscription');
    if (PAYMENT_CONFIG.backendBaseUrl) setTimeout(checkPaymentStatus, 600);
  }
});
