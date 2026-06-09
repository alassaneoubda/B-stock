// B-Stock — Création / mise à jour d'un administrateur plateforme (super-admin)
//
// Usage :
//   npm run admin:create -- <email> <motdepasse> "<Nom complet>"
//   ex : npm run admin:create -- ops@bstock.ci "MotDePasseFort123!" "Djama Ops"
//
// Si l'email existe déjà, le mot de passe et le nom sont mis à jour.

import { neon } from '@neondatabase/serverless'
import bcrypt from 'bcryptjs'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(scriptsDir, '..')

for (const name of ['.env.local', '.env']) {
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
    if (!(k in process.env)) process.env[k] = v
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

const sql = neon(process.env.DATABASE_URL)
const hash = await bcrypt.hash(password, 10)

const rows = await sql`
  INSERT INTO platform_admins (email, full_name, password_hash, role, is_active)
  VALUES (${email.toLowerCase()}, ${fullName}, ${hash}, 'super_admin', true)
  ON CONFLICT (email) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        full_name = EXCLUDED.full_name,
        is_active = true,
        updated_at = NOW()
  RETURNING id, email, full_name, role
`

console.log('✔ Super-admin prêt :')
console.log(`  ${rows[0].full_name} <${rows[0].email}> (${rows[0].role})`)
console.log('\nConnexion : /admin/login')
