import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/api-auth'
import { handleRouteError } from '@/lib/errors'
import { buildAccountingExport, parseExportQuery } from '@/lib/accounting/service'

const PREVIEW_LINES = 300

/**
 * GET /api/accounting/preview?from=AAAA-MM-JJ&to=AAAA-MM-JJ&journals=VT,AC,…
 * Contrôle affiché avant l'export : nombre d'écritures, totaux débit / crédit,
 * pièces déséquilibrées (doit être 0), documents ignorés, alertes, et un
 * aperçu des premières lignes.
 */
export async function GET(request: NextRequest) {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    const query = parseExportQuery(new URL(request.url).searchParams)
    const { lines, control } = await buildAccountingExport(authz.companyId, query)
    return NextResponse.json({
      success: true,
      data: {
        control,
        lines: lines.slice(0, PREVIEW_LINES),
        truncated: lines.length > PREVIEW_LINES,
      },
    })
  } catch (error) {
    return handleRouteError(error, 'accounting.preview')
  }
}
