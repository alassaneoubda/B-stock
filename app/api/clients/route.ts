import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

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
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json()
    const data = clientSchema.parse(body)
    const { companyId } = session.user

    const clients = await sql`
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

    // Create product and packaging accounts
    await sql`
      INSERT INTO client_accounts (client_id, account_type, balance)
      VALUES (${clients[0].id}, 'product', 0)
    `
    await sql`
      INSERT INTO client_accounts (client_id, account_type, balance)
      VALUES (${clients[0].id}, 'packaging', 0)
    `

    return NextResponse.json({
      success: true,
      data: clients[0],
      message: 'Client créé avec succès',
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      )
    }
    console.error('Error creating client:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création du client' },
      { status: 500 }
    )
  }
}

// GET /api/clients — List clients with accounts
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.companyId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const clientType = searchParams.get('clientType')

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
      WHERE c.company_id = ${session.user.companyId}
        AND c.is_active = true
      ORDER BY c.name
    `

    // Apply JS filters
    let filtered = clients as Array<Record<string, unknown>>

    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (c) =>
          String(c.name).toLowerCase().includes(q) ||
          String(c.phone || '').toLowerCase().includes(q) ||
          String(c.zone || '').toLowerCase().includes(q) ||
          String(c.contact_name || '').toLowerCase().includes(q)
      )
    }
    if (clientType) {
      filtered = filtered.filter((c) => c.client_type === clientType)
    }

    return NextResponse.json({ success: true, data: filtered })
  } catch (error) {
    console.error('Error fetching clients:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des clients' },
      { status: 500 }
    )
  }
}
