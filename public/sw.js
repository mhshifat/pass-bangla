// Service Worker for PassBangla PWA
//
// Scope is deliberately narrow:
//  - cache-first for immutable build assets and icons (the only thing that gets faster)
//  - a precached /offline page as the fallback for failed navigations
//  - everything else (HTML, RSC payloads, /api, /admin) goes straight to the network and is
//    never written to Cache Storage, so no authenticated content survives on disk after logout
const VERSION = 'v2'
const STATIC_CACHE = `passbangla-static-${VERSION}`
const OFFLINE_URL = '/offline'
const MAX_STATIC_ENTRIES = 250

const isStaticAsset = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  /^\/(favicon|apple-icon|android-icon|ms-icon|icon-)[^/]*\.(png|ico)$/.test(url.pathname) ||
  /^\/[^/]+\.svg$/.test(url.pathname)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      // Bypass the HTTP cache so a new worker version always picks up a fresh offline page
      cache.add(new Request(OFFLINE_URL, { cache: 'reload' })).catch(() => {})
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== STATIC_CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  )
})

async function trimCache(cache) {
  const keys = await cache.keys()
  if (keys.length <= MAX_STATIC_ENTRIES) return
  // Cache keys are in insertion order; drop the oldest first
  await Promise.all(keys.slice(0, keys.length - MAX_STATIC_ENTRIES).map((key) => cache.delete(key)))
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response.ok && response.type === 'basic') {
    cache.put(request, response.clone()).then(() => trimCache(cache)).catch(() => {})
  }
  return response
}

async function networkWithOfflineFallback(request) {
  try {
    return await fetch(request)
  } catch {
    const offline = await caches.match(OFFLINE_URL)
    return (
      offline ||
      new Response('Offline', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain' },
      })
    )
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request))
    return
  }

  // Full page loads only: pass through untouched, but show the offline page if the network is down.
  // RSC/prefetch requests, /api and everything else are not intercepted at all.
  if (request.mode === 'navigate') {
    event.respondWith(networkWithOfflineFallback(request))
  }
})
