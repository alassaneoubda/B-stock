import type { Tx } from '../db'

/**
 * Idempotence des ventes envoyées depuis un appareil (ventes hors ligne).
 *
 * L'appareil génère une clé UUID par vente et la renvoie à chaque tentative.
 * - `claimSaleRequest` prend un verrou consultatif de transaction sur
 *   (entreprise, clé) : deux envois simultanés de la même vente sont sérialisés,
 *   le second voit la vente créée par le premier une fois celui-ci validé.
 * - L'index UNIQUE (company_id, client_request_id) (migration 036) reste la
 *   garantie ultime en base.
 *
 * Module serveur sans dépendance au domaine (évite les imports circulaires
 * sales ↔ pos).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isRequestId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/**
 * Verrouille la clé pour la transaction en cours et renvoie la vente déjà créée
 * avec cette clé (dans CETTE entreprise), ou null.
 */
export async function claimSaleRequest(
  tx: Tx,
  companyId: string,
  clientRequestId: string
): Promise<Record<string, unknown> | null> {
  await tx.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`sale-request:${companyId}:${clientRequestId.toLowerCase()}`}::text, 0))`
  const [existing] = await tx.sql`
    SELECT * FROM sales_orders
    WHERE company_id = ${companyId} AND client_request_id = ${clientRequestId}
  `
  return existing ?? null
}

/** Heure de vente sur l'appareil, bornée (pas dans le futur, 60 jours au plus). */
export function normalizeSoldAt(value: string | null | undefined, now = Date.now()): string | null {
  if (!value) return null
  const t = Date.parse(value)
  if (!Number.isFinite(t)) return null
  const clamped = Math.min(Math.max(t, now - 60 * 86_400_000), now)
  return new Date(clamped).toISOString()
}

/** Rattache la clé (et l'heure de vente sur l'appareil) à la vente créée. */
export async function attachSaleRequest(
  tx: Tx,
  orderId: string,
  clientRequestId: string,
  offlineSoldAt?: string | null
): Promise<void> {
  await tx.sql`
    UPDATE sales_orders
    SET client_request_id = ${clientRequestId}, offline_sold_at = ${normalizeSoldAt(offlineSoldAt)}
    WHERE id = ${orderId}
  `
}
