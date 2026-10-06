import { afterAll } from 'vitest'

// Garde-fou : les tests écrivent en base, ils ne doivent JAMAIS viser la production.
const url = process.env.DATABASE_URL ?? ''
const host = (() => {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
})()
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  throw new Error(`Tests refusés : DATABASE_URL doit pointer vers une base locale (reçu : ${host || 'vide'})`)
}

afterAll(async () => {
  const { pool } = await import('@/lib/db')
  await pool.end().catch(() => {})
})
