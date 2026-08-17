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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = await readSessionToken(req)

  const isLoggedIn = !!token
  const isPlatformAdmin = token?.isPlatformAdmin === true

  const isProtectedApiRoute =
    pathname.startsWith('/api/') &&
    !pathname.startsWith('/api/auth') &&
    !pathname.startsWith('/api/webhooks')

  const isDashboardRoute = pathname.startsWith('/dashboard')

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

  if (!isLoggedIn && (isDashboardRoute || isProtectedApiRoute)) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isLoggedIn && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(
      new URL(isPlatformAdmin ? '/admin' : '/dashboard', req.url)
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*|images|api/webhooks).*)',
  ],
}
