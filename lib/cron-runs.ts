import { sql } from './db'

/**
 * Exécute une tâche planifiée en traçant son résultat dans `cron_runs`
 * (affiché sur la page « Santé de la plateforme » du back-office).
 */
export async function runCronJob<T extends Record<string, unknown>>(job: string, fn: () => Promise<T>): Promise<T> {
  const [run] = await sql`INSERT INTO cron_runs (job, status) VALUES (${job}, 'running') RETURNING id`
  try {
    const summary = await fn()
    await sql`
      UPDATE cron_runs SET status = 'success', summary = ${JSON.stringify(summary)}::jsonb, finished_at = NOW()
      WHERE id = ${run.id}
    `
    return summary
  } catch (e) {
    await sql`
      UPDATE cron_runs SET status = 'failed', error = ${e instanceof Error ? e.message : String(e)}, finished_at = NOW()
      WHERE id = ${run.id}
    `
    throw e
  }
}

/** Numérotation des documents de la plateforme (reçus d'abonnement : RC-000001). */
export async function nextPlatformNumber(key: string, prefix: string, digits = 6): Promise<string> {
  const [row] = await sql`
    INSERT INTO platform_sequences (key, last_value) VALUES (${key}, 1)
    ON CONFLICT (key) DO UPDATE SET last_value = platform_sequences.last_value + 1
    RETURNING last_value
  `
  return `${prefix}-${String(row.last_value).padStart(digits, '0')}`
}
