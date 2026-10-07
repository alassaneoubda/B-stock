import { randomUUID } from 'node:crypto'
import { sql } from '@/lib/db'

/** Crée une entreprise de test isolée avec un owner, un dépôt et un client. */
export async function createTenant(name = 'Test') {
  const companyId = randomUUID()
  const suffix = companyId.slice(0, 8)
  await sql`
    INSERT INTO companies (id, name, slug, subscription_status, trial_ends_at)
    VALUES (${companyId}, ${`${name} ${suffix}`}, ${`t-${suffix}`}, 'trialing', NOW() + INTERVAL '30 days')
  `
  const [owner] = await sql`
    INSERT INTO users (company_id, email, password_hash, full_name, name, role)
    VALUES (${companyId}, ${`owner-${suffix}@test.local`}, 'x', 'Owner', 'Owner', 'owner')
    RETURNING id
  `
  const [depot] = await sql`
    INSERT INTO depots (company_id, name, is_main) VALUES (${companyId}, 'Dépôt', true) RETURNING id
  `
  const [client] = await sql`
    INSERT INTO clients (company_id, name, credit_limit) VALUES (${companyId}, 'Maquis Test', 0) RETURNING id
  `
  return { companyId, userId: owner.id as string, depotId: depot.id as string, clientId: client.id as string }
}

/** Crée un produit + une variante, avec du stock éventuel par lot. */
export async function createProduct(
  companyId: string,
  depotId: string,
  opts: { price?: number; lots?: { lot: string | null; qty: number; expiry?: string }[] } = {}
) {
  const [product] = await sql`
    INSERT INTO products (company_id, name, selling_price) VALUES (${companyId}, 'Bière 65cl', ${opts.price ?? 500})
    RETURNING id
  `
  const [variant] = await sql`
    INSERT INTO product_variants (product_id, price) VALUES (${product.id}, ${opts.price ?? 500}) RETURNING id
  `
  for (const l of opts.lots ?? []) {
    await sql`
      INSERT INTO stock (depot_id, product_variant_id, lot_number, quantity, expiry_date)
      VALUES (${depotId}, ${variant.id}, ${l.lot}, ${l.qty}, ${l.expiry ?? null})
    `
  }
  return { productId: product.id as string, variantId: variant.id as string }
}

export async function stockOf(depotId: string, variantId: string): Promise<number> {
  const [row] = await sql`
    SELECT COALESCE(SUM(quantity), 0)::int AS q FROM stock
    WHERE depot_id = ${depotId} AND product_variant_id = ${variantId}
  `
  return row.q
}

export async function balanceOf(clientId: string, type: 'product' | 'packaging'): Promise<number> {
  const [row] = await sql`
    SELECT COALESCE(SUM(balance), 0)::float AS b FROM client_accounts
    WHERE client_id = ${clientId} AND account_type = ${type}
  `
  return row.b
}
