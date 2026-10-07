// B-Stock — remplace les couleurs Tailwind codées en dur par les tokens de la charte.
// Usage : node scripts/design-tokens-codemod.mjs <dossier> [<dossier>…]
// Ne modifie que des classes (préfixes de variantes conservés : hover:, md:…).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const NEUTRALS = 'zinc|slate|gray|neutral|stone'

function neutral(prop, shade, opacity) {
  const n = Number(shade)
  if (prop === 'text') {
    if (n >= 800) return 'text-foreground'
    if (n === 700) return 'text-foreground/80'
    if (n >= 500) return 'text-muted-foreground'
    return 'text-muted-foreground/70'
  }
  if (prop === 'bg') {
    if (n >= 800) return `bg-primary${opacity ?? ''}`
    if (n === 50) return opacity ? 'bg-muted/30' : 'bg-muted/50'
    if (n <= 200) return `bg-muted${opacity ?? ''}`
    return `bg-muted-foreground/20`
  }
  if (prop === 'border' || prop === 'divide') return `${prop}-border`
  if (prop === 'ring') return 'ring-border'
  return null
}

const ACCENTS = {
  blue: 'brand', indigo: 'info', violet: 'info', purple: 'info', sky: 'info', cyan: 'info',
  emerald: 'success', green: 'success', teal: 'success',
  red: 'destructive', rose: 'destructive',
  amber: 'warning', yellow: 'warning',
}

function accent(prop, family, shade, opacity) {
  const role = ACCENTS[family]
  if (!role) return null
  const n = Number(shade)
  if (role === 'brand') {
    if (prop === 'bg') return n >= 500 ? `bg-primary${opacity ?? ''}` : 'bg-brand-soft'
    if (prop === 'text') return n >= 500 ? 'text-brand-strong' : 'text-brand-strong/70'
    if (prop === 'border' || prop === 'ring') return `${prop}-brand/40`
    return null
  }
  const soft = { info: 'bg-info-soft', success: 'bg-success-soft', warning: 'bg-warning-soft', destructive: 'bg-destructive/10' }[role]
  const strong = { info: 'text-info', success: 'text-success', warning: 'text-warning-foreground', destructive: 'text-destructive' }[role]
  if (prop === 'bg') return n <= 200 ? soft : `bg-${role === 'warning' ? 'warning' : role}${opacity ?? ''}`
  if (prop === 'text') return n >= 400 ? strong : `${strong}/70`
  if (prop === 'border' || prop === 'ring') return `${prop}-${role === 'warning' ? 'warning' : role}/30`
  return null
}

const CLASS_RE = new RegExp(
  `(?<=^|[\\s"'\`{(])((?:[a-z0-9-]+:)*)(text|bg|border|divide|ring)-(${NEUTRALS}|blue|indigo|violet|purple|sky|cyan|emerald|green|teal|red|rose|amber|yellow)-(\\d{2,3})(\\/\\d{1,3})?(?=$|[\\s"'\`})])`,
  'g'
)

function transform(src) {
  let count = 0
  let out = src.replace(CLASS_RE, (match, variants, prop, family, shade, opacity) => {
    const repl = new RegExp(`^(${NEUTRALS})$`).test(family)
      ? neutral(prop, shade, opacity)
      : accent(prop, family, shade, opacity)
    if (!repl) return match
    count++
    return variants + repl
  })
  // Fond blanc → carte ; rayons « bulle » → rayon de la charte
  out = out.replace(/(?<=[\s"'`{(:])bg-white(?=[\s"'`}/])/g, () => (count++, 'bg-card'))
  out = out.replace(/(?<=[\s"'`{(:])rounded-(\[2rem\]|\[1\.75rem\]|\[1\.5rem\]|3xl|2xl)(?=[\s"'`}])/g, () => (count++, 'rounded-xl'))
  out = out.replace(/(?<=[\s"'`{(:])tracking-tighter(?=[\s"'`}])/g, () => (count++, 'tracking-tight'))
  return { out, count }
}

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, files)
    else if (path.endsWith('.tsx')) files.push(path)
  }
  return files
}

let total = 0
for (const dir of process.argv.slice(2)) {
  for (const file of walk(dir)) {
    const src = readFileSync(file, 'utf8')
    const { out, count } = transform(src)
    if (count > 0) {
      writeFileSync(file, out)
      total += count
      console.log(`${String(count).padStart(4)}  ${file}`)
    }
  }
}
console.log(`\n${total} classes remplacées`)
