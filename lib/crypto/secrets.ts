import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { AppError } from '../errors'

/**
 * Chiffrement au repos des secrets des entreprises (identifiants de paiement).
 *
 * - AES-256-GCM (confidentialité + intégrité), IV aléatoire de 12 octets.
 * - Clé : PAYMENT_CREDENTIALS_KEY = 32 octets encodés en base64
 *   (générer : `openssl rand -base64 32`).
 * - « Contexte » (AAD) : lie le chiffré à son propriétaire (ex. id d'entreprise).
 *   Un chiffré recopié sur une autre entreprise ne se déchiffre pas.
 * - Format stocké : `v1.<iv>.<tag>.<chiffré>` (base64url).
 *
 * Sans clé valide, la fonctionnalité est refusée proprement (503), jamais
 * dégradée en stockage en clair.
 */

const VERSION = 'v1'
const ALGO = 'aes-256-gcm'

export class CredentialsKeyMissingError extends AppError {
  constructor() {
    super(
      503,
      'Paiements Mobile Money indisponibles : la clé de chiffrement du serveur (PAYMENT_CREDENTIALS_KEY) n’est pas configurée.',
      'PAYMENT_KEY_MISSING'
    )
  }
}

function readKey(): Buffer | null {
  const raw = process.env.PAYMENT_CREDENTIALS_KEY?.trim()
  if (!raw) return null
  try {
    const key = Buffer.from(raw, 'base64')
    return key.length === 32 ? key : null
  } catch {
    return null
  }
}

/** Vrai si une clé de 32 octets valide est configurée. */
export function isSecretsKeyConfigured(): boolean {
  return readKey() !== null
}

function requireKey(): Buffer {
  const key = readKey()
  if (!key) throw new CredentialsKeyMissingError()
  return key
}

export function encryptSecret(plain: string, context: string): string {
  const key = requireKey()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  cipher.setAAD(Buffer.from(context, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptSecret(payload: string, context: string): string {
  const key = requireKey()
  const parts = payload.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Secret chiffré illisible (format inconnu)')
  }
  const [, ivB64, tagB64, dataB64] = parts
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64url'))
  decipher.setAAD(Buffer.from(context, 'utf8'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8')
}

/** Quatre derniers caractères, pour l'affichage « configuré ••••1234 ». */
export function lastFour(secret: string): string {
  return secret.slice(-4)
}
