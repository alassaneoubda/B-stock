import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { handleRouteError } from '@/lib/errors'

const LIMIT = 5

/** Échappe les jokers LIKE saisis par l'utilisateur. */
function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

/**
 * GET /api/admin/search?q= — Recherche globale du back-office (2 caractères min.).
 * Résultats groupés (5 max. par groupe), chacun rattaché à son entreprise :
 * entreprises, utilisateurs, ventes (n° de commande), paiements d'abonnement (référence / n° de reçu).
 * Les numéros de téléphone sont aussi comparés sans espaces ni ponctuation.
 */
export async function GET(request: NextRequest) {
  const authz = await requireAdmin('companies.read')
  if (!authz.ok) return authz.response

  try {
    const q = (new URL(request.url).searchParams.get('q') || '').trim().slice(0, 100)
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: { companies: [], users: [], sales: [], payments: [] } })
    }
    const like = likePattern(q)
    const digits = q.replace(/\D/g, '')
    // Comparaison téléphone uniquement si la saisie contient assez de chiffres
    const phoneLike = digits.length >= 4 ? `%${digits}%` : null

    const [companies, users, sales, payments] = await Promise.all([
      sql`
        SELECT id, name, slug, email, phone, subscription_status, is_suspended
        FROM companies
        WHERE name ILIKE ${like} OR slug ILIKE ${like} OR email ILIKE ${like} OR phone ILIKE ${like}
           OR (${phoneLike}::text IS NOT NULL AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE ${phoneLike})
        ORDER BY (name ILIKE ${`${q}%`}) DESC, name ASC
        LIMIT ${LIMIT}
      `,
      sql`
        SELECT u.id, u.email, u.full_name, u.phone, u.role, c.id AS company_id, c.name AS company_name
        FROM users u JOIN companies c ON c.id = u.company_id
        WHERE u.email ILIKE ${like} OR u.full_name ILIKE ${like} OR u.phone ILIKE ${like}
           OR (${phoneLike}::text IS NOT NULL AND regexp_replace(COALESCE(u.phone, ''), '\\D', '', 'g') LIKE ${phoneLike})
        ORDER BY u.full_name ASC
        LIMIT ${LIMIT}
      `,
      sql`
        SELECT s.id, s.order_number, s.total_amount, s.status, s.created_at,
               c.id AS company_id, c.name AS company_name
        FROM sales_orders s JOIN companies c ON c.id = s.company_id
        WHERE s.order_number ILIKE ${like}
        ORDER BY s.created_at DESC
        LIMIT ${LIMIT}
      `,
      sql`
        SELECT p.id, p.reference, p.receipt_number, p.amount, p.status, p.plan_name, p.created_at,
               c.id AS company_id, c.name AS company_name
        FROM subscription_payments p JOIN companies c ON c.id = p.company_id
        WHERE p.reference ILIKE ${like} OR p.receipt_number ILIKE ${like}
        ORDER BY p.created_at DESC
        LIMIT ${LIMIT}
      `,
    ])

    return NextResponse.json({ success: true, data: { companies, users, sales, payments } })
  } catch (error) {
    return handleRouteError(error, 'admin.search')
  }
}
