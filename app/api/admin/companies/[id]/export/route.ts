import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'

export const dynamic = 'force-dynamic'

/** Nom de fichier sûr (ASCII, sans séparateurs) pour l'en-tête Content-Disposition. */
function safeFilename(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .toLowerCase()
  return base || 'entreprise'
}

/**
 * GET /api/admin/companies/:id/export — Export complet des données d'une entreprise (JSON).
 * Les secrets (mots de passe, versions de session) ne sont JAMAIS exportés.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireAdmin('companies.delete')
  if (!authz.ok) return authz.response

  try {
    const { id } = await params
    const [company] = await sql`SELECT * FROM companies WHERE id = ${id}`
    if (!company) throw notFound('Entreprise')

    const [users, depots, products, variants, clients, stock, salesOrders, salesOrderItems, creditNotes, payments, invoices, invoiceItems] =
      await Promise.all([
        // Liste explicite : ni password_hash, ni session_version, ni secret 2FA
        sql`
          SELECT id, email, full_name, name, role, phone, permissions, is_active, auth_provider,
                 last_login_at, created_at, updated_at
          FROM users WHERE company_id = ${id} ORDER BY created_at
        `,
        sql`SELECT * FROM depots WHERE company_id = ${id} ORDER BY created_at`,
        sql`SELECT * FROM products WHERE company_id = ${id} ORDER BY created_at`,
        sql`
          SELECT v.* FROM product_variants v JOIN products p ON p.id = v.product_id
          WHERE p.company_id = ${id} ORDER BY v.created_at
        `,
        sql`SELECT * FROM clients WHERE company_id = ${id} ORDER BY created_at`,
        sql`
          SELECT s.* FROM stock s JOIN depots d ON d.id = s.depot_id
          WHERE d.company_id = ${id} ORDER BY s.created_at
        `,
        sql`SELECT * FROM sales_orders WHERE company_id = ${id} ORDER BY created_at`,
        sql`
          SELECT i.* FROM sales_order_items i JOIN sales_orders o ON o.id = i.sales_order_id
          WHERE o.company_id = ${id} ORDER BY i.created_at
        `,
        sql`SELECT * FROM credit_notes WHERE company_id = ${id} ORDER BY created_at`,
        sql`SELECT * FROM payments WHERE company_id = ${id} ORDER BY created_at`,
        sql`SELECT * FROM invoices WHERE company_id = ${id} ORDER BY created_at`,
        sql`
          SELECT ii.* FROM invoice_items ii JOIN invoices inv ON inv.id = ii.invoice_id
          WHERE inv.company_id = ${id} ORDER BY ii.created_at
        `,
      ])

    // Rattache les lignes à leur document parent
    const itemsByOrder = new Map<string, unknown[]>()
    for (const item of salesOrderItems) {
      const list = itemsByOrder.get(item.sales_order_id) ?? []
      list.push(item)
      itemsByOrder.set(item.sales_order_id, list)
    }
    const variantsByProduct = new Map<string, unknown[]>()
    for (const v of variants) {
      const list = variantsByProduct.get(v.product_id) ?? []
      list.push(v)
      variantsByProduct.set(v.product_id, list)
    }
    const itemsByInvoice = new Map<string, unknown[]>()
    for (const item of invoiceItems) {
      const list = itemsByInvoice.get(item.invoice_id) ?? []
      list.push(item)
      itemsByInvoice.set(item.invoice_id, list)
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: authz.adminEmail,
      format: 'b-stock-company-export/v1',
      company,
      users,
      depots,
      products: products.map((p) => ({ ...p, variants: variantsByProduct.get(p.id) ?? [] })),
      clients,
      stock,
      sales_orders: salesOrders.map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] })),
      credit_notes: creditNotes,
      payments,
      invoices: invoices.map((inv) => ({ ...inv, items: itemsByInvoice.get(inv.id) ?? [] })),
    }

    await logAdminAction(authz.adminId, authz.adminEmail, 'company.export', 'company', id, {
      name: company.name,
      counts: {
        users: users.length,
        products: products.length,
        clients: clients.length,
        sales_orders: salesOrders.length,
      },
    })

    const date = new Date().toISOString().slice(0, 10)
    const filename = `export-${safeFilename(String(company.slug || company.name))}-${date}.json`
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return handleRouteError(error, 'admin.companies.export')
  }
}
