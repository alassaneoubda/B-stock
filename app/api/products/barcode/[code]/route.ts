import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission, roleHasPermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, badRequest, conflict, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { barcodeCandidates, normalizeBarcode } from '@/components/scan/barcode-format'
import { catalogPriceTtc, loadVatSettings } from '@/lib/vat'

type Params = { params: Promise<{ code: string }> }

export type BarcodeMatch = {
  variant_id: string
  product_id: string
  product_name: string
  brand: string | null
  category: string | null
  barcode: string
  price: number
  cost_price: number | null
  packaging_name: string | null
  units_per_case: number | null
  is_active: boolean
  /** Stock du dépôt demandé (?depotId=), sinon null. */
  stock: number | null
}

/** Segment d'URL → code nettoyé (Next transmet parfois le segment encore encodé). */
async function readCode(params: Params['params']): Promise<string> {
  let raw = (await params).code ?? ''
  if (/%[0-9a-f]{2}/i.test(raw)) {
    try {
      raw = decodeURIComponent(raw)
    } catch {
      /* segment invalide : gardé tel quel */
    }
  }
  const code = normalizeBarcode(raw)
  if (!code) throw badRequest('Code-barres invalide')
  return code
}

async function findByBarcode(companyId: string, code: string, depotId: string | null) {
  const candidates = barcodeCandidates(code)
  const rows = await sql`
    SELECT pv.id AS variant_id, p.id AS product_id, p.name AS product_name, p.brand, p.category,
           pv.barcode, pv.price::float AS price, pv.cost_price::float AS cost_price,
           pt.name AS packaging_name, pt.units_per_case, p.is_active,
           to_jsonb(p) ->> 'vat_rate' AS vat_rate,
           CASE WHEN ${depotId}::uuid IS NULL THEN NULL ELSE (
             SELECT COALESCE(SUM(s.quantity), 0)::float
             FROM stock s JOIN depots d ON d.id = s.depot_id
             WHERE s.product_variant_id = pv.id AND s.depot_id = ${depotId}::uuid AND d.company_id = ${companyId}
           ) END AS stock
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
    WHERE p.company_id = ${companyId}
      AND pv.barcode = ANY(${candidates}::text[])
    ORDER BY p.is_active DESC, (pv.barcode = ${code}) DESC, p.name, pt.name
    LIMIT 10
  `
  // Prix de vente TTC (converti si l'entreprise saisit ses prix HT)
  const vat = await loadVatSettings(sql, companyId)
  if (vat.enabled && !vat.pricesIncludeTax) {
    for (const r of rows) r.price = catalogPriceTtc(vat, Number(r.price), r.vat_rate)
  }
  return rows as BarcodeMatch[]
}

// GET /api/products/barcode/[code] — Variante de l'entreprise portant ce code-barres
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const authz = await requirePermission('products.read')
    if (!authz.ok) return authz.response
    const { companyId, role } = authz

    const code = await readCode(params)
    const depotParam = new URL(request.url).searchParams.get('depotId')
    const depotId = depotParam && isUuid(depotParam) ? depotParam : null

    const matches = await findByBarcode(companyId, code, depotId)
    if (matches.length === 0) {
      const canAssign = await roleHasPermission(role, 'products.write').catch(() => false)
      throw new AppError(404, `Code-barres inconnu : ${code}`, 'BARCODE_UNKNOWN', { code, canAssign })
    }

    // Produit masqué : on le signale plutôt que de l'ajouter silencieusement
    const active = matches.filter((m) => m.is_active)
    return NextResponse.json({
      success: true,
      data: active[0] ?? matches[0],
      matches,
      ...(active.length > 1 ? { warning: 'Plusieurs produits portent ce code-barres : le premier a été retenu.' } : {}),
    })
  } catch (error) {
    return handleRouteError(error, 'products.barcode.get')
  }
}

const assignSchema = z.object({ variantId: z.string().uuid('Variante invalide') })

// POST /api/products/barcode/[code] — Associe ce code-barres à une variante de l'entreprise
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const authz = await requirePermission('products.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const code = await readCode(params)
    const { variantId } = assignSchema.parse(await request.json())

    await withTransaction(async (tx) => {
      // Sérialise les associations concurrentes d'un même code dans l'entreprise
      await tx.sql`SELECT pg_advisory_xact_lock(hashtext(${`${companyId}:barcode:${code}`}))`

      const [variant] = await tx.sql`
        SELECT pv.id FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id = ${variantId} AND p.company_id = ${companyId}
        FOR UPDATE OF pv
      `
      if (!variant) throw notFound('Variante')

      const [taken] = await tx.sql`
        SELECT p.name, pt.name AS packaging_name
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        LEFT JOIN packaging_types pt ON pt.id = pv.packaging_type_id
        WHERE p.company_id = ${companyId}
          AND pv.barcode = ANY(${barcodeCandidates(code)}::text[])
          AND pv.id <> ${variantId}
        LIMIT 1
      `
      if (taken) {
        const label = taken.packaging_name ? `${taken.name} (${taken.packaging_name})` : taken.name
        throw conflict(`Ce code-barres est déjà associé à « ${label} ».`, 'BARCODE_TAKEN')
      }

      await tx.exec`UPDATE product_variants SET barcode = ${code} WHERE id = ${variantId}`
    })

    const [match] = await findByBarcode(companyId, code, null)
    return NextResponse.json({ success: true, data: match, message: 'Code-barres associé' })
  } catch (error) {
    return handleRouteError(error, 'products.barcode.assign')
  }
}

// DELETE /api/products/barcode/[code]?variantId=… — Retire ce code-barres d'une variante
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const authz = await requirePermission('products.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const code = await readCode(params)
    const variantId = new URL(request.url).searchParams.get('variantId')
    if (!variantId || !isUuid(variantId)) throw badRequest('Variante invalide')

    const rows = await sql`
      UPDATE product_variants pv SET barcode = NULL
      FROM products p
      WHERE pv.product_id = p.id AND p.company_id = ${companyId}
        AND pv.id = ${variantId} AND pv.barcode = ${code}
      RETURNING pv.id
    `
    if (rows.length === 0) throw notFound('Code-barres')
    return NextResponse.json({ success: true, message: 'Code-barres retiré' })
  } catch (error) {
    return handleRouteError(error, 'products.barcode.remove')
  }
}
