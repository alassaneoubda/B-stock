import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'

const clientSchema = z.object({
  name: z.string().min(1, 'Nom du client requis'),
  contactName: z.string().optional(),
  clientType: z.enum(['retail', 'wholesale', 'restaurant', 'bar', 'subdepot']),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  gpsCoordinates: z.string().optional(),
  zone: z.string().optional(),
  creditLimit: z.number().min(0).default(0),
  packagingCreditLimit: z.number().min(0).default(0),
  paymentTermsDays: z.number().int().min(0).default(0),
  notes: z.string().optional(),
})

// POST /api/clients — Create a new client
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('clients.write')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const body = await request.json()
    const data = clientSchema.parse(body)

    // Client et ses deux comptes (produits / emballages) : tout ou rien
    const client = await withTransaction(async (tx) => {
      const [row] = await tx.sql`
        INSERT INTO clients (
          company_id, name, contact_name, client_type, phone, email,
          address, gps_coordinates, zone, credit_limit,
          packaging_credit_limit, payment_terms_days, notes
        ) VALUES (
          ${companyId}, ${data.name}, ${data.contactName || null},
          ${data.clientType}, ${data.phone || null}, ${data.email || null},
          ${data.address || null}, ${data.gpsCoordinates || null},
          ${data.zone || null}, ${data.creditLimit},
          ${data.packagingCreditLimit}, ${data.paymentTermsDays},
          ${data.notes || null}
        )
        RETURNING *
      `
      await tx.sql`
        INSERT INTO client_accounts (client_id, account_type, balance)
        VALUES (${row.id}, 'product', 0), (${row.id}, 'packaging', 0)
        ON CONFLICT (client_id, account_type) DO NOTHING
      `
      return row
    })

    return NextResponse.json({
      success: true,
      data: client,
      message: 'Client créé avec succès',
    }, { status: 201 })
  } catch (error) {
    return handleRouteError(error, 'clients.create')
  }
}

// GET /api/clients — List clients with accounts
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('clients.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim() || null
    const searchPattern = search ? `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null
    const clientType = searchParams.get('clientType') || null
    // Défaut 500 (= maximum) : l'écran « Nouveau retour » charge la liste complète dans un menu
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '500', 10) || 500, 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    const clients = await sql`
      SELECT c.*,
        COALESCE(
          (SELECT SUM(balance) FROM client_accounts WHERE client_id = c.id AND account_type = 'product'),
          0
        ) as product_balance,
        COALESCE(
          (SELECT SUM(balance) FROM client_accounts WHERE client_id = c.id AND account_type = 'packaging'),
          0
        ) as packaging_balance,
        COALESCE(
          (SELECT COUNT(*) FROM sales_orders WHERE client_id = c.id AND status != 'cancelled'),
          0
        ) as total_orders
      FROM clients c
      WHERE c.company_id = ${companyId}
        AND c.is_active = true
        AND (${clientType}::text IS NULL OR c.client_type = ${clientType}::text)
        AND (
          ${searchPattern}::text IS NULL
          OR c.name ILIKE ${searchPattern}::text
          OR c.phone ILIKE ${searchPattern}::text
          OR c.zone ILIKE ${searchPattern}::text
          OR c.contact_name ILIKE ${searchPattern}::text
        )
      ORDER BY c.name
      LIMIT ${limit} OFFSET ${offset}
    `

    return NextResponse.json({ success: true, data: clients })
  } catch (error) {
    return handleRouteError(error, 'clients.list')
  }
}
