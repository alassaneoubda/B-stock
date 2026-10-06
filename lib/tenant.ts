import { AppError } from './errors'

/**
 * Isolation multi-tenant : vérifie que chaque identifiant reçu du client
 * appartient bien à l'entreprise de la session AVANT toute écriture.
 *
 * Sans ce contrôle, un utilisateur pouvait passer le dépôt, le produit ou le
 * client d'une autre entreprise et modifier ses données.
 *
 *   await assertOwned(tx.sql, companyId, { depots: [depotId], variants: ids })
 */

type QueryFn = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>

type Id = string | null | undefined

export type OwnedRefs = {
  depots?: Id[]
  variants?: Id[]
  packagingTypes?: Id[]
  clients?: Id[]
  suppliers?: Id[]
  salesOrders?: Id[]
  purchaseOrders?: Id[]
  vehicles?: Id[]
  deliveryTours?: Id[]
  users?: Id[]
  agents?: Id[]
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const LABELS: Record<keyof OwnedRefs, string> = {
  depots: 'Dépôt',
  variants: 'Produit',
  packagingTypes: "Type d'emballage",
  clients: 'Client',
  suppliers: 'Fournisseur',
  salesOrders: 'Commande',
  purchaseOrders: 'Bon de commande',
  vehicles: 'Véhicule',
  deliveryTours: 'Tournée',
  users: 'Utilisateur',
  agents: 'Commercial',
}

function uniqueIds(ids: Id[] | undefined): string[] {
  if (!ids) return []
  return [...new Set(ids.filter((v): v is string => typeof v === 'string' && v.length > 0))]
}

async function ownedIds(q: QueryFn, kind: keyof OwnedRefs, companyId: string, ids: string[]) {
  switch (kind) {
    case 'depots':
      return q`SELECT id FROM depots WHERE company_id = ${companyId} AND id = ANY(${ids}::uuid[])`
    case 'variants':
      return q`
        SELECT pv.id FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE p.company_id = ${companyId} AND pv.id = ANY(${ids}::uuid[])`
    case 'packagingTypes':
      return q`SELECT id FROM packaging_types WHERE company_id = ${companyId} AND id = ANY(${ids}::uuid[])`
    case 'clients':
      return q`SELECT id FROM clients WHERE company_id = ${companyId} AND id = ANY(${ids}::uuid[])`
    case 'suppliers':
      return q`SELECT id FROM suppliers WHERE company_id = ${companyId} AND id = ANY(${ids}::uuid[])`
    case 'salesOrders':
      return q`SELECT id FROM sales_orders WHERE company_id = ${companyId} AND id = ANY(${ids}::uuid[])`
    case 'purchaseOrders':
      return q`SELECT id FROM purchase_orders WHERE company_id = ${companyId} AND id = ANY(${ids}::uuid[])`
    case 'vehicles':
      return q`SELECT id FROM vehicles WHERE company_id = ${companyId} AND id = ANY(${ids}::uuid[])`
    case 'deliveryTours':
      return q`SELECT id FROM delivery_tours WHERE company_id = ${companyId} AND id = ANY(${ids}::uuid[])`
    case 'users':
      return q`SELECT id FROM users WHERE company_id = ${companyId} AND id = ANY(${ids}::uuid[])`
    case 'agents':
      return q`SELECT id FROM sales_agents WHERE company_id = ${companyId} AND id = ANY(${ids}::uuid[])`
  }
}

/**
 * Lève une AppError 404 si un identifiant n'existe pas dans l'entreprise
 * (même message qu'un élément inexistant : on ne révèle rien des autres tenants).
 */
export async function assertOwned(q: QueryFn, companyId: string, refs: OwnedRefs): Promise<void> {
  for (const kind of Object.keys(refs) as (keyof OwnedRefs)[]) {
    const ids = uniqueIds(refs[kind])
    if (ids.length === 0) continue

    if (ids.some((id) => !UUID_RE.test(id))) {
      throw new AppError(400, `${LABELS[kind]} : identifiant invalide`, 'INVALID_ID')
    }

    const rows = await ownedIds(q, kind, companyId, ids)
    if (rows.length !== ids.length) {
      throw new AppError(404, `${LABELS[kind]} introuvable`, 'NOT_FOUND')
    }
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}
