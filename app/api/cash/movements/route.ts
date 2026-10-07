import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql, withTransaction } from '@/lib/db'
import { AppError, handleRouteError } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'
import { recordCashMovement } from '@/lib/cash-automation'
import { money } from '@/lib/domain/payments'
import { assertPeriodOpen } from '@/lib/accounting/period-lock'

// GET /api/cash/movements — List movements for current or specified session
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('cash.read')
    if (!authz.ok) return authz.response
    const { companyId } = authz

    const { searchParams } = new URL(request.url)
    const sessionIdParam = searchParams.get('session_id')
    if (sessionIdParam && !isUuid(sessionIdParam)) {
      return NextResponse.json({ error: 'Session : identifiant invalide' }, { status: 400 })
    }
    const sessionId = sessionIdParam || null
    const requiresValidation = searchParams.get('requires_validation')
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '500', 10) || 500, 1), 500)
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

    let movements
    if (sessionId) {
      movements = await sql`
        SELECT cm.*, u.full_name as created_by_name, v.full_name as validated_by_name
        FROM cash_movements cm
        LEFT JOIN users u ON cm.created_by = u.id
        LEFT JOIN users v ON cm.validated_by = v.id
        WHERE cm.cash_session_id = ${sessionId} AND cm.company_id = ${companyId}
        ORDER BY cm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else if (requiresValidation === 'true') {
      // Mouvements en attente de validation (sessions encore ouvertes : une
      // session clôturée ne peut plus être modifiée)
      movements = await sql`
        SELECT cm.*, u.full_name as created_by_name, v.full_name as validated_by_name
        FROM cash_movements cm
        JOIN cash_sessions cs ON cm.cash_session_id = cs.id
        LEFT JOIN users u ON cm.created_by = u.id
        LEFT JOIN users v ON cm.validated_by = v.id
        WHERE cm.company_id = ${companyId}
          AND cm.requires_validation = true
          AND cm.validation_status IS NULL
          AND cs.status = 'open'
        ORDER BY cm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    } else {
      // Get movements for current open session
      movements = await sql`
        SELECT cm.*, u.full_name as created_by_name, v.full_name as validated_by_name
        FROM cash_movements cm
        LEFT JOIN users u ON cm.created_by = u.id
        LEFT JOIN users v ON cm.validated_by = v.id
        JOIN cash_sessions cs ON cm.cash_session_id = cs.id
        WHERE cm.company_id = ${companyId} AND cs.status = 'open'
        ORDER BY cm.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    }

    return NextResponse.json({ success: true, data: movements })
  } catch (error) {
    return handleRouteError(error, 'cash.movements.list')
  }
}

const CASH_IN_CATEGORIES = ['sale', 'credit_payment', 'deposit', 'other'] as const
const CASH_OUT_CATEGORIES = ['expense', 'refund', 'withdrawal', 'other'] as const

const movementSchema = z
  .object({
    movement_type: z.enum(['cash_in', 'cash_out']),
    category: z.enum(['sale', 'credit_payment', 'expense', 'refund', 'deposit', 'withdrawal', 'other']),
    amount: z.coerce.number().positive('Le montant doit être positif'),
    description: z.string().max(1000).optional().nullable(),
    reference_type: z.string().max(50).optional().nullable(),
    reference_id: z.string().uuid().optional().nullable().or(z.literal('')),
  })
  .refine(
    (d) =>
      d.movement_type === 'cash_in'
        ? (CASH_IN_CATEGORIES as readonly string[]).includes(d.category)
        : (CASH_OUT_CATEGORIES as readonly string[]).includes(d.category),
    { message: 'Catégorie incompatible avec le type de mouvement', path: ['category'] }
  )

// POST /api/cash/movements — Add a manual cash movement (entry or exit)
export async function POST(request: NextRequest) {
  try {
    const authz = await requirePermission('cash.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = movementSchema.parse(await request.json())
    const amount = money(data.amount)

    const movement = await withTransaction(async (tx) => {
      // Mois clôturé (export comptable transmis) : opération refusée
      await assertPeriodOpen(tx.sql, companyId)
      // Saisie manuelle : toujours soumise à validation (un client ne peut plus
      // contourner la validation en envoyant un reference_type arbitraire).
      const row = await recordCashMovement(tx.sql, {
        companyId,
        movementType: data.movement_type,
        category: data.category,
        amount,
        description: data.description || null,
        referenceType: data.reference_type || 'manual',
        referenceId: data.reference_id || null,
        userId,
        requiresValidation: true,
      })
      if (!row) throw new AppError(409, 'Aucune caisse ouverte', 'NO_OPEN_CASH')

      // If it's an expense, also log it in expenses table
      if (data.category === 'expense' && data.movement_type === 'cash_out') {
        await tx.sql`
          INSERT INTO expenses (company_id, cash_session_id, category, amount, description, created_by)
          VALUES (${companyId}, ${row.cash_session_id}, 'other', ${amount}, ${data.description || null}, ${userId})
        `
      }
      return row
    })

    return NextResponse.json({ success: true, data: movement })
  } catch (error) {
    return handleRouteError(error, 'cash.movements.create')
  }
}
