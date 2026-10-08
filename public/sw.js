/*
 * B-Stock — Service Worker (écrit à la main, sans Workbox).
 *
 * Stratégie de sécurité : on ne met JAMAIS en cache les données sensibles.
 *  - /api/*        -> réseau uniquement (jamais intercepté)
 *  - /dashboard/*  -> réseau uniquement (données tenant)
 *  - /pos, /pos/*  -> réseau uniquement (données tenant)
 *  - /admin/*      -> réseau uniquement (back office)
 *  - /login, /register, /onboarding -> réseau uniquement
 *  - requêtes non-GET -> réseau uniquement
 *  - cookies/sessions NextAuth -> jamais lus ni stockés ici
 *
 * Seule exception, sans rien mettre en cache : la NAVIGATION vers /pos et
 * /dashboard/sales/new passe par le réseau ; si le réseau échoue, on sert la
 * coquille hors ligne correspondante (/hors-ligne/caisse, /hors-ligne/vente).
 * Ces coquilles sont des pages statiques SANS aucune donnée d'entreprise ni de
 * session : catalogue et ventes en attente viennent d'IndexedDB (lib/offline).
 * La réponse réseau de /pos ou /dashboard/sales/new n'est JAMAIS stockée.
 *
 * On met en cache uniquement :
 *  - les assets statiques immuables (/_next/static, polices, images, icônes)
 *  - les pages publiques (landing + pages légales/marketing)
 *  - une page de repli hors ligne
 *  - les coquilles hors ligne /hors-ligne/* (et leurs fichiers /_next/static)
 *
 * Pour bumper le cache lors d'un déploiement, incrémenter VERSION.
 */

// v4 : purge des pages publiques mises en cache avec une session sérialisée
// v5 : coquilles de vente hors ligne (/hors-ligne/caisse, /hors-ligne/vente)
const VERSION = 'v5'
const STATIC_CACHE = `bstock-static-${VERSION}`
const PAGE_CACHE = `bstock-pages-${VERSION}`
const OFFLINE_URL = '/offline'

const PRECACHE = [OFFLINE_URL, '/icons/192.png', '/manifest.webmanifest']

// Écran demandé -> coquille hors ligne servie si le réseau ne répond pas
const APP_SHELLS = {
  '/pos': '/hors-ligne/caisse',
  '/dashboard/sales/new': '/hors-ligne/vente',
}
const SHELL_URLS = Object.values(APP_SHELLS)
const SHELL_REFRESH_MS = 10 * 60 * 1000
let lastShellRefresh = 0

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

/**
 * Met en cache une coquille hors ligne et les fichiers statiques qu'elle
 * référence. Refusée si la réponse n'est pas une page 200 servie directement
 * (redirection = pas une coquille statique).
 */
async function cacheShell(cache, url) {
  const response = await fetch(url, { cache: 'reload', credentials: 'omit' })
  if (!response || !response.ok || response.redirected) return
  const html = await response.clone().text()
  await cache.put(url, response)
  const assets = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])
  await Promise.allSettled([...assets].map((asset) => cache.add(asset)))
}

async function refreshShells() {
  lastShellRefresh = Date.now()
  const cache = await caches.open(STATIC_CACHE)
  await Promise.allSettled(SHELL_URLS.map((url) => cacheShell(cache, url)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
      await Promise.allSettled(SHELL_URLS.map((url) => cacheShell(cache, url)))
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
  if (pathname === '/pos' || pathname.startsWith('/pos/')) return true
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

  // Écran de vente : réseau d'abord (réponse jamais stockée), coquille hors ligne en repli
  const shell = request.mode === 'navigate' ? APP_SHELLS[url.pathname] : undefined
  if (shell) {
    event.respondWith(networkOrShell(request, shell, event))
    return
  }

  // Zones sensibles : ne pas appeler respondWith → navigateur gère seul.
  if (isNetworkOnly(url.pathname)) return

  // Coquilles hors ligne (statiques, sans données) : réseau d'abord, cache en repli
  if (request.mode === 'navigate' && SHELL_URLS.includes(url.pathname)) {
    event.respondWith(networkFirstShell(url.pathname))
    return
  }

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

async function networkOrShell(request, shellUrl, event) {
  try {
    const fresh = await fetch(request)
    // En ligne : on profite du réseau pour rafraîchir les coquilles (au plus toutes les 10 min)
    if (Date.now() - lastShellRefresh > SHELL_REFRESH_MS) event.waitUntil(refreshShells().catch(() => {}))
    return fresh
  } catch {
    const cached = await caches.match(shellUrl)
    if (cached) return cached
    const offline = await caches.match(OFFLINE_URL)
    return offline || offlineResponse()
  }
}

async function networkFirstShell(shellUrl) {
  try {
    const fresh = await fetch(shellUrl, { cache: 'no-cache', credentials: 'omit' })
    if (fresh && fresh.ok && !fresh.redirected) {
      const cache = await caches.open(STATIC_CACHE)
      cache.put(shellUrl, fresh.clone())
    }
    return fresh
  } catch {
    const cached = await caches.match(shellUrl)
    if (cached) return cached
    const offline = await caches.match(OFFLINE_URL)
    return offline || offlineResponse()
  }
}

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
