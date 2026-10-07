import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { withTransaction } from '@/lib/db'
import { AppError, handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { assertPeriodOpen } from '@/lib/accounting/period-lock'

const validateSchema = z.object({
  approved: z.boolean(),
  notes: z.string().max(1000).optional().nullable(),
})

/**
 * POST /api/cash/movements/[id]/validate — Validate or reject a cash movement
 *
 * Un mouvement n'est traité qu'une seule fois : uniquement s'il requiert une
 * validation, n'a pas encore été traité, et si sa session est encore ouverte.
 *
 * Rejet : le mouvement est simplement marqué 'rejected'. Les totaux de caisse
 * (clôture, /api/cash) ne comptent que les mouvements sans validation requise
 * ou validés : un mouvement rejeté (entrée comme sortie) n'a donc jamais
 * d'effet, sans écriture de contre-passation (l'ancienne contre-passation des
 * entrées rejetées aurait été déduite une seconde fois).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('cash.manage')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const movementId = (await params).id
    if (!isUuid(movementId)) throw notFound('Mouvement')
    const data = validateSchema.parse(await request.json())

    const movement = await withTransaction(async (tx) => {
      // Mois clôturé (export comptable transmis) : opération refusée
      await assertPeriodOpen(tx.sql, companyId)
      // Verrou partagé sur la session : une clôture concurrente attend la fin
      // de la validation (ou la validation voit la session clôturée).
      const [current] = await tx.sql`
        SELECT cm.id, cm.requires_validation, cm.validation_status, cs.status AS session_status
        FROM cash_movements cm
        JOIN cash_sessions cs ON cs.id = cm.cash_session_id
        WHERE cm.id = ${movementId} AND cm.company_id = ${companyId}
        FOR SHARE OF cs
      `
      if (!current) throw notFound('Mouvement')
      if (current.session_status !== 'open') {
        throw new AppError(409, 'La session de caisse de ce mouvement est clôturée', 'CASH_SESSION_CLOSED')
      }
      if (current.requires_validation !== true) {
        throw new AppError(409, 'Ce mouvement ne nécessite pas de validation', 'NO_VALIDATION_REQUIRED')
      }

      const { rows, rowCount } = await tx.exec`
        UPDATE cash_movements SET
          validated_by = ${userId},
          validated_at = NOW(),
          validation_notes = ${data.notes || null},
          validation_status = ${data.approved ? 'approved' : 'rejected'}
        WHERE id = ${movementId} AND company_id = ${companyId}
          AND requires_validation = true AND validation_status IS NULL
        RETURNING *
      `
      if (rowCount !== 1) throw new AppError(409, 'Ce mouvement a déjà été traité', 'ALREADY_VALIDATED')
      const updated = rows[0]

      await tx.sql`
        INSERT INTO audit_logs (company_id, action, entity_type, entity_id, details, user_id)
        VALUES (
          ${companyId},
          ${data.approved ? 'validate' : 'reject'},
          'cash_movement',
          ${movementId},
          ${JSON.stringify({ movement_type: updated.movement_type, amount: updated.amount, notes: data.notes || null })}::jsonb,
          ${userId}
        )
      `
      return updated
    })

    return NextResponse.json({ success: true, data: movement })
  } catch (error) {
    return handleRouteError(error, 'cash.movements.validate')
  }
}
