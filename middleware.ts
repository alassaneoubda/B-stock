import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

/**
 * Edge-compatible middleware — uses JWT only (no Node crypto / bcrypt / Neon).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  })

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
