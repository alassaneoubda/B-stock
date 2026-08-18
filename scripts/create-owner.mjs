import pg from 'pg'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
for (const name of ['.env', '.env.local']) {
  const p = join(root, name)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[t.slice(0, eq).trim()] = v
  }
}

const email = process.argv[2]
const password = process.argv[3]
const fullName = process.argv[4]
const companyName = process.argv[5]
const phone = process.argv[6] || null

if (!email || !password || !fullName || !companyName) {
  console.error('Usage: node scripts/create-owner.mjs <email> <password> "<Nom>" "<Entreprise>" [telephone]')
  process.exit(1)
}

const raw = process.env.DATABASE_URL
const u = new URL(raw)
u.searchParams.set('sslmode', 'require')
u.searchParams.set('uselibpqcompat', 'true')
u.searchParams.delete('channel_binding')
const pool = new pg.Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } })

const client = await pool.connect()
try {
  console.log('DB host:', new URL(raw).host)
  const existing = await client.query('SELECT id, email FROM users WHERE lower(email) = lower($1)', [
    email,
  ])
  const hash = await bcrypt.hash(password, 12)

  if (existing.rows[0]) {
    await client.query(
      `UPDATE users
       SET password_hash = $1,
           name = COALESCE(NULLIF(btrim(name), ''), $2),
           full_name = COALESCE(NULLIF(btrim(full_name), ''), $2),
           is_active = true
       WHERE id = $3`,
      [hash, fullName, existing.rows[0].id]
    )
    console.log('✔ Mot de passe mis à jour pour', existing.rows[0].email)
  } else {
    const companyId = randomUUID()
    const slug =
      companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') +
      '-' +
      Date.now().toString(36)
    const trial = new Date()
    trial.setDate(trial.getDate() + 30)

    await client.query('BEGIN')
    await client.query(
      `INSERT INTO companies (id, name, slug, email, phone, subscription_status, trial_ends_at)
       VALUES ($1,$2,$3,$4,$5,'trialing',$6)`,
      [companyId, companyName, slug, email.toLowerCase(), phone, trial.toISOString()]
    )
    await client.query(
      `INSERT INTO users (company_id, email, password_hash, name, full_name, phone, role)
       VALUES ($1,$2,$3,$4,$4,$5,'owner')`,
      [companyId, email.toLowerCase(), hash, fullName, phone]
    )
    await client.query(`INSERT INTO depots (company_id, name, is_main) VALUES ($1,'Depot Principal', true)`, [
      companyId,
    ])
    await client.query('COMMIT')
    console.log('✔ Compte créé :', email.toLowerCase(), '/', companyName)
  }
} catch (e) {
  try {
    await client.query('ROLLBACK')
  } catch {
    /* ignore */
  }
  console.error(e)
  process.exit(1)
} finally {
  client.release()
  await pool.end()
}
