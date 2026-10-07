import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/auth', () => ({ auth: async () => null }))
import { sql } from '@/lib/db'
import { adminCan } from '@/lib/admin-auth'
import { currentTotp, generateTotpSecret, verifyTotp } from '@/lib/totp'
import { consumeResetToken, createPasswordResetLink, inspectResetToken } from '@/lib/password-reset'
import { nextPlatformNumber } from '@/lib/cron-runs'
import { AppError } from '@/lib/errors'
import { createTenant } from './helpers'

describe('Double authentification (TOTP)', () => {
  it('accepte le code courant et la période voisine, refuse le reste', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    expect(verifyTotp(secret, currentTotp(secret, now), now)).toBe(true)
    expect(verifyTotp(secret, currentTotp(secret, now - 30_000), now)).toBe(true)
    expect(verifyTotp(secret, currentTotp(secret, now - 120_000), now)).toBe(false)
    expect(verifyTotp(secret, '12345', now)).toBe(false)
  })

  it('vecteur de référence RFC 6238 (secret « 12345678901234567890 »)', () => {
    // base32 de « 12345678901234567890 »
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    expect(currentTotp(secret, 59_000)).toBe('287082')
  })
})

describe('Rôles administrateurs', () => {
  it('le support assiste les clients mais ne touche ni aux paiements ni aux plans', () => {
    expect(adminCan('support', 'companies.impersonate')).toBe(true)
    expect(adminCan('support', 'billing.write')).toBe(false)
    expect(adminCan('support', 'plans.write')).toBe(false)
    expect(adminCan('finance', 'billing.write')).toBe(true)
    expect(adminCan('finance', 'companies.impersonate')).toBe(false)
    expect(adminCan('super_admin', 'admins.manage')).toBe(true)
  })
})

describe('Réinitialisation du mot de passe par lien', () => {
  it('lien à usage unique qui invalide les sessions', async () => {
    const t = await createTenant()
    const { url } = await createPasswordResetLink(t.userId)
    const token = url.split('/').pop()!
    expect((await inspectResetToken(token)).valid).toBe(true)

    await consumeResetToken(token, 'NouveauMdp2026')
    const [user] = await sql`SELECT session_version, password_hash FROM users WHERE id = ${t.userId}`
    expect(user.session_version).toBe(1)
    expect(user.password_hash).not.toBe('x')

    await expect(consumeResetToken(token, 'AutreMdp2026')).rejects.toBeInstanceOf(AppError)
    expect((await inspectResetToken(token)).valid).toBe(false)
  })

  it('un nouveau lien invalide le précédent ; mot de passe faible refusé', async () => {
    const t = await createTenant()
    const first = (await createPasswordResetLink(t.userId)).url.split('/').pop()!
    const second = (await createPasswordResetLink(t.userId)).url.split('/').pop()!
    expect((await inspectResetToken(first)).valid).toBe(false)
    await expect(consumeResetToken(second, 'court')).rejects.toBeInstanceOf(AppError)
    expect((await inspectResetToken(second)).valid).toBe(true)
  })
})

describe('Numérotation plateforme', () => {
  it('numéros de reçus uniques et croissants', async () => {
    const a = await nextPlatformNumber('test_receipt', 'RC')
    const b = await nextPlatformNumber('test_receipt', 'RC')
    expect(Number(b.split('-')[1])).toBe(Number(a.split('-')[1]) + 1)
  })
})
