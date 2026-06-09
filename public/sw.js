/*
 * B-Stock — Service Worker (écrit à la main, sans Workbox).
 *
 * Stratégie de sécurité : on ne met JAMAIS en cache les données sensibles.
 *  - /api/*        -> réseau uniquement (jamais intercepté)
 *  - /dashboard/*  -> réseau uniquement (données tenant)
 *  - /admin/*      -> réseau uniquement (back office)
 *  - /onboarding   -> réseau uniquement
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

const VERSION = 'v1'
const STATIC_CACHE = `bstock-static-${VERSION}`
const PAGE_CACHE = `bstock-pages-${VERSION}`
const OFFLINE_URL = '/offline'

// Ressources mises en cache dès l'installation.
const PRECACHE = [OFFLINE_URL, '/icons/192.png', '/manifest.webmanifest']

// Pages publiques que l'on autorise à mettre en cache pour la consultation hors ligne.
const PUBLIC_PAGES = [
  '/',
  '/a-propos',
  '/cgu',
  '/confidentialite',
  '/guide',
  '/support',
  '/contact',
]

// Préfixes strictement réservés au réseau (données sensibles / dynamiques).
const NETWORK_ONLY_PREFIXES = ['/api/', '/dashboard', '/admin', '/onboarding']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      // allSettled : un 404 sur une ressource ne fait pas échouer toute l'installation.
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
    url.pathname === '/icon.svg' ||
    /\.(?:js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|avif|ico)$/.test(url.pathname)
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // On ne gère que les GET ; tout le reste (POST/PUT/...) passe au réseau.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // On ignore les autres origines (CDN tiers, analytics, etc.).
  if (url.origin !== self.location.origin) return

  // Zones sensibles : jamais interceptées, jamais mises en cache.
  if (isNetworkOnly(url.pathname)) return

  // Navigations (HTML) : réseau d'abord, repli cache puis page hors ligne.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request, url))
    return
  }

  // Assets statiques : stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request))
    return
  }

  // Reste : réseau d'abord avec repli cache si dispo.
  event.respondWith(fetch(request).catch(() => caches.match(request)))
})

async function networkFirstPage(request, url) {
  try {
    const fresh = await fetch(request)
    // On ne met en cache que les pages publiques explicitement autorisées.
    if (fresh && fresh.ok && PUBLIC_PAGES.includes(url.pathname)) {
      const cache = await caches.open(PAGE_CACHE)
      cache.put(request, fresh.clone())
    }
    return fresh
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    const offline = await caches.match(OFFLINE_URL)
    if (offline) return offline
    return new Response('Hors ligne', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached || network
}
