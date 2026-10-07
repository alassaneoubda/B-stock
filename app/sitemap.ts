import type { MetadataRoute } from 'next'

const BASE_URL = (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')

const PUBLIC_PAGES: { path: string; priority: number }[] = [
  { path: '/', priority: 1 },
  { path: '/register', priority: 0.8 },
  { path: '/guide', priority: 0.6 },
  { path: '/a-propos', priority: 0.5 },
  { path: '/contact', priority: 0.5 },
  { path: '/support', priority: 0.4 },
  { path: '/cgu', priority: 0.2 },
  { path: '/confidentialite', priority: 0.2 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return PUBLIC_PAGES.map(({ path, priority }) => ({
    url: `${BASE_URL}${path}`,
    lastModified,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority,
  }))
}
