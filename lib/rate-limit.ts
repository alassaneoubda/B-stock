import { NextResponse } from 'next/server'

/**
 * Limitation de débit à fenêtre fixe.
 *
 * - Avec UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN : compteur partagé
 *   entre toutes les instances serverless (API REST Upstash, aucune dépendance).
 * - Sans : compteur en mémoire, par instance (suffisant en dev, protection
 *   partielle en prod — configurer Upstash avant la mise en ligne).
 * En cas d'indisponibilité d'Upstash, on laisse passer (fail-open) plutôt que
 * de bloquer tous les utilisateurs.
 *
 *   const limited = await rateLimit('login', ip, { limit: 10, windowSeconds: 600 })
 *   if (limited) return limited
 */

type Options = { limit: number; windowSeconds: number }

const memory = new Map<string, { count: number; resetAt: number }>()

function memoryHit(key: string, windowSeconds: number): { count: number; ttl: number } {
  const now = Date.now()
  let entry = memory.get(key)
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowSeconds * 1000 }
    memory.set(key, entry)
  }
  entry.count++
  // Nettoyage opportuniste pour éviter une croissance infinie
  if (memory.size > 10_000) {
    for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k)
  }
  return { count: entry.count, ttl: Math.ceil((entry.resetAt - now) / 1000) }
}

async function upstashHit(key: string, windowSeconds: number): Promise<{ count: number; ttl: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, String(windowSeconds), 'NX'],
        ['TTL', key],
      ]),
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    })
    if (!res.ok) return null
    const [incr, , ttl] = (await res.json()) as { result: number }[]
    return { count: Number(incr.result), ttl: Math.max(1, Number(ttl.result)) }
  } catch {
    return null
  }
}

/** Renvoie une réponse 429 si la limite est dépassée, sinon null. */
export async function rateLimit(
  bucket: string,
  identifier: string,
  { limit, windowSeconds }: Options
): Promise<NextResponse | null> {
  const key = `rl:${bucket}:${identifier}`
  const hit = (await upstashHit(key, windowSeconds)) ?? memoryHit(key, windowSeconds)
  if (hit.count <= limit) return null

  return NextResponse.json(
    {
      error: 'Trop de tentatives. Réessayez dans quelques minutes.',
      code: 'RATE_LIMITED',
      retryAfter: hit.ttl,
    },
    { status: 429, headers: { 'Retry-After': String(hit.ttl) } }
  )
}

/** Variante booléenne (pour les contextes sans NextResponse, ex. authorize NextAuth). */
export async function isRateLimited(bucket: string, identifier: string, options: Options): Promise<boolean> {
  return (await rateLimit(bucket, identifier, options)) !== null
}

/** IP du client derrière le proxy (Vercel / Cloudflare). */
export function clientIp(headers: Headers): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  )
}
