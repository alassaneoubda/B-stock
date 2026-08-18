import { sql } from '@/lib/db'

let ensured = false

/**
 * Anciennes bases Neon : `users` peut avoir `name` (NOT NULL, sans défaut)
 * et/ou `full_name`. L'app écrit `full_name` — sans défaut sur `name`, INSERT échoue.
 */
export async function ensureUsersFullNameColumn(): Promise<void> {
  if (ensured) return
  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)`
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)`
    await sql`
      UPDATE users
      SET full_name = COALESCE(NULLIF(btrim(full_name), ''), NULLIF(btrim(name), ''), split_part(email, '@', 1), 'Utilisateur')
      WHERE full_name IS NULL OR btrim(full_name) = ''
    `
    await sql`
      UPDATE users
      SET name = COALESCE(NULLIF(btrim(name), ''), NULLIF(btrim(full_name), ''), split_part(email, '@', 1), 'Utilisateur')
      WHERE name IS NULL OR btrim(name) = ''
    `
    await sql`ALTER TABLE users ALTER COLUMN name SET DEFAULT 'Utilisateur'`
    await sql`ALTER TABLE users ALTER COLUMN full_name SET DEFAULT 'Utilisateur'`
    await sql`ALTER TABLE users ALTER COLUMN name DROP NOT NULL`
    ensured = true
  } catch (e) {
    console.error('[schema] ensureUsersFullNameColumn failed:', e)
    ensured = false
    throw e
  }
}
