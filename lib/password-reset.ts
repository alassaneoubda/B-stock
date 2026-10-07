import { createHash, randomBytes } from 'node:crypto'
import { hash } from 'bcryptjs'
import { sql, withTransaction } from './db'
import { AppError } from './errors'
import { appUrl, renderEmail, sendEmail } from './email'
import { passwordPolicyError } from './permissions'

/**
 * Réinitialisation de mot de passe par lien (utilisateurs des entreprises).
 * Le jeton en clair n'existe que dans le lien ; la base n'en garde que le hash.
 * Valable 60 minutes, utilisable une seule fois ; l'utilisation invalide toutes
 * les sessions de l'utilisateur.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

export async function createPasswordResetLink(
  userId: string,
  options: { adminId?: string | null } = {}
): Promise<{ url: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)
  // Un seul lien actif par utilisateur : les précédents sont invalidés
  await sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ${userId} AND used_at IS NULL`
  await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, created_by_admin, expires_at)
    VALUES (${userId}, ${sha256(token)}, ${options.adminId ?? null}, ${expiresAt.toISOString()})
  `
  return { url: appUrl(`/reset-password/${token}`), expiresAt }
}

/** Envoie le lien par email. Renvoie l'URL si l'email n'a pas pu partir (repli : copier le lien). */
export async function sendPasswordResetEmail(
  user: { id: string; email: string; full_name?: string | null },
  options: { adminId?: string | null } = {}
): Promise<{ emailed: boolean; url: string; expiresAt: Date }> {
  const { url, expiresAt } = await createPasswordResetLink(user.id, options)
  const { html, text } = renderEmail({
    title: 'Réinitialiser votre mot de passe',
    paragraphs: [
      `Bonjour${user.full_name ? ` ${user.full_name}` : ''},`,
      'Une réinitialisation du mot de passe de votre compte B-Stock a été demandée. Le lien ci-dessous est valable 60 minutes et ne peut servir qu’une fois.',
      'Si vous n’êtes pas à l’origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.',
    ],
    cta: { label: 'Choisir un nouveau mot de passe', url },
  })
  const result = await sendEmail({ to: user.email, subject: 'Réinitialisation de votre mot de passe B-Stock', html, text })
  return { emailed: result.sent, url, expiresAt }
}

/** Vérifie un jeton sans le consommer (affichage du formulaire). */
export async function inspectResetToken(token: string): Promise<{ valid: boolean; email?: string }> {
  const [row] = await sql`
    SELECT t.expires_at, t.used_at, u.email, u.is_active
    FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ${sha256(token)}
  `
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now() || !row.is_active) return { valid: false }
  return { valid: true, email: row.email }
}

export async function consumeResetToken(token: string, newPassword: string): Promise<void> {
  const policy = passwordPolicyError(newPassword)
  if (policy) throw new AppError(400, policy, 'WEAK_PASSWORD')
  const passwordHash = await hash(newPassword, 12)

  await withTransaction(async (tx) => {
    const [row] = await tx.sql`
      SELECT id, user_id, expires_at, used_at FROM password_reset_tokens
      WHERE token_hash = ${sha256(token)} FOR UPDATE
    `
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      throw new AppError(400, 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.', 'INVALID_TOKEN')
    }
    await tx.sql`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ${row.id}`
    const { rowCount } = await tx.exec`
      UPDATE users SET password_hash = ${passwordHash}, auth_provider = 'credentials',
             session_version = session_version + 1, updated_at = NOW()
      WHERE id = ${row.user_id} AND is_active = true
    `
    if (rowCount !== 1) throw new AppError(400, 'Ce compte est désactivé', 'ACCOUNT_DISABLED')
  })
}
