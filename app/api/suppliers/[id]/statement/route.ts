import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { buildSupplierStatement } from '@/lib/domain/supplier-statement'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)')

// GET /api/suppliers/[id]/statement?from=&to= — solde dû, relevé chronologique, échéances
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('suppliers.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { id } = await params
    if (!isUuid(id)) throw notFound('Fournisseur')

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') ? isoDate.parse(searchParams.get('from')) : null
    const to = searchParams.get('to') ? isoDate.parse(searchParams.get('to')) : null

    const [supplier] = await sql`
      SELECT id, name, payment_terms_days FROM suppliers WHERE id = ${id} AND company_id = ${companyId}
    `
    if (!supplier) throw notFound('Fournisseur')

    const statement = await buildSupplierStatement(sql, companyId, id, { from, to })
    return NextResponse.json({ success: true, data: { supplier, ...statement } })
  } catch (error) {
    return handleRouteError(error, 'suppliers.statement')
  }
}
