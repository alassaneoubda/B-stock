// B-Stock — Exécuteur de migrations SQL
// Lance tous les fichiers scripts/*.sql dans l'ordre alphabétique sur DATABASE_URL.
//
// Usage :
//   npm run db:migrate
//   (ou)  node scripts/migrate.mjs
//
// La connexion est lue depuis .env.local (puis .env) à la racine du projet.

import pg from 'pg'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(scriptsDir, '..')

// --- Chargement des variables d'environnement (sans dépendance externe) ---
// .env.local a TOUJOURS priorité sur les variables déjà présentes dans le shell
// (évite qu'un vieux DATABASE_URL=host.neon.tech fantôme bloque la migration).
function loadEnv() {
  for (const name of ['.env', '.env.local']) {
    const path = join(projectRoot, name)
    if (!existsSync(path)) continue
    const content = readFileSync(path, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      // .env d'abord (faible), .env.local ensuite (écrase)
      process.env[key] = value
    }
  }
}

// --- Découpage d'un fichier SQL en instructions ---
// Gère : commentaires --, /* */, chaînes '...' (avec '' échappé).
// Hypothèse validée : aucun bloc $$ / fonction dans ces scripts.
function splitStatements(sqlText) {
  const statements = []
  let current = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i]
    const next = sqlText[i + 1]

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false
        current += ch
      }
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    if (inString) {
      current += ch
      if (ch === "'") {
        if (next === "'") {
          current += next
          i++
        } else {
          inString = false
        }
      }
      continue
    }

    if (ch === '-' && next === '-') {
      inLineComment = true
      i++
      continue
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }
    if (ch === "'") {
      inString = true
      current += ch
      continue
    }
    if (ch === ';') {
      const stmt = current.trim()
      if (stmt) statements.push(stmt)
      current = ''
      continue
    }
    current += ch
  }

  const last = current.trim()
  if (last) statements.push(last)
  return statements
}

async function main() {
  loadEnv()

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('✖ DATABASE_URL introuvable (.env.local).')
    process.exit(1)
  }

  const host = (() => {
    try {
      return new URL(url).host
    } catch {
      return '(inconnu)'
    }
  })()
  console.log(`Base cible : ${host}\n`)

  // TCP vers le pooler Neon (évite api.neon.tech / HTTP, souvent bloqué en entreprise)
  const connectionString = (() => {
    try {
      const u = new URL(url)
      u.searchParams.set('sslmode', 'require')
      u.searchParams.set('uselibpqcompat', 'true')
      u.searchParams.delete('channel_binding')
      return u.toString()
    } catch {
      return url
    }
  })()
  const pool = new pg.Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  })
  const sql = async (text, params = []) => {
    const res = await pool.query(text, params)
    return res.rows
  }

  try {
  // Suivi des migrations déjà appliquées (rejouable sans risque)
  await sql(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    )`
  )
  const appliedRows = await sql(`SELECT filename FROM schema_migrations`)
  const applied = new Set(appliedRows.map((r) => r.filename))

  const files = readdirSync(scriptsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  if (files.length === 0) {
    console.error('✖ Aucun fichier .sql trouvé dans scripts/.')
    process.exit(1)
  }

  const failures = []

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`• ${file} — déjà appliqué (ignoré)`)
      continue
    }

    const content = readFileSync(join(scriptsDir, file), 'utf8')
    const statements = splitStatements(content)
    process.stdout.write(`▶ ${file} — ${statements.length} instruction(s)... `)

    let ok = 0
    let fileFailed = false
    for (const stmt of statements) {
      try {
        await sql(stmt)
        ok++
      } catch (e) {
        fileFailed = true
        failures.push({ file, message: e.message, stmt: stmt.slice(0, 120) })
      }
    }
    console.log(`${ok}/${statements.length} OK`)

    if (!fileFailed) {
      await sql(`INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING`, [file])
    }
  }

  if (failures.length > 0) {
    console.log(`\n⚠ ${failures.length} instruction(s) en échec :`)
    for (const f of failures) {
      console.log(`  • [${f.file}] ${f.message}`)
      console.log(`    > ${f.stmt.replace(/\s+/g, ' ')}…`)
    }
    process.exit(1)
  }

  console.log('\n✔ Migrations terminées avec succès.')
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error('✖ Erreur fatale :', e)
  process.exit(1)
})
