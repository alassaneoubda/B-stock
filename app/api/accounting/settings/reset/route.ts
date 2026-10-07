import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'
import { DEFAULT_SETTINGS } from '@/lib/accounting/chart'

// POST /api/accounting/settings/reset — rétablit les valeurs SYSCOHADA par défaut
// (comptes, journaux, préfixes ; les codes auxiliaires saisis sont conservés)
export async function POST() {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    await sql`DELETE FROM accounting_settings WHERE company_id = ${companyId}`
    await sql`
      INSERT INTO audit_logs (company_id, user_id, action, entity_type, details)
      VALUES (${companyId}, ${userId}, 'reset', 'accounting_settings', ${JSON.stringify({ to: 'syscohada' })}::jsonb)
    `
    return NextResponse.json({
      success: true,
      data: { settings: DEFAULT_SETTINGS },
      message: 'Valeurs SYSCOHADA rétablies',
    })
  } catch (error) {
    return handleRouteError(error, 'accounting.settings.reset')
  }
}
