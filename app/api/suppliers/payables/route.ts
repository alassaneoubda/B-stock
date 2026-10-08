import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { listPayables, summarizePayables } from '@/lib/domain/payables'

const querySchema = z.object({
  // open = reste à payer (défaut) ; overdue = en retard ; due_soon = à échoir sous 7 jours ; paid ; all
  status: z.enum(['open', 'overdue', 'due_soon', 'unpaid', 'partial', 'paid', 'all']).default('open'),
  supplierId: z.string().uuid().optional(),
  q: z.string().trim().max(100).optional(),
})

// GET /api/suppliers/payables — tableau des dettes fournisseurs
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('suppliers.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const query = querySchema.parse({
      status: searchParams.get('status') || undefined,
      supplierId: searchParams.get('supplierId') || undefined,
      q: searchParams.get('q') || undefined,
    })

    const all = await listPayables(sql, companyId, { supplierId: query.supplierId ?? null })
    // Les indicateurs portent sur tout le périmètre (fournisseur éventuel), pas sur le filtre de statut.
    const summary = summarizePayables(all)

    const needle = query.q?.toLowerCase() ?? ''
    const rows = all.filter((r) => {
      if (needle && !`${r.order_number} ${r.supplier_name ?? ''}`.toLowerCase().includes(needle)) return false
      switch (query.status) {
        case 'open':
          return r.remaining > 0
        case 'overdue':
          return r.payment_status === 'overdue'
        case 'due_soon':
          return r.due_soon
        case 'unpaid':
        case 'partial':
        case 'paid':
          return r.payment_status === query.status
        default:
          return true
      }
    })

    // Dette par fournisseur (reste à payer), pour le classement
    const bySupplier = new Map<string, { supplier_id: string; supplier_name: string; remaining: number; overdue: number }>()
    for (const r of all) {
      if (r.remaining <= 0 || !r.supplier_id) continue
      const s = bySupplier.get(r.supplier_id) ?? {
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_name ?? 'Fournisseur',
        remaining: 0,
        overdue: 0,
      }
      s.remaining += r.remaining
      if (r.payment_status === 'overdue') s.overdue += r.remaining
      bySupplier.set(r.supplier_id, s)
    }
    const suppliers = [...bySupplier.values()]
      .map((s) => ({ ...s, remaining: Math.round(s.remaining * 100) / 100, overdue: Math.round(s.overdue * 100) / 100 }))
      .sort((a, b) => b.remaining - a.remaining)

    return NextResponse.json({ success: true, data: { summary, rows, suppliers } })
  } catch (error) {
    return handleRouteError(error, 'suppliers.payables')
  }
}
