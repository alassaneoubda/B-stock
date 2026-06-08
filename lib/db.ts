import { neon, NeonQueryFunction } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

const rawSql = neon(process.env.DATABASE_URL)

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 500

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      const isNetworkError =
        error?.sourceError?.code === 'ETIMEDOUT' ||
        error?.sourceError?.message === 'fetch failed' ||
        error?.message?.includes('fetch failed') ||
        error?.message?.includes('ETIMEDOUT')

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

// Wrap the neon sql tagged template with retry logic
export const sql: NeonQueryFunction<false, false> = ((
  stringsOrQuery: TemplateStringsArray | string,
  ...values: any[]
) => {
  return withRetry(() => (rawSql as any)(stringsOrQuery, ...values))
}) as any

// Helper to execute queries with proper typing
export async function query<T>(
  queryText: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const result = await sql(queryText, ...values)
  return result as T[]
}

/**
 * Raw Neon tagged-template function.
 *
 * Use it to BUILD queries that will be passed to `transaction([...])`.
 * Unlike the retry-wrapped `sql`, queries built with `sqlRaw` are NOT
 * executed individually — they are collected and run atomically by
 * `transaction()`.
 */
export const sqlRaw = rawSql

/**
 * Execute an array of queries ATOMICALLY in a single HTTP transaction.
 * All statements commit together or roll back together.
 *
 * Build each statement with `sqlRaw`:
 *
 *   await transaction([
 *     sqlRaw`INSERT INTO ... VALUES (...)`,
 *     sqlRaw`UPDATE ... SET ...`,
 *   ])
 *
 * Because there are no intermediate reads inside the batch, pre-generate
 * any required IDs in JS (crypto.randomUUID()) instead of relying on
 * RETURNING between statements.
 */
export async function transaction<T = unknown>(
  queries: unknown[],
  options?: Record<string, unknown>
): Promise<T> {
  return withRetry(() => (rawSql as any).transaction(queries, options)) as Promise<T>
}

/**
 * Execute multiple SQL statements sequentially.
 * Since Neon HTTP driver doesn't support real transactions,
 * we execute statements in order and handle errors gracefully.
 * For critical multi-step operations, errors are caught and
 * the caller is responsible for compensating actions.
 */
export async function executeSequential(
  statements: Array<() => Promise<unknown>>
): Promise<void> {
  for (const statement of statements) {
    await statement()
  }
}
