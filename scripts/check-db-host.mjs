import { readFileSync, existsSync } from 'node:fs'

function hostOf(file) {
  if (!existsSync(file)) {
    console.log(`${file}: ABSENT`)
    return
  }
  const t = readFileSync(file, 'utf8')
  const m = t.match(/^DATABASE_URL=(.*)$/m)
  if (!m) {
    console.log(`${file}: pas de DATABASE_URL`)
    return
  }
  let v = m[1].trim()
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1)
  }
  try {
    const u = new URL(v)
    console.log(`${file}: HOST=${u.host}`)
  } catch {
    console.log(`${file}: URL invalide`)
  }
}

hostOf('.env.local')
hostOf('.env')
