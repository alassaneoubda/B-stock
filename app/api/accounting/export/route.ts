import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { buildAccountingExport, parseExportQuery } from '@/lib/accounting/service'
import { renderExport } from '@/lib/accounting/formats'

/**
 * GET /api/accounting/export?from=…&to=…&journals=VT,AC,…&format=csv|sage
 * Télécharge le fichier d'écritures. Refusé si une pièce est déséquilibrée
 * (le fichier serait rejeté à l'import par le logiciel comptable).
 */
export async function GET(request: NextRequest) {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const query = parseExportQuery(new URL(request.url).searchParams)
    const { lines, control } = await buildAccountingExport(companyId, query)
    if (control.unbalancedPieces.length > 0) {
      throw new AppError(
        409,
        `${control.unbalancedPieces.length} pièce(s) déséquilibrée(s) : export impossible. Contactez le support B-Stock.`,
        'UNBALANCED'
      )
    }

    const file = renderExport(lines, query.format)
    await sql`
      INSERT INTO accounting_exports (
        company_id, date_from, date_to, journals, format, line_count, total_debit, total_credit, created_by
      ) VALUES (
        ${companyId}, ${query.from}, ${query.to}, ${query.journals}, ${query.format},
        ${control.lineCount}, ${control.totalDebit}, ${control.totalCredit}, ${userId}
      )
    `
    await sql`
      INSERT INTO audit_logs (company_id, user_id, action, entity_type, details)
      VALUES (${companyId}, ${userId}, 'export', 'accounting', ${JSON.stringify({
        from: query.from,
        to: query.to,
        journals: query.journals,
        format: query.format,
        lines: control.lineCount,
      })}::jsonb)
    `

    const filename = `ecritures_${query.format === 'sage' ? 'sage_' : ''}${query.from}_${query.to}.${file.extension}`
    return new NextResponse(file.content, {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    return handleRouteError(error, 'accounting.export')
  }
}
