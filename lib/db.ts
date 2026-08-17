import { Pool, type QueryResultRow } from 'pg'
import { normalizeDatabaseUrl } from './db-url'

/**
 * Accès PostgreSQL via TCP (`pg`) vers le pooler Neon.
 *
 * Pourquoi pas le driver HTTP Neon (`neon()` → api.neon.tech) ?
 * Sur certains réseaux d'entreprise le DNS de api.neon.tech échoue
 * (ENOTFOUND), alors que l'hôte pooler `ep-….neon.tech` résout correctement.
 */

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

const pool = new Pool({
  connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
})

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 500

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      const isNetworkError =
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ENOTFOUND' ||
        error?.message?.includes('fetch failed') ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('ECONNRESET')

      if (isNetworkError && attempt < MAX_RETRIES) {
        console.warn(`[DB] Retry ${attempt}/${MAX_RETRIES} after network error`)
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt))
        continue
      }
      throw error
    }
  }
  throw new Error('Unreachable')
}

export type SqlQuery = { text: string; params: unknown[] }

function buildQuery(strings: TemplateStringsArray, values: unknown[]): SqlQuery {
  let text = ''
  const params: unknown[] = []
  for (let i = 0; i < strings.length; i++) {
    text += strings[i]
    if (i < values.length) {
      params.push(values[i])
      text += `$${params.length}`
    }
  }
  return { text, params }
}

type SqlTagged = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<QueryResultRow[]>
}

/** Requête paramétrée (tagged template) — retourne les lignes. */
export const sql: SqlTagged = ((strings: TemplateStringsArray, ...values: unknown[]) => {
  const { text, params } = buildQuery(strings, values)
  return withRetry(async () => {
    const result = await pool.query(text, params)
    return result.rows
  })
}) as SqlTagged

export async function query<T extends QueryResultRow = QueryResultRow>(
  queryText: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const result = await sql(queryText, ...values)
  return result as T[]
}

/**
 * Construit une requête sans l'exécuter — à passer à `transaction([...])`.
 */
export function sqlRaw(strings: TemplateStringsArray, ...values: unknown[]): SqlQuery {
  return buildQuery(strings, values)
}

/**
 * Exécute un lot de requêtes dans une vraie transaction PostgreSQL (BEGIN/COMMIT).
 */
export async function transaction<T = unknown>(
  queries: SqlQuery[],
  _options?: Record<string, unknown>
): Promise<T> {
  return withRetry(async () => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const results: QueryResultRow[][] = []
      for (const q of queries) {
        const res = await client.query(q.text, q.params)
        results.push(res.rows)
      }
      await client.query('COMMIT')
      return results as T
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw e
    } finally {
      client.release()
    }
  })
}

export async function executeSequential(
  statements: Array<() => Promise<unknown>>
): Promise<void> {
  for (const statement of statements) {
    await statement()
  }
}

export { pool }
