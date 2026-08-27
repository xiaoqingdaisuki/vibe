const PRECACHE_NAME = 'vibe-pwa-precache-v2';
const RUNTIME_CACHE_NAME = 'vibe-pwa-runtime-v2';
const PRECACHE_URLS = ['/', '/offline', '/manifest.webmanifest', '/icon', '/apple-icon', '/icons/vibe-icon.svg'];

// 判断响应是否可被安全写入缓存
function isCacheableResponse(response) {
  return response.ok || response.type === 'opaque';
}

// 预缓存离线页、主页和安装所需的基础资源
async function precacheApplicationShell() {
  const cache = await caches.open(PRECACHE_NAME);
  await cache.addAll(PRECACHE_URLS);
  await self.skipWaiting();
}

// 清理旧版本缓存并立即接管已打开页面
async function activateServiceWorker() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames
      .filter(
        (cacheName) =>
          cacheName.startsWith('vibe-pwa-') && cacheName !== PRECACHE_NAME && cacheName !== RUNTIME_CACHE_NAME,
      )
      .map((cacheName) => caches.delete(cacheName)),
  );
  await self.clients.claim();
}

// 在线优先获取页面，网络不可用时回退到访问过的页面或离线页
async function networkFirstNavigation(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);

  try {
    const response = await fetch(request);

    if (isCacheableResponse(response)) {
      await runtimeCache.put(request, response.clone());
    }

    return response;
  } catch {
    const cachedPage = (await runtimeCache.match(request)) || (await caches.match(request));
    return cachedPage || (await caches.match('/offline')) || Response.error();
  }
}

// 缓存优先提供已访问的静态资源，减少离线访问时的缺失样式和脚本
async function cacheFirstAsset(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE_NAME);
  const cachedAsset = await runtimeCache.match(request);

  if (cachedAsset) return cachedAsset;

  try {
    const response = await fetch(request);

    if (isCacheableResponse(response)) {
      await runtimeCache.put(request, response.clone());
    }

    return response;
  } catch {
    return caches.match(request).then((cachedResponse) => cachedResponse || Response.error());
  }
}

// 判断请求是否为可离线复用的同源静态资源
function isStaticAssetRequest(request, url) {
  return (
    ['font', 'image', 'script', 'style'].includes(request.destination) ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname.startsWith('/icons/')
  );
}

// 安装时写入应用外壳缓存
self.addEventListener('install', (event) => {
  event.waitUntil(precacheApplicationShell());
});

// 激活时移除过期缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(activateServiceWorker());
});

// 根据请求类型选择页面或静态资源的缓存策略
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
