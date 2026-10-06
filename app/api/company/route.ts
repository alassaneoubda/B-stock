import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwner, requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'

const companyUpdateSchema = z.object({
  name: z.string().trim().min(2).max(255).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional().or(z.literal('')),
  sector: z.string().trim().max(100).nullable().optional(),
})

// GET /api/company — Get current company info
export async function GET() {
  try {
    const authz = await requirePermission('settings.read')
    if (!authz.ok) return authz.response

    // Champs exposés au client (pas d'identifiants de paiement ni de champs internes)
    const companies = await sql`
      SELECT id, name, slug, sector, address, phone, email, logo_url, currency, timezone,
             subscription_status, subscription_plan_name, trial_ends_at, subscription_ends_at,
             onboarding_completed, created_at
      FROM companies WHERE id = ${authz.companyId}
    `
    if (companies.length === 0) throw notFound('Entreprise')

    return NextResponse.json({ success: true, data: companies[0] })
  } catch (error) {
    return handleRouteError(error, 'company.get')
  }
}

// PATCH /api/company — Update company info (owner only)
export async function PATCH(request: NextRequest) {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response

    const data = companyUpdateSchema.parse(await request.json())

    const companies = await sql`
      UPDATE companies SET
        name = COALESCE(${data.name ?? null}, name),
        address = COALESCE(${data.address ?? null}, address),
        phone = COALESCE(${data.phone ?? null}, phone),
        email = COALESCE(${data.email || null}, email),
        sector = COALESCE(${data.sector || null}, sector),
        updated_at = NOW()
      WHERE id = ${authz.companyId}
      RETURNING id, name, slug, sector, address, phone, email, logo_url, currency, timezone
    `

    return NextResponse.json({ success: true, data: companies[0] })
  } catch (error) {
    return handleRouteError(error, 'company.patch')
  }
}
