import assert from 'node:assert/strict';
import fs from 'node:fs';

const rootHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mirrorHtml = fs.readFileSync(new URL('../backend/public/index.html', import.meta.url), 'utf8');
const rootApp = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const mirrorApp = fs.readFileSync(new URL('../backend/public/js/app.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../backend/server.js', import.meta.url), 'utf8');
const schema = fs.readFileSync(new URL('../backend/supabase-schema.sql', import.meta.url), 'utf8');
const migration = fs.readFileSync(new URL('../backend/automatic-email-notifications-v29.sql', import.meta.url), 'utf8');

assert.equal(rootHtml, mirrorHtml, 'La page publique et sa copie serveur doivent être identiques');
assert.equal(rootApp, mirrorApp, 'Le code public et sa copie serveur doivent être identiques');

for (const forbidden of [
  'marketingConsentField',
  'marketingEmailOptIn',
  'accountMarketingEmailOptIn',
  'saveEmailPreferencesBtn',
  'saveEmailPreferences()',
  'emailPreferencesResult'
]){
  assert.ok(!rootHtml.includes(forbidden), `Ancien contrôle e-mail encore visible : ${forbidden}`);
  assert.ok(!rootApp.includes(forbidden), `Ancien réglage e-mail encore actif : ${forbidden}`);
}
assert.match(rootHtml, /nouveaux QCM, documents, offres et messages importants seront envoyés automatiquement/i);
assert.match(rootHtml, /Notifications par e-mail/);

const registerStart = serverSource.indexOf("app.post('/api/auth/register'");
const registerEnd = serverSource.indexOf("app.post('/api/auth/pin-reset/request'", registerStart);
assert.ok(registerStart > 0 && registerEnd > registerStart, 'Route d’inscription introuvable');
const registerBlock = serverSource.slice(registerStart, registerEnd);
assert.ok(!registerBlock.includes('req.body?.marketingEmailOptIn'), 'Le serveur ne doit pas demander une autorisation e-mail');
assert.match(registerBlock, /marketing_email_opt_in:true/);
assert.match(registerBlock, /marketing_email_unsubscribed_at:null/);
assert.match(registerBlock, /emailNotification:\{ configured:emailNotificationsConfigured\(\), sent:/);
assert.ok(!serverSource.includes("app.patch('/api/profile/email-preferences'"), 'L’ancienne route de préférence doit être supprimée');
assert.match(serverSource, /profiles\?marketing_email_unsubscribed_at=is\.null&email=not\.is\.null/);
assert.ok(!serverSource.includes('profiles?marketing_email_opt_in=eq.true&marketing_email_unsubscribed_at=is.null'), 'Une ancienne valeur false ne doit pas exclure un candidat');
assert.match(serverSource, /app\.get\('\/api\/email\/unsubscribe'/, 'Le désabonnement depuis les e-mails doit rester disponible');
assert.match(serverSource, /emailNotifications:emailNotificationsConfigured\(\)/, 'La configuration e-mail doit être visible sans secret dans le contrôle de santé');
assert.match(serverSource, /kind:'new_qcm'/, 'Les nouveaux QCM doivent préparer une notification');
assert.match(serverSource, /kind:'new_document'/, 'Les nouveaux documents doivent préparer une notification');
assert.match(serverSource, /kind:'promotion'/, 'Les offres doivent pouvoir être envoyées automatiquement');
assert.match(schema, /marketing_email_opt_in boolean not null default true/);
assert.match(migration, /alter column marketing_email_opt_in set default true/);
assert.match(migration, /marketing_email_unsubscribed_at is null/);

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://automatic-email-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'automatic-email-service-role-test';
process.env.SESSION_SECRET = 'automatic-email-v29-test-secret';
process.env.RESEND_API_KEY = 'automatic-email-resend-test';
process.env.RESEND_FROM = 'Réussite Concours BF <test@example.com>';
process.env.APP_ORIGIN = 'https://concoursbf-fawn.vercel.app';

const campaign = {
  id:'10000000-0000-4000-8000-000000000001',
  kind:'new_qcm',
  subject:'Nouveaux QCM',
  text_body:'De nouveaux QCM sont disponibles.',
  cta_label:'Découvrir',
  cta_url:'https://concoursbf-fawn.vercel.app/#formations',
  status:'pending',
  sent_count:0,
  failed_count:0,
  cursor_profile_id:null
};
const candidates = [
  {
    id:'20000000-0000-4000-8000-000000000001',
    email:'awa@example.com',
    first_name:'Awa',
    display_name:'Awa Test',
    marketing_email_opt_in:false,
    marketing_email_unsubscribed_at:null
  },
  {
    id:'20000000-0000-4000-8000-000000000002',
    email:'moussa@example.com',
    first_name:'Moussa',
    display_name:'Moussa Test',
    marketing_email_opt_in:true,
    marketing_email_unsubscribed_at:null
  }
];
const sentMails = [];
let candidateSelectionUrl = '';
let deliveryNumber = 0;

function json(data, status=200){
  return new Response(JSON.stringify(data), { status, headers:{ 'content-type':'application/json' } });
}

const realFetch = global.fetch;
global.fetch = async (input, options={}) => {
  const url = String(input);
  if (url === 'https://api.resend.com/emails'){
    sentMails.push(JSON.parse(options.body || '{}'));
    return json({ id:`mail-${sentMails.length}` });
  }
  if (!url.startsWith('https://automatic-email-test.supabase.co/rest/v1/')) return realFetch(input, options);
  const target = new URL(url);
  const endpoint = target.pathname.replace('/rest/v1/', '');
  const method = String(options.method || 'GET').toUpperCase();

  if (endpoint === 'email_campaigns' && method === 'GET') return json([campaign]);
  if (endpoint === 'email_campaigns' && method === 'PATCH') return json([]);
  if (endpoint === 'profiles' && method === 'GET'){
    candidateSelectionUrl = url;
    return json(candidates);
  }
  if (endpoint === 'email_campaign_deliveries' && method === 'POST'){
    deliveryNumber += 1;
    return json([{ id:`delivery-${deliveryNumber}` }]);
  }
  if (endpoint === 'email_campaign_deliveries' && method === 'PATCH') return json([]);
  return json([]);
};

try{
  const { processNextEmailCampaign } = await import('../backend/server.js?automatic-email-v29-test=1');
  const result = await processNextEmailCampaign();
  assert.equal(result.processed, true);
  assert.equal(result.sent, 2, 'Chaque profil avec e-mail doit recevoir la campagne, même si l’ancien champ vaut false');
  assert.equal(result.failed, 0);
  assert.equal(sentMails.length, 2);
  assert.match(candidateSelectionUrl, /marketing_email_unsubscribed_at=is\.null/);
  assert.match(candidateSelectionUrl, /email=not\.is\.null/);
  assert.ok(!candidateSelectionUrl.includes('marketing_email_opt_in'), 'La sélection ne doit plus dépendre de l’ancien accord');
  assert.ok(sentMails.every(mail => mail.headers?.['List-Unsubscribe']), 'Chaque nouveauté doit garder un lien de désabonnement sûr');
  console.log('automatic email notifications v29: enrollment, recipients, controls and unsubscribe tests passed');
} finally {
  global.fetch = realFetch;
}
