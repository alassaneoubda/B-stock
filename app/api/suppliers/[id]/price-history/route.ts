import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { supplierPriceHistory } from '@/lib/domain/supplier-statement'

// GET /api/suppliers/[id]/price-history — historique des prix d'achat par produit
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('suppliers.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { id } = await params
    if (!isUuid(id)) throw notFound('Fournisseur')

    const [supplier] = await sql`SELECT id FROM suppliers WHERE id = ${id} AND company_id = ${companyId}`
    if (!supplier) throw notFound('Fournisseur')

    const products = await supplierPriceHistory(sql, companyId, id)
    return NextResponse.json({ success: true, data: products })
  } catch (error) {
    return handleRouteError(error, 'suppliers.priceHistory')
  }
}
