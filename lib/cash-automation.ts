import { sql } from './db'

/**
 * Gestion automatique des mouvements de caisse
 * Crée automatiquement des entrées/sorties pour les transactions réelles
 */

export async function createCashMovementFromSale(
  companyId: string,
  orderId: string,
  amount: number,
  paymentMethod: string,
  userId: string
) {
  // Trouver la session de caisse ouverte
  const openSessions = await sql`
    SELECT id FROM cash_sessions
    WHERE company_id = ${companyId} AND status = 'open'
    LIMIT 1
  `

  if (openSessions.length === 0) {
    console.warn('Aucune session de caisse ouverte pour la vente:', orderId)
    return null
  }

  const sessionId = openSessions[0].id

  // Uniquement pour les paiements en espèces
  if (paymentMethod === 'cash') {
    await sql`
      INSERT INTO cash_movements (
        company_id, cash_session_id, movement_type, category, 
        amount, description, reference_type, reference_id, created_by
      )
      VALUES (
        ${companyId}, ${sessionId}, 'cash_in', 'sale', 
        ${amount}, 'Vente automatique', 'sales_order', ${orderId}, ${userId}
      )
    `
  }
}

export async function createCashMovementFromCreditPayment(
  companyId: string,
  creditId: string,
  amount: number,
  paymentMethod: string,
  userId: string
) {
  const openSessions = await sql`
    SELECT id FROM cash_sessions
    WHERE company_id = ${companyId} AND status = 'open'
    LIMIT 1
  `

  if (openSessions.length === 0) {
    console.warn('Aucune session de caisse ouverte pour le paiement crédit:', creditId)
    return null
  }

  const sessionId = openSessions[0].id

  // Uniquement pour les paiements en espèces
  if (paymentMethod === 'cash') {
    await sql`
      INSERT INTO cash_movements (
        company_id, cash_session_id, movement_type, category, 
        amount, description, reference_type, reference_id, created_by
      )
      VALUES (
        ${companyId}, ${sessionId}, 'cash_in', 'credit_payment', 
        ${amount}, 'Encaissement crédit', 'credit_note', ${creditId}, ${userId}
      )
    `
  }
}

export async function createCashMovementFromExpense(
  companyId: string,
  expenseId: string,
  amount: number,
  category: string,
  description: string | null,
  userId: string
) {
  const openSessions = await sql`
    SELECT id FROM cash_sessions
    WHERE company_id = ${companyId} AND status = 'open'
    LIMIT 1
  `

  if (openSessions.length === 0) {
    console.warn('Aucune session de caisse ouverte pour la dépense:', expenseId)
    return null
  }

  const sessionId = openSessions[0].id

  await sql`
    INSERT INTO cash_movements (
      company_id, cash_session_id, movement_type, category, 
      amount, description, reference_type, reference_id, created_by
    )
    VALUES (
      ${companyId}, ${sessionId}, 'cash_out', 'expense', 
      ${amount}, ${description || 'Dépense automatique'}, 'expense', ${expenseId}, ${userId}
    )
  `
}

/**
 * Vérifie si un mouvement de caisse existe déjà pour une référence
 * Évite les doublons
 */
export async function hasExistingCashMovement(
  companyId: string,
  referenceType: string,
  referenceId: string
) {
  const existing = await sql`
    SELECT id FROM cash_movements
    WHERE company_id = ${companyId} 
      AND reference_type = ${referenceType} 
      AND reference_id = ${referenceId}
    LIMIT 1
  `
  return existing.length > 0
}
