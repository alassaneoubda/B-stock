import { NextResponse } from 'next/server'

type Row = Record<string, unknown>

/** Échappe une valeur pour un champ CSV (RFC 4180). */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/[",\n\r;]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/**
 * Sérialise des lignes en CSV. `columns` définit l'ordre et les en-têtes
 * ({ key, label }). Si absent, les clés de la première ligne sont utilisées.
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

/** Construit une réponse HTTP de téléchargement CSV. */
export function csvResponse(filename: string, csv: string): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
