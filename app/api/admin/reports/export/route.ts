import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { toCSV, csvResponse } from '@/lib/csv'

// GET /api/admin/reports/export?type=companies|users|payments|revenue
export async function GET(request: NextRequest) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'companies'
  const stamp = new Date().toISOString().slice(0, 10)

  try {
    let csv = ''
    let filename = ''

    if (type === 'companies') {
      const rows = await sql`
        SELECT c.name, c.email, c.subscription_plan_name AS plan,
          c.subscription_status AS status, c.is_suspended,
          (SELECT COUNT(*)::int FROM users u WHERE u.company_id = c.id) AS users,
          to_char(c.trial_ends_at, 'YYYY-MM-DD') AS trial_ends,
          to_char(c.created_at, 'YYYY-MM-DD') AS created
        FROM companies c ORDER BY c.created_at DESC
      `
      csv = toCSV(rows, [
        { key: 'name', label: 'Entreprise' },
        { key: 'email', label: 'Email' },
        { key: 'plan', label: 'Plan' },
        { key: 'status', label: 'Statut' },
        { key: 'is_suspended', label: 'Suspendue' },
        { key: 'users', label: 'Utilisateurs' },
        { key: 'trial_ends', label: 'Fin essai' },
        { key: 'created', label: 'Créée le' },
      ])
      filename = `entreprises-${stamp}.csv`
    } else if (type === 'users') {
      const rows = await sql`
        SELECT u.full_name, u.email, u.role, u.is_active,
          c.name AS company,
          to_char(u.created_at, 'YYYY-MM-DD') AS created
        FROM users u
        LEFT JOIN companies c ON u.company_id = c.id
        ORDER BY u.created_at DESC
      `
      csv = toCSV(rows, [
        { key: 'full_name', label: 'Nom' },
        { key: 'email', label: 'Email' },
        { key: 'role', label: 'Rôle' },
        { key: 'is_active', label: 'Actif' },
        { key: 'company', label: 'Entreprise' },
        { key: 'created', label: 'Créé le' },
      ])
      filename = `utilisateurs-${stamp}.csv`
    } else if (type === 'payments') {
      const rows = await sql`
        SELECT p.reference, c.name AS company, p.plan_name AS plan,
          p.amount, p.currency, p.months, p.status, p.provider,
          to_char(p.created_at, 'YYYY-MM-DD HH24:MI') AS created
        FROM subscription_payments p
        LEFT JOIN companies c ON p.company_id = c.id
        ORDER BY p.created_at DESC
      `
      csv = toCSV(rows, [
        { key: 'reference', label: 'Référence' },
        { key: 'company', label: 'Entreprise' },
        { key: 'plan', label: 'Plan' },
        { key: 'amount', label: 'Montant' },
        { key: 'currency', label: 'Devise' },
        { key: 'months', label: 'Mois' },
        { key: 'status', label: 'Statut' },
        { key: 'provider', label: 'Fournisseur' },
        { key: 'created', label: 'Date' },
      ])
      filename = `paiements-${stamp}.csv`
    } else if (type === 'revenue') {
      const months = Math.min(36, Math.max(1, parseInt(searchParams.get('months') || '12', 10)))
      const rows = await sql`
        SELECT to_char(m, 'YYYY-MM') AS month,
          COALESCE(SUM(p.amount), 0)::float AS revenue,
          COUNT(p.id)::int AS transactions
        FROM generate_series(
          date_trunc('month', NOW()) - (INTERVAL '1 month' * ${months - 1}),
          date_trunc('month', NOW()),
          INTERVAL '1 month'
        ) m
        LEFT JOIN subscription_payments p
          ON date_trunc('month', p.created_at) = m
          AND p.status IN ('completed', 'manual')
        GROUP BY m ORDER BY m
      `
      csv = toCSV(rows, [
        { key: 'month', label: 'Mois' },
        { key: 'revenue', label: 'Revenu' },
        { key: 'transactions', label: 'Transactions' },
      ])
      filename = `revenus-${stamp}.csv`
    } else {
      return NextResponse.json({ error: 'Type d\u2019export inconnu' }, { status: 400 })
    }

    await logAdminAction(authz.adminId, authz.adminEmail, 'report.export', 'report', null, { type })
    return csvResponse(filename, csv)
  } catch (e) {
    console.error('admin reports export error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
