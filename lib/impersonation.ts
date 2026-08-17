import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Impersonation tokens — short-lived, HMAC-signed proofs that a super-admin
 * authorized logging in as a given tenant user. The token is exchanged via the
 * NextAuth 'impersonate' credentials provider.
 *
 * Format: base64url(payload).hex(hmac)
 */

type ImpersonationPayload = {
  uid: string // target user id
  adminId: string // platform admin who initiated
  exp: number // unix seconds
}

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET manquant')
  return s
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('hex')
}

export function createImpersonationToken(
  uid: string,
  adminId: string,
  ttlSeconds = 120
): string {
  const payload: ImpersonationPayload = {
    uid,
    adminId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function verifyImpersonationToken(
  token: string
): ImpersonationPayload | null {
  const [body, mac] = token.split('.')
  if (!body || !mac) return null

  const expected = sign(body)
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as ImpersonationPayload
    if (!payload.uid || !payload.adminId || !payload.exp) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}
