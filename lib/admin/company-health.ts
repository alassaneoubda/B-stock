import { sql } from '@/lib/db'

/**
 * Santé des comptes clients (back-office → suivi client).
 *
 * Indicateurs par entreprise :
 * - dernière activité  = dernière connexion d'un utilisateur (MAX users.last_login_at)
 * - ventes 7 j / 30 j   = nombre et chiffre d'affaires des ventes non annulées
 * - utilisateurs actifs = utilisateurs actifs connectés depuis ≤ 14 jours
 * - démarrage (0 → 4)   = a des produits, des clients, au moins une vente, une caisse ouverte
 *
 * Niveau de santé — règles évaluées DANS CET ORDRE (la première qui s'applique gagne) :
 * 1. « new »      : compte créé il y a moins de 7 jours (on laisse le temps de démarrer)
 * 2. « inactive » : aucune connexion depuis 14 jours ET aucune vente depuis 30 jours
 * 3. « at_risk »  : aucune vente depuis 14 jours, OU démarrage < 2 étapes après 7 jours
 * 4. « active »   : sinon
 *
 * Les durées sont calculées par PostgreSQL (NOW() - colonne) pour éviter tout
 * décalage de fuseau entre Node et la base.
 */

export type HealthLevel = 'active' | 'at_risk' | 'inactive' | 'new'

export const HEALTH_RULES = {
  /** Compte « nouveau » pendant ce nombre de jours après sa création. */
  newAccountDays: 7,
  /** Sans connexion depuis… (inactif, si en plus aucune vente). */
  inactiveLoginDays: 14,
  /** Sans vente depuis… (inactif, si en plus aucune connexion). */
  inactiveSaleDays: 30,
  /** Sans vente depuis… → à risque. */
  atRiskSaleDays: 14,
  /** Étapes de démarrage minimales après la période « nouveau ». */
  minOnboardingSteps: 2,
  /** Fenêtre des « utilisateurs actifs ». */
  activeUserDays: 14,
} as const

export const HEALTH_LABELS: Record<HealthLevel, string> = {
  active: 'Actif',
  at_risk: 'À risque',
  inactive: 'Inactif',
  new: 'Nouveau',
}

export type OnboardingProgress = {
  hasProducts: boolean
  hasClients: boolean
  hasSale: boolean
  hasCashSession: boolean
  /** Nombre d'étapes franchies (0 → 4). */
  score: number
}

export type CompanyHealth = {
  companyId: string
  level: HealthLevel
  /** Explications lisibles (français) du niveau retenu. */
  reasons: string[]
  createdAt: string | null
  lastActivityAt: string | null
  lastSaleAt: string | null
  sales7d: number
  revenue7d: number
  sales30d: number
  revenue30d: number
  activeUsers: number
  totalUsers: number
  onboarding: OnboardingProgress
}

export type HealthInput = {
  /** Âge du compte en jours. */
  ageDays: number
  /** Jours depuis la dernière connexion (null = jamais). */
  daysSinceLogin: number | null
  /** Jours depuis la dernière vente (null = jamais). */
  daysSinceSale: number | null
  onboardingScore: number
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`

/** Règles du niveau de santé (fonction pure, testée unitairement). */
export function computeHealthLevel(input: HealthInput): { level: HealthLevel; reasons: string[] } {
  const R = HEALTH_RULES
  const { ageDays, daysSinceLogin, daysSinceSale, onboardingScore } = input

  if (ageDays < R.newAccountDays) {
    return {
      level: 'new',
      reasons: [`Compte créé il y a moins de ${R.newAccountDays} jours (démarrage : ${onboardingScore}/4 étapes).`],
    }
  }

  const noRecentLogin = daysSinceLogin === null || daysSinceLogin > R.inactiveLoginDays
  const noSale30 = daysSinceSale === null || daysSinceSale > R.inactiveSaleDays
  if (noRecentLogin && noSale30) {
    return {
      level: 'inactive',
      reasons: [
        daysSinceLogin === null
          ? 'Aucun utilisateur ne s’est jamais connecté.'
          : `Aucune connexion depuis ${plural(Math.floor(daysSinceLogin), 'jour')}.`,
        daysSinceSale === null
          ? 'Aucune vente enregistrée.'
          : `Aucune vente depuis ${plural(Math.floor(daysSinceSale), 'jour')}.`,
      ],
    }
  }

  const reasons: string[] = []
  if (daysSinceSale === null || daysSinceSale > R.atRiskSaleDays) {
    reasons.push(
      daysSinceSale === null
        ? 'Aucune vente enregistrée depuis la création du compte.'
        : `Aucune vente depuis ${plural(Math.floor(daysSinceSale), 'jour')} (seuil : ${R.atRiskSaleDays} jours).`
    )
  }
  if (onboardingScore < R.minOnboardingSteps) {
    reasons.push(`Démarrage incomplet : ${onboardingScore}/4 étapes après ${R.newAccountDays} jours.`)
  }
  if (reasons.length > 0) return { level: 'at_risk', reasons }

  return { level: 'active', reasons: ['Connexions et ventes régulières.'] }
}

const num = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const days = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null)

/**
 * Santé des entreprises demandées (toutes si `companyIds` est omis).
 * Retourne une Map companyId → santé.
 */
export async function getCompanyHealth(companyIds?: string[]): Promise<Map<string, CompanyHealth>> {
  const result = new Map<string, CompanyHealth>()
  if (companyIds && companyIds.length === 0) return result
  const ids = companyIds ?? null
  const R = HEALTH_RULES

  const rows = await sql`
    WITH target AS (
      SELECT id, created_at FROM companies
      WHERE ${ids}::uuid[] IS NULL OR id = ANY(${ids}::uuid[])
    ),
    u AS (
      SELECT company_id,
             MAX(last_login_at) AS last_login_at,
             COUNT(*) FILTER (
               WHERE is_active IS NOT FALSE
                 AND last_login_at >= NOW() - (${R.activeUserDays} * INTERVAL '1 day')
             )::int AS active_users,
             COUNT(*)::int AS total_users
      FROM users WHERE company_id IN (SELECT id FROM target)
      GROUP BY company_id
    ),
    s AS (
      SELECT company_id,
             MAX(created_at) AS last_sale_at,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS sales_7d,
             COALESCE(SUM(total_amount) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'), 0) AS revenue_7d,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS sales_30d,
             COALESCE(SUM(total_amount) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'), 0) AS revenue_30d
      FROM sales_orders
      WHERE company_id IN (SELECT id FROM target) AND COALESCE(status, '') <> 'cancelled'
      GROUP BY company_id
    )
    SELECT
      t.id, t.created_at,
      EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 86400 AS age_days,
      u.last_login_at,
      EXTRACT(EPOCH FROM (NOW() - u.last_login_at)) / 86400 AS days_since_login,
      COALESCE(u.active_users, 0) AS active_users,
      COALESCE(u.total_users, 0) AS total_users,
      s.last_sale_at,
      EXTRACT(EPOCH FROM (NOW() - s.last_sale_at)) / 86400 AS days_since_sale,
      COALESCE(s.sales_7d, 0) AS sales_7d, COALESCE(s.revenue_7d, 0) AS revenue_7d,
      COALESCE(s.sales_30d, 0) AS sales_30d, COALESCE(s.revenue_30d, 0) AS revenue_30d,
      EXISTS (SELECT 1 FROM products p WHERE p.company_id = t.id) AS has_products,
      EXISTS (SELECT 1 FROM clients cl WHERE cl.company_id = t.id) AS has_clients,
      EXISTS (SELECT 1 FROM cash_sessions cs WHERE cs.company_id = t.id) AS has_cash_session
    FROM target t
    LEFT JOIN u ON u.company_id = t.id
    LEFT JOIN s ON s.company_id = t.id
  `

  for (const r of rows) {
    const onboarding: OnboardingProgress = {
      hasProducts: !!r.has_products,
      hasClients: !!r.has_clients,
      hasSale: r.last_sale_at != null,
      hasCashSession: !!r.has_cash_session,
      score: 0,
    }
    onboarding.score = [onboarding.hasProducts, onboarding.hasClients, onboarding.hasSale, onboarding.hasCashSession].filter(
      Boolean
    ).length

    const { level, reasons } = computeHealthLevel({
      // created_at absent (données anciennes) : compte considéré comme ancien
      ageDays: r.age_days == null ? Number.POSITIVE_INFINITY : Number(r.age_days),
      daysSinceLogin: days(r.days_since_login),
      daysSinceSale: days(r.days_since_sale),
      onboardingScore: onboarding.score,
    })

    result.set(r.id, {
      companyId: r.id,
      level,
      reasons,
      createdAt: iso(r.created_at),
      lastActivityAt: iso(r.last_login_at),
      lastSaleAt: iso(r.last_sale_at),
      sales7d: num(r.sales_7d),
      revenue7d: num(r.revenue_7d),
      sales30d: num(r.sales_30d),
      revenue30d: num(r.revenue_30d),
      activeUsers: num(r.active_users),
      totalUsers: num(r.total_users),
      onboarding,
    })
  }
  return result
}
