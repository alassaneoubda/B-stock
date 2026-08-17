import { sql } from '@/lib/db'

let ensured = false

/**
 * Anciennes bases Neon peuvent avoir une table `users` sans `full_name`
 * (CREATE TABLE IF NOT EXISTS n'ajoute pas les colonnes manquantes).
 */
export async function ensureUsersFullNameColumn(): Promise<void> {
  if (ensured) return
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)`
    await sql`
      UPDATE users
      SET full_name = split_part(email, '@', 1)
      WHERE full_name IS NULL OR btrim(full_name) = ''
    `
    ensured = true
  } catch (e) {
    console.error('[schema] ensureUsersFullNameColumn failed:', e)
    // Ne pas bloquer définitivement : réessayer au prochain appel
    ensured = false
    throw e
  }
}
