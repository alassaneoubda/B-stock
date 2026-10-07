import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwner } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { conflict, handleRouteError, notFound } from '@/lib/errors'
import { AUX_CODE_RE } from '@/lib/accounting/chart'
import { loadAccountingSettings, loadAuxiliaryCodes } from '@/lib/accounting/source'

// GET /api/accounting/auxiliaries — codes auxiliaires des clients et fournisseurs
export async function GET() {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    const settings = await loadAccountingSettings(authz.companyId)
    const data = await loadAuxiliaryCodes(authz.companyId, settings)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return handleRouteError(error, 'accounting.auxiliaries.get')
  }
}

const putSchema = z.object({
  entityType: z.enum(['client', 'supplier']),
  entityId: z.string().uuid(),
  /** null ou chaîne vide = revenir au code dérivé du nom. */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(AUX_CODE_RE, 'Code invalide (1 à 17 lettres ou chiffres, sans espace)')
    .nullable()
    .or(z.literal('').transform(() => null)),
})

// PUT /api/accounting/auxiliaries — saisit (ou efface) le code auxiliaire d'un tiers
export async function PUT(request: NextRequest) {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    const { companyId } = authz
    const data = putSchema.parse(await request.json())

    const owned =
      data.entityType === 'client'
        ? await sql`SELECT 1 FROM clients WHERE id = ${data.entityId} AND company_id = ${companyId}`
        : await sql`SELECT 1 FROM suppliers WHERE id = ${data.entityId} AND company_id = ${companyId}`
    if (owned.length === 0) throw notFound(data.entityType === 'client' ? 'Client' : 'Fournisseur')

    if (data.code === null) {
      await sql`
        DELETE FROM accounting_auxiliary_codes
        WHERE company_id = ${companyId} AND entity_type = ${data.entityType} AND entity_id = ${data.entityId}
      `
    } else {
      const taken = await sql`
        SELECT 1 FROM accounting_auxiliary_codes
        WHERE company_id = ${companyId} AND entity_type = ${data.entityType}
          AND code = ${data.code} AND entity_id <> ${data.entityId}
      `
      if (taken.length > 0) throw conflict('Ce code auxiliaire est déjà attribué à un autre tiers', 'AUX_CODE_TAKEN')
      await sql`
        INSERT INTO accounting_auxiliary_codes (company_id, entity_type, entity_id, code, updated_at)
        VALUES (${companyId}, ${data.entityType}, ${data.entityId}, ${data.code}, NOW())
        ON CONFLICT (company_id, entity_type, entity_id)
        DO UPDATE SET code = EXCLUDED.code, updated_at = NOW()
      `
    }
    return NextResponse.json({ success: true, message: 'Code auxiliaire enregistré' })
  } catch (error) {
    return handleRouteError(error, 'accounting.auxiliaries.put')
  }
}
