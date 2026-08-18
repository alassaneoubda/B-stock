import { sql } from '@/lib/db'

let ensured = false

/**
 * Certaines bases Neon ont été créées sans la colonne `companies.slug`.
 * L'inscription et OAuth en ont besoin.
 */
export async function ensureCompaniesSchema(): Promise<void> {
  if (ensured) return
  try {
    await sql`ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug VARCHAR(255)`

    await sql`
      UPDATE companies
      SET slug = lower(regexp_replace(coalesce(name, 'company'), '[^a-zA-Z0-9]+', '-', 'g'))
        || '-' || substr(replace(id::text, '-', ''), 1, 8)
      WHERE slug IS NULL OR btrim(slug) = ''
    `

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_slug ON companies(slug)
    `

    ensured = true
  } catch (e) {
    console.error('[schema] ensureCompaniesSchema failed:', e)
    ensured = false
    throw e
  }
}
