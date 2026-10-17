import assert from 'node:assert/strict';
import http from 'node:http';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://mock.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
process.env.SESSION_SECRET = 'email-v20-test-secret';
process.env.RESEND_API_KEY = 'resend-test';
process.env.RESEND_FROM = 'Réussite Concours BF <test@example.com>';
process.env.APP_ORIGIN = 'https://concoursbf-fawn.vercel.app';

const profile = {
  id:'11111111-1111-4111-8111-111111111111',
  phone:'+22670000000',
  first_name:'Awa',
  last_name:'Test',
  display_name:'Awa Test',
  email:'awa@example.com',
  role:'student',
  pin_hash:'unused'
};
const state = {
  reset:null,
  profilePatch:null,
  tokenPatch:null,
  sessionsRevoked:false,
  mails:[],
  events:new Map(),
  activeSubscription:{ id:'33333333-3333-4333-8333-333333333333', expires_at:new Date(Date.now() + 20 * 86400000).toISOString() },
  subscriptionInsert:null
};

function json(data, status=200){
  return new Response(JSON.stringify(data), { status, headers:{'content-type':'application/json'} });
}

const realFetch = global.fetch;
global.fetch = async (input, options={}) => {
  const url = String(input);
  if (url === 'https://api.resend.com/emails'){
    state.mails.push(JSON.parse(options.body || '{}'));
    return json({ id:`mail-${state.mails.length}` });
  }
  if (!url.startsWith('https://mock.supabase.co/rest/v1/')) return realFetch(input, options);
  const target = new URL(url);
  const endpoint = target.pathname.replace('/rest/v1/','');
  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;

  if (endpoint === 'profiles' && method === 'GET'){
    if (target.searchParams.has('email')){
      return json(target.searchParams.get('email') === 'eq.awa@example.com' ? [profile] : []);
    }
    if (target.searchParams.has('id')) return json([profile]);
    if (target.searchParams.has('phone')) return json([profile]);
    return json([]);
  }
  if (endpoint === 'profiles' && method === 'PATCH'){
    state.profilePatch = body;
    return json([]);
  }
  if (endpoint === 'pin_reset_tokens' && method === 'POST'){
    const row = Array.isArray(body) ? body[0] : body;
    state.reset = { id:'22222222-2222-4222-8222-222222222222', attempts:0, used_at:null, created_at:new Date().toISOString(), ...row };
    return json([]);
  }
  if (endpoint === 'pin_reset_tokens' && method === 'GET'){
    if (target.searchParams.has('created_at')) return json([]);
    return json(state.reset ? [state.reset] : []);
  }
  if (endpoint === 'pin_reset_tokens' && method === 'PATCH'){
    state.tokenPatch = body;
    state.reset = { ...state.reset, ...body };
    return json([]);
  }
  if (endpoint === 'sessions' && method === 'PATCH'){
    state.sessionsRevoked = Boolean(body?.revoked_at);
    return json([]);
  }
  if (endpoint === 'email_notification_events' && method === 'POST'){
    const row = Array.isArray(body) ? body[0] : body;
    if (state.events.has(row.event_key)) return json([]);
    const event = { id:`event-${state.events.size + 1}`, ...row };
    state.events.set(row.event_key, event);
    return json([event]);
  }
  if (endpoint === 'email_notification_events' && method === 'PATCH') return json([]);
  if (endpoint === 'subscriptions' && method === 'GET'){
    if (target.searchParams.has('tx_ref')) return json([]);
    if (target.searchParams.has('phone')) return json([state.activeSubscription]);
    return json([]);
  }
  if (endpoint === 'subscriptions' && method === 'POST'){
    state.subscriptionInsert = Array.isArray(body) ? body[0] : body;
    return json([]);
  }
  return json([]);
};

const { app, marketingCampaignContent, sendEmailEventOnce, activateSubscription } = await import('../backend/server.js?email-v20-test=1');
const server = http.createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

function request(path, body){
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      hostname:'127.0.0.1', port, path, method:'POST',
      headers:{ 'content-type':'application/json', 'content-length':Buffer.byteLength(payload) }
    }, res => {
      let raw='';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => resolve({ status:res.statusCode, data:JSON.parse(raw || '{}') }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

try{
  const unknown = await request('/api/auth/pin-reset/request', { email:'unknown@example.com' });
  const known = await request('/api/auth/pin-reset/request', { email:'awa@example.com' });
  assert.equal(unknown.status, 200);
  assert.equal(known.status, 200);
  assert.deepEqual(known.data, unknown.data, 'La réponse ne doit pas révéler si le compte existe');
  assert.equal(state.mails.length, 1, 'Un code doit être envoyé uniquement au compte existant');
  assert.ok(state.reset?.code_hash && !/^[0-9]{6}$/.test(state.reset.code_hash), 'Le code stocké doit être haché');
  const code = String(state.mails[0].text).match(/([0-9]{6})/)?.[1];
  assert.match(code || '', /^[0-9]{6}$/);
  assert.ok(!state.reset.code_hash.includes(code), 'Le code en clair ne doit pas être stocké');

  const wrong = code === '000000' ? '111111' : '000000';
  const bad = await request('/api/auth/pin-reset/confirm', { email:'awa@example.com', code:wrong, pin:'9876' });
  assert.equal(bad.status, 400);
  assert.equal(state.reset.attempts, 1, 'Une tentative incorrecte doit être comptée');
  assert.equal(state.profilePatch, null, 'Un mauvais code ne doit jamais modifier le PIN');

  const good = await request('/api/auth/pin-reset/confirm', { email:'awa@example.com', code, pin:'9876' });
  assert.equal(good.status, 200);
  assert.match(state.profilePatch?.pin_hash || '', /^scrypt\$/);
  assert.ok(!String(state.profilePatch.pin_hash).includes('9876'));
  assert.ok(state.reset.used_at, 'Le code doit devenir inutilisable');
  assert.equal(state.sessionsRevoked, true, 'Les anciennes sessions doivent être révoquées');
  assert.equal(state.mails.length, 2, 'Une confirmation de sécurité doit être envoyée');
  assert.match(state.mails[1].subject || '', /PIN.*modifi/i);

  const content = marketingCampaignContent({ subject:'Nouveaux QCM', text_body:'Des nouveautés sont disponibles.', cta_label:'Découvrir', cta_url:'https://concoursbf-fawn.vercel.app/' }, profile);
  assert.match(content.unsubscribe, /^https:\/\/concoursbf-fawn\.vercel\.app\/api\/email\/unsubscribe\?/);
  assert.match(content.html, /Se désabonner/);
  assert.match(content.text, /Se désabonner/);
  assert.match(content.html, /tu as un compte Réussite Concours BF/i);
  assert.doesNotMatch(content.html, /tu as accepté/i);

  const beforeEventMails = state.mails.length;
  const event = { profile, eventType:'login_success', eventKey:'login:test:2026-10-16', subject:'Connexion réussie', text:'Connexion', html:'<p>Connexion</p>' };
  assert.equal(await sendEmailEventOnce(event), true);
  assert.equal(await sendEmailEventOnce(event), false, 'Un événement déjà journalisé ne doit pas être renvoyé');
  assert.equal(state.mails.length, beforeEventMails + 1, 'L’idempotence doit empêcher les doublons');

  const beforeRenewalMails = state.mails.length;
  const previousExpiry = new Date(state.activeSubscription.expires_at).getTime();
  const renewed = await activateSubscription({ phone:profile.phone, txRef:'renewal-test-001', provider:'SASPAY', email:profile.email, plan:'premium_monthly', days:30 });
  assert.equal(renewed.renewed, true);
  assert.equal(new Date(renewed.expiresAt).getTime(), previousExpiry + 30 * 86400000, 'Le renouvellement doit prolonger la date existante');
  assert.equal(state.subscriptionInsert.expires_at, renewed.expiresAt);
  assert.equal(state.mails.length, beforeRenewalMails + 1);
  assert.match(state.mails.at(-1).subject || '', /renouvel/i);

  console.log('email automation: security, unsubscribe, idempotency and renewal tests passed');
} finally {
  await new Promise(resolve => server.close(resolve));
  global.fetch = realFetch;
}
