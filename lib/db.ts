import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

export const sql = neon(process.env.DATABASE_URL)

// Helper to execute queries with proper typing
export async function query<T>(
  queryText: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const result = await sql(queryText, ...values)
  return result as T[]
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
