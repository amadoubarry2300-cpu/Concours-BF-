const CACHE_VERSION = 'groq-free-limit-v1-14';
const APP_CACHE = `reussite-concours-bf-app-${CACHE_VERSION}`;
const DATA_CACHE = `reussite-concours-bf-data-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/styles.css?v=groq-free-limit-v1-14',
  '/js/questions.js?v=groq-free-limit-v1-14',
  '/js/app.js?v=groq-free-limit-v1-14',
  '/img/logo.png',
  '/img/pwa-icon-192.png',
  '/img/pwa-icon-512.png',
  '/img/hero.jpg',
  '/img/classroom-bf-wide.jpg',
  '/img/students-group.jpg',
  '/img/study.jpg',
  '/img/success.jpg',
  '/img/subject-burkina.svg',
  '/img/subject-culture.svg',
  '/img/subject-history-geo.svg',
  '/img/subject-math.svg',
  '/img/subject-svt.svg',
  '/img/subject-french.svg',
  '/img/subject-psychotech.svg',
  '/img/subject-greffier.svg',
  '/img/level-cep.svg',
  '/img/level-bepc.svg',
  '/img/level-bac.svg',
  '/img/level-licence.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('reussite-concours-bf-') && ![APP_CACHE, DATA_CACHE].includes(key))
      .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function sameOrigin(url){ return url.origin === self.location.origin; }
function isCandidateApi(path){
  return path === '/api/questions'
    || path === '/api/qcm-publications'
    || path === '/api/resources'
    || path === '/api/news'
    || path === '/api/subscription/status';
}
function isOpenableFile(path){
  return /^\/api\/resources\/[^/]+\/download$/.test(path) || /^\/api\/news\/[^/]+\/pdf$/.test(path);
}

function responseHasPremiumData(response){
  return response && (response.headers.get('X-Premium-Included') === 'true' || response.headers.get('X-Premium-Content') === 'true');
}

async function networkFirst(request){
  const cache = await caches.open(DATA_CACHE);
  try{
    const fresh = await fetch(request);
    if (fresh && fresh.ok && !responseHasPremiumData(fresh)) cache.put(request, fresh.clone());
    return fresh;
  }catch(err){
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function networkFirstFile(request){
  const cache = await caches.open(DATA_CACHE);
  try{
    const fresh = await fetch(request);
    if (fresh && fresh.ok && !responseHasPremiumData(fresh)) cache.put(request, fresh.clone());
    return fresh;
  }catch(err){
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request){
  const cacheName = request.url.includes('/api/') ? DATA_CACHE : APP_CACHE;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!sameOrigin(url)) return;

  if (request.mode === 'navigate'){
    event.respondWith(networkFirst(request).catch(() => caches.match('/index.html')));
    return;
  }

  if (isCandidateApi(url.pathname)){
    event.respondWith(networkFirst(request));
    return;
  }

  if (isOpenableFile(url.pathname)){
    event.respondWith(networkFirstFile(request));
    return;
  }

  if (/\.(?:css|js|png|jpg|jpeg|webp|svg|gif|ico|woff2?)$/i.test(url.pathname)){
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_DATA_CACHE'){
    event.waitUntil(caches.delete(DATA_CACHE));
  }
});
