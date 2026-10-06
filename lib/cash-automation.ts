import { sql } from './db'

/**
 * Gestion automatique des mouvements de caisse.
 *
 * Toutes les fonctions acceptent une fonction de requête `q` : passer `tx.sql`
 * pour écrire dans la transaction appelante (recommandé), sinon `sql` (par
 * défaut, compatibilité avec les appels existants).
 *
 * La session ouverte est lue avec `FOR SHARE` : une clôture concurrente
 * (`SELECT ... FOR UPDATE` dans /api/cash/close) attend la fin de la
 * transaction qui écrit le mouvement, ou bien le mouvement voit la session
 * fermée et n'est pas écrit — jamais de mouvement « perdu » dans une session
 * déjà clôturée sans être compté.
 */

export type CashQueryFn = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>

export type CashMovementInput = {
  companyId: string
  movementType: 'cash_in' | 'cash_out'
  category: string
  amount: number
  description?: string | null
  referenceType?: string | null
  referenceId?: string | null
  userId: string
  requiresValidation?: boolean
}

/** Session de caisse ouverte de l'entreprise (verrou partagé), ou null. */
export async function findOpenCashSession(
  q: CashQueryFn,
  companyId: string
): Promise<{ id: string } | null> {
  const rows = await q`
    SELECT id FROM cash_sessions
    WHERE company_id = ${companyId} AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
    FOR SHARE
  `
  return rows[0] ?? null
}

/**
 * Écrit un mouvement sur la session ouverte. Renvoie le mouvement créé, ou
 * null s'il n'y a aucune session ouverte (l'appelant décide si c'est bloquant).
 */
export async function recordCashMovement(q: CashQueryFn, input: CashMovementInput) {
  const session = await findOpenCashSession(q, input.companyId)
  if (!session) return null
  const amount = Math.round(input.amount * 100) / 100
  if (!(amount > 0)) return null
  const rows = await q`
    INSERT INTO cash_movements (
      company_id, cash_session_id, movement_type, category,
      amount, description, reference_type, reference_id, created_by, requires_validation
    )
    VALUES (
      ${input.companyId}, ${session.id}, ${input.movementType}, ${input.category},
      ${amount}, ${input.description ?? null}, ${input.referenceType ?? null}, ${input.referenceId ?? null},
      ${input.userId}, ${input.requiresValidation ?? false}
    )
    RETURNING *
  `
  return rows[0]
}

export async function createCashMovementFromSale(
  companyId: string,
  orderId: string,
  amount: number,
  paymentMethod: string,
  userId: string,
  q: CashQueryFn = sql
) {
  // Uniquement pour les paiements en espèces
  if (paymentMethod !== 'cash') return null
  const movement = await recordCashMovement(q, {
    companyId,
    movementType: 'cash_in',
    category: 'sale',
    amount,
    description: 'Vente automatique',
    referenceType: 'sales_order',
    referenceId: orderId,
    userId,
  })
  if (!movement) console.warn('Aucune session de caisse ouverte pour la vente:', orderId)
  return movement
}

/**
 * Encaissement d'une dette client. `referenceId` = id de la ligne `payments`
 * (un mouvement par paiement : plusieurs règlements d'une même créance ne
 * sont plus confondus).
 */
export async function createCashMovementFromPayment(
  q: CashQueryFn,
  input: { companyId: string; paymentId: string; amount: number; userId: string; description?: string | null }
) {
  return recordCashMovement(q, {
    companyId: input.companyId,
    movementType: 'cash_in',
    category: 'credit_payment',
    amount: input.amount,
    description: input.description ?? 'Encaissement créance',
    referenceType: 'payment',
    referenceId: input.paymentId,
    userId: input.userId,
  })
}

export async function createCashMovementFromCreditPayment(
  companyId: string,
  creditId: string,
  amount: number,
  paymentMethod: string,
  userId: string,
  q: CashQueryFn = sql
) {
  // Uniquement pour les paiements en espèces
  if (paymentMethod !== 'cash') return null
  const movement = await recordCashMovement(q, {
    companyId,
    movementType: 'cash_in',
    category: 'credit_payment',
    amount,
    description: 'Encaissement crédit',
    referenceType: 'credit_note',
    referenceId: creditId,
    userId,
  })
  if (!movement) console.warn('Aucune session de caisse ouverte pour le paiement crédit:', creditId)
  return movement
}

export async function createCashMovementFromExpense(
  companyId: string,
  expenseId: string,
  amount: number,
  category: string,
  description: string | null,
  userId: string,
  q: CashQueryFn = sql
) {
  const movement = await recordCashMovement(q, {
    companyId,
    movementType: 'cash_out',
    category: 'expense',
    amount,
    description: description || `Dépense : ${category}`,
    referenceType: 'expense',
    referenceId: expenseId,
    userId,
  })
  if (!movement) console.warn('Aucune session de caisse ouverte pour la dépense:', expenseId)
  return movement
}

/**
 * Vérifie si un mouvement de caisse existe déjà pour une référence
 * Évite les doublons
 */
export async function hasExistingCashMovement(
  companyId: string,
  referenceType: string,
  referenceId: string,
  q: CashQueryFn = sql
) {
  const existing = await q`
    SELECT id FROM cash_movements
    WHERE company_id = ${companyId}
      AND reference_type = ${referenceType}
      AND reference_id = ${referenceId}
    LIMIT 1
  `
  return existing.length > 0
}

/**
 * Totaux d'une session de caisse. Ne comptent que les mouvements sans
 * validation requise, ou validés : les mouvements en attente ou rejetés sont
 * exclus. Les anciennes contre-passations (`reference_type = 'reversal'`) d'un
 * mouvement rejeté sont aussi exclues, puisque le mouvement rejeté ne compte
 * déjà plus (sinon double déduction).
 */
export async function computeSessionTotals(q: CashQueryFn, sessionId: string) {
  const [row] = await q`
    SELECT
      COALESCE(SUM(CASE WHEN cm.movement_type = 'cash_in' THEN cm.amount ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN cm.movement_type = 'cash_out' THEN cm.amount ELSE 0 END), 0) AS total_out,
      COALESCE(SUM(CASE WHEN cm.movement_type = 'cash_in' AND cm.category = 'sale' THEN cm.amount ELSE 0 END), 0) AS total_sales,
      COALESCE(SUM(CASE WHEN cm.movement_type = 'cash_out' AND cm.category = 'expense' THEN cm.amount ELSE 0 END), 0) AS total_expenses
    FROM cash_movements cm
    WHERE cm.cash_session_id = ${sessionId}
      AND (cm.requires_validation IS NOT TRUE OR cm.validation_status = 'approved')
      AND NOT (
        cm.reference_type = 'reversal'
        AND EXISTS (
          SELECT 1 FROM cash_movements o
          WHERE o.id = cm.reference_id AND o.validation_status = 'rejected'
        )
      )
  `
  const [pending] = await q`
    SELECT COUNT(*)::int AS n FROM cash_movements
    WHERE cash_session_id = ${sessionId}
      AND requires_validation = true AND validation_status IS NULL
  `
  return {
    totalIn: Number(row.total_in),
    totalOut: Number(row.total_out),
    totalSales: Number(row.total_sales),
    totalExpenses: Number(row.total_expenses),
    pendingValidation: Number(pending.n),
  }
}
