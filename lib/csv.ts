import { NextResponse } from 'next/server'

type Row = Record<string, unknown>

/** Nombre « pur » : ne peut pas être interprété comme une formule. */
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

/** Caractères qui font interpréter une cellule comme formule par Excel / LibreOffice / Sheets. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/

/**
 * Échappe une valeur pour un champ CSV (RFC 4180) et neutralise l'injection
 * de formules (CSV injection) : une cellule commençant par = + - @ tabulation
 * ou retour chariot est préfixée d'une apostrophe. Les nombres purs
 * (ex. « -1500.50 ») restent intacts.
 */
export function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (FORMULA_TRIGGER.test(s) && !PLAIN_NUMBER.test(s)) {
    s = `'${s}`
  }
  if (/[",\n\r;\t]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/**
 * Sérialise des lignes en CSV. `columns` définit l'ordre et les en-têtes
 * ({ key, label }). Si absent, les clés de la première ligne sont utilisées.
 * Toutes les cellules (en-têtes compris) passent par `escapeCell`.
 */
export function toCSV(
  rows: Row[],
  columns?: { key: string; label: string }[]
): string {
  const cols =
    columns ??
    (rows[0] ? Object.keys(rows[0]).map((k) => ({ key: k, label: k })) : [])
  const header = cols.map((c) => escapeCell(c.label)).join(',')
  const body = rows
    .map((row) => cols.map((c) => escapeCell(row[c.key])).join(','))
    .join('\r\n')
  // BOM pour qu'Excel ouvre l'UTF-8 correctement
  return '\uFEFF' + header + '\r\n' + body
}

/** Nom de fichier sûr pour Content-Disposition (ASCII lettres/chiffres/-/_/.). */
function safeFilename(filename: string): string {
  const cleaned = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 120)
  return cleaned || 'export.csv'
}

/** Construit une réponse HTTP de téléchargement CSV. */
export function csvResponse(filename: string, csv: string): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${safeFilename(filename)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  })
}
