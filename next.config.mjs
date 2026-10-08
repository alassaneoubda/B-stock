/** @type {import('next').NextConfig} */

// En-têtes de sécurité appliqués à toutes les réponses.
// (Une CSP stricte avec nonces viendra avec la refonte du front ; ici on bloque
// déjà le clickjacking, le sniffing MIME et les fuites de Referer.)
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
]

const nextConfig = {
  // Surface TypeScript errors in CI/local builds — do not hide them.
  typescript: {
    ignoreBuildErrors: false,
  },
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
