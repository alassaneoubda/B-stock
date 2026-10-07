import type { MetadataRoute } from 'next'

const BASE_URL = (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Espaces privés : jamais indexés
        disallow: ['/dashboard', '/admin', '/api', '/onboarding'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
