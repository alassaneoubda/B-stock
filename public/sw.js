/*
 * B-Stock — Service Worker (écrit à la main, sans Workbox).
 *
 * Stratégie de sécurité : on ne met JAMAIS en cache les données sensibles.
 *  - /api/*        -> réseau uniquement (jamais intercepté)
 *  - /dashboard/*  -> réseau uniquement (données tenant)
 *  - /admin/*      -> réseau uniquement (back office)
 *  - /login, /register, /onboarding -> réseau uniquement
 *  - requêtes non-GET -> réseau uniquement
 *  - cookies/sessions NextAuth -> jamais lus ni stockés ici
 *
 * On met en cache uniquement :
 *  - les assets statiques immuables (/_next/static, polices, images, icônes)
 *  - les pages publiques (landing + pages légales/marketing)
 *  - une page de repli hors ligne
 *
 * Pour bumper le cache lors d'un déploiement, incrémenter VERSION.
 */

const VERSION = 'v3'
const STATIC_CACHE = `bstock-static-${VERSION}`
const PAGE_CACHE = `bstock-pages-${VERSION}`
const OFFLINE_URL = '/offline'

const PRECACHE = [OFFLINE_URL, '/icons/192.png', '/manifest.webmanifest']

const PUBLIC_PAGES = [
  '/',
  '/a-propos',
  '/cgu',
  '/confidentialite',
  '/guide',
  '/support',
  '/contact',
]

const NETWORK_ONLY_PREFIXES = [
  '/api/',
  '/dashboard',
  '/admin',
  '/onboarding',
  '/login',
  '/register',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== PAGE_CACHE)
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function isNetworkOnly(pathname) {
  return NETWORK_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname === '/icon.svg' ||
    /\.(?:js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico)$/.test(url.pathname)
  )
}

function offlineResponse() {
  return new Response('Hors ligne', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  if (url.origin !== self.location.origin) return

  // Zones sensibles : ne pas appeler respondWith → navigateur gère seul.
  if (isNetworkOnly(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request, url))
    return
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  event.respondWith(networkWithCacheFallback(request))
})

async function networkFirstPage(request, url) {
  try {
    const fresh = await fetch(request)
    if (fresh && fresh.ok && PUBLIC_PAGES.includes(url.pathname)) {
      const cache = await caches.open(PAGE_CACHE)
      cache.put(request, fresh.clone())
    }
    return fresh
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    const offline = await caches.match(OFFLINE_URL)
    return offline || offlineResponse()
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return cached || offlineResponse()
  }
}

async function networkWithCacheFallback(request) {
  try {
    return await fetch(request)
  } catch {
    const cached = await caches.match(request)
    return cached || offlineResponse()
  }
}
