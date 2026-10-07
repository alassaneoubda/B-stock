import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Codes à usage unique (TOTP, RFC 6238 — SHA-1, 6 chiffres, 30 s), compatibles
 * Google Authenticator, Microsoft Authenticator, Authy… Sans dépendance.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=-]/g, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char)
    if (idx === -1) throw new Error('Secret TOTP invalide')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

function codeAt(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', secret).update(msg).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(binary % 1_000_000).padStart(6, '0')
}

/** Code courant (utile pour les tests). */
export function currentTotp(secret: string, at = Date.now()): string {
  return codeAt(base32Decode(secret), Math.floor(at / 30_000))
}

/** Vérifie un code en tolérant ±1 période (décalage d'horloge du téléphone). */
export function verifyTotp(secret: string, code: string, at = Date.now()): boolean {
  const clean = String(code).replace(/\s/g, '')
  if (!/^\d{6}$/.test(clean)) return false
  const key = base32Decode(secret)
  const counter = Math.floor(at / 30_000)
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(codeAt(key, counter + drift))
    if (timingSafeEqual(expected, Buffer.from(clean))) return true
  }
  return false
}

/** URI à ajouter dans l'application d'authentification (lien ou saisie manuelle). */
export function totpUri(secret: string, accountEmail: string, issuer = 'B-Stock Admin'): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

/** Secret formaté par groupes de 4 pour la saisie manuelle. */
export function formatTotpSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret
}
