// B-Stock — Création / mise à jour d'un administrateur plateforme (super-admin)
//
// Usage :
//   npm run admin:create -- <email> <motdepasse> "<Nom complet>"
//   ex : npm run admin:create -- ops@bstock.ci "MotDePasseFort123!" "Djama Ops"
//
// Si l'email existe déjà, le mot de passe et le nom sont mis à jour.

import pg from 'pg'
import bcrypt from 'bcryptjs'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(scriptsDir, '..')

for (const name of ['.env', '.env.local']) {
  const p = join(projectRoot, name)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[k] = v
  }
}

const [email, password, ...nameParts] = process.argv.slice(2)
const fullName = nameParts.join(' ').trim()

if (!email || !password || !fullName) {
  console.error('Usage : npm run admin:create -- <email> <motdepasse> "<Nom complet>"')
  process.exit(1)
}
if (password.length < 8) {
  console.error('✖ Le mot de passe doit faire au moins 8 caractères.')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('✖ DATABASE_URL manquant dans .env.local')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: (() => {
    const url = process.env.DATABASE_URL
    try {
      const u = new URL(url)
      u.searchParams.set('sslmode', 'require')
      u.searchParams.set('uselibpqcompat', 'true')
      u.searchParams.delete('channel_binding')
      return u.toString()
    } catch {
      return url
    }
  })(),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
})

try {
  const hash = await bcrypt.hash(password, 10)
  const res = await pool.query(
    `INSERT INTO platform_admins (email, full_name, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'super_admin', true)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           is_active = true,
           updated_at = NOW()
     RETURNING id, email, full_name, role`,
    [email.toLowerCase(), fullName, hash]
  )
  const row = res.rows[0]
  console.log('✔ Super-admin prêt :')
  console.log(`  ${row.full_name} <${row.email}> (${row.role})`)
  console.log('\nConnexion : /admin/login')
} finally {
  await pool.end()
}
