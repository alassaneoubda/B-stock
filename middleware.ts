import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth
  const isPlatformAdmin = req.auth?.user?.isPlatformAdmin === true

  // API routes that require authentication
  const isProtectedApiRoute = pathname.startsWith('/api/') && !pathname.startsWith('/api/auth') && !pathname.startsWith('/api/webhooks')

  // Dashboard routes
  const isDashboardRoute = pathname.startsWith('/dashboard')

  // ===== Back office plateforme (/admin) =====
  const isAdminLogin = pathname === '/admin/login'
  const isAdminArea = pathname.startsWith('/admin') && !isAdminLogin

  if (isAdminArea) {
    if (!isLoggedIn) {
      const loginUrl = new URL('/admin/login', req.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
    if (!isPlatformAdmin) {
      // Tenant user trying to reach the back office
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  if (isAdminLogin && isPlatformAdmin) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  // A real platform admin has no tenant context -> keep them in the back office
  if (isPlatformAdmin && isDashboardRoute) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }

  // Redirect to login if accessing protected routes without auth
  if (!isLoggedIn && (isDashboardRoute || isProtectedApiRoute)) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect if already logged in and accessing auth pages
  if (isLoggedIn && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL(isPlatformAdmin ? '/admin' : '/dashboard', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.*|apple-icon.*|images|api/webhooks).*)',
  ],
}
