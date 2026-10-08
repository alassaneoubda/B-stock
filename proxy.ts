import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

/**
 * Edge-compatible : JWT uniquement (pas de bcrypt / Neon).
 * Auth.js v5 pose `__Secure-authjs.session-token` en HTTPS.
 * Sans `secureCookie: true`, getToken cherche `authjs.session-token` → session invisible → boucle login.
 */
async function readSessionToken(req: NextRequest) {
  const secret = process.env.AUTH_SECRET
  if (!secret) return null

  const https = req.nextUrl.protocol === 'https:'
  const attempts = https ? [true, false] : [false, true]

  for (const secureCookie of attempts) {
    const token = await getToken({ req, secret, secureCookie })
    if (token) return token
  }
  return null
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = await readSessionToken(req)

  const isLoggedIn = !!token
  const isPlatformAdmin = token?.isPlatformAdmin === true

  const isProtectedApiRoute =
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth') &&
    !pathname.startsWith('/api/webhooks') &&
    // Webhook Mobile Money des entreprises : authentifié par signature HMAC
    !pathname.startsWith('/api/payments/mobile-money/webhook/') &&
    !pathname.startsWith('/api/cron') // authentifié par CRON_SECRET

  const isDashboardRoute = pathname.startsWith('/dashboard') || pathname === '/pos' || pathname.startsWith('/pos/')

  const isAdminLogin = pathname === '/admin/login'
  const isAdminArea = pathname.startsWith('/admin') && !isAdminLogin

  if (isAdminArea) {
    if (!isLoggedIn) {
      const loginUrl = new URL('/admin/login', req.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
    if (!isPlatformAdmin) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  if (isAdminLogin && isPlatformAdmin) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  if (isPlatformAdmin && isDashboardRoute) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  if (!isLoggedIn && isProtectedApiRoute) {
    return NextResponse.json({ error: 'Non autorisé', code: 'UNAUTHENTICATED' }, { status: 401 })
  }

  if (!isLoggedIn && isDashboardRoute) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // /login?error=... doit rester accessible : la page purge alors une session
  // révoquée (sinon boucle /login -> /dashboard -> /login).
  const hasAuthError = req.nextUrl.searchParams.has('error')
  if (isLoggedIn && !hasAuthError && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(
      new URL(isPlatformAdmin ? '/admin' : '/dashboard', req.url)
    )
  }

  // Chemin demandé, lu par le garde des pages serveur (lib/page-auth.ts).
  // Écrasé ici : la valeur envoyée par le client n'est jamais utilisée.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-pathname', pathname)
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*|images|api/webhooks|api/cron).*)',
  ],
}
