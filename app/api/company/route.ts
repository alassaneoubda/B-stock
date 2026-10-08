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
  // TVA (cf. lib/vat.ts) — désactivée par défaut
  vat_enabled: z.boolean().optional(),
  vat_rate: z.coerce.number().min(0).max(100).optional(),
  vat_prices_include_tax: z.boolean().optional(),
  /** Numéro de compte contribuable (NCC) ; chaîne vide = effacer. */
  tax_id: z.string().trim().max(50).nullable().optional(),
  /** Alerte péremption : lots qui périment sous N jours. */
  alert_expiry_days: z.coerce.number().int().min(1).max(365).optional(),
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
             onboarding_completed, created_at,
             vat_enabled, vat_rate::float AS vat_rate, vat_prices_include_tax, tax_id, alert_expiry_days
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
        vat_enabled = COALESCE(${data.vat_enabled ?? null}::boolean, vat_enabled),
        vat_rate = COALESCE(${data.vat_rate ?? null}::numeric, vat_rate),
        vat_prices_include_tax = COALESCE(${data.vat_prices_include_tax ?? null}::boolean, vat_prices_include_tax),
        tax_id = CASE WHEN ${data.tax_id !== undefined}::boolean THEN ${data.tax_id || null} ELSE tax_id END,
        alert_expiry_days = COALESCE(${data.alert_expiry_days ?? null}::int, alert_expiry_days),
        updated_at = NOW()
      WHERE id = ${authz.companyId}
      RETURNING id, name, slug, sector, address, phone, email, logo_url, currency, timezone,
                vat_enabled, vat_rate::float AS vat_rate, vat_prices_include_tax, tax_id, alert_expiry_days
    `

    return NextResponse.json({ success: true, data: companies[0] })
  } catch (error) {
    return handleRouteError(error, 'company.patch')
  }
}
