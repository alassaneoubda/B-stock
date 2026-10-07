import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Circle,
  CreditCard,
  MonitorSmartphone,
  Plus,
  Wallet,
  Warehouse,
} from 'lucide-react'
import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { canAccessPath } from '@/lib/route-permissions'
import { DashboardHeader } from '@/components/dashboard/header'
import { SubscriptionBanner } from '@/components/dashboard/subscription-banner'
import { PageIntro, PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format'

// Les erreurs SQL remontent jusqu'à error.tsx (jamais de zéros trompeurs).
async function getDashboard(companyId: string) {
  const [counts, salesByDay, credit, lowStock, cash, pos, recent] = await Promise.all([
    sql`
      SELECT
        (SELECT COUNT(*) FROM products WHERE company_id = ${companyId} AND is_active = true)::int AS products,
        (SELECT COUNT(*) FROM clients WHERE company_id = ${companyId} AND is_active = true AND is_walk_in = false)::int AS clients,
        (SELECT COUNT(*) FROM sales_orders WHERE company_id = ${companyId})::int AS sales
    `,
    sql`
      SELECT d::date AS day,
             COALESCE(SUM(so.total_amount), 0)::float AS total,
             COUNT(so.id)::int AS count
      FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, INTERVAL '1 day') d
      LEFT JOIN sales_orders so
        ON so.company_id = ${companyId} AND DATE(so.created_at) = d::date AND so.status <> 'cancelled'
      GROUP BY d ORDER BY d
    `,
    sql`
      SELECT COALESCE(SUM(total_amount - paid_amount), 0)::float AS outstanding,
             COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)::int AS overdue
      FROM credit_notes
      WHERE company_id = ${companyId} AND status IN ('pending', 'partial', 'overdue') AND total_amount > paid_amount
    `,
    sql`
      SELECT COUNT(*)::int AS low, COUNT(*) FILTER (WHERE qty <= 0)::int AS out
      FROM (
        SELECT pv.id, COALESCE(SUM(s.quantity), 0) AS qty, COALESCE(MAX(s.min_stock_alert), 10) AS min_alert
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id AND p.company_id = ${companyId} AND p.is_active = true
        LEFT JOIN stock s ON s.product_variant_id = pv.id
        GROUP BY pv.id
      ) v
      WHERE qty <= min_alert
    `,
    sql`
      SELECT id, opened_at, opening_amount::float AS opening_amount FROM cash_sessions
      WHERE company_id = ${companyId} AND status = 'open' ORDER BY opened_at DESC LIMIT 1
    `,
    sql`
      SELECT COUNT(DISTINCT o.id)::int AS open,
             COALESCE(SUM(i.quantity * i.unit_price) FILTER (WHERE i.status = 'active'), 0)::float AS total
      FROM pos_orders o LEFT JOIN pos_order_items i ON i.pos_order_id = o.id
      WHERE o.company_id = ${companyId} AND o.status = 'open'
    `,
    sql`
      SELECT so.id, so.order_number, so.status, so.total_amount, so.created_at, so.order_source,
             CASE WHEN c.is_walk_in THEN NULL ELSE c.name END AS client_name
      FROM sales_orders so
      LEFT JOIN clients c ON c.id = so.client_id AND c.company_id = so.company_id
      WHERE so.company_id = ${companyId}
      ORDER BY so.created_at DESC
      LIMIT 6
    `,
  ])

  const days = salesByDay.map((d) => ({ day: new Date(d.day), total: Number(d.total), count: Number(d.count) }))
  return {
    counts: counts[0],
    days,
    today: days[days.length - 1],
    yesterday: days[days.length - 2],
    credit: credit[0],
    lowStock: lowStock[0],
    cash: cash[0] ?? null,
    pos: pos[0],
    recent,
  }
}

function trendLabel(today: number, yesterday: number) {
  if (yesterday <= 0) return today > 0 ? 'Première vente de la période' : 'Aucune vente hier'
  const pct = Math.round(((today - yesterday) / yesterday) * 100)
  if (pct === 0) return 'Identique à hier'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} % par rapport à hier`
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' })
const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

export default async function DashboardPage() {
  const session = await requirePageSession()
  const { companyId, name } = session.user
  const can = (path: string) => canAccessPath(path, session.access.permissions)
  const d = await getDashboard(companyId)

  const firstName = (name || '').split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir'
  const maxDay = Math.max(...d.days.map((x) => x.total), 1)
  const weekTotal = d.days.reduce((s, x) => s + x.total, 0)

  const onboarding = [
    { done: d.counts.products > 0, label: 'Ajouter vos produits', href: '/dashboard/products/new' },
    { done: d.counts.clients > 0, label: 'Ajouter un premier client', href: '/dashboard/clients/new' },
    { done: Boolean(d.cash) || d.counts.sales > 0, label: 'Ouvrir la caisse', href: '/dashboard/cash' },
    { done: d.counts.sales > 0, label: 'Enregistrer une première vente', href: '/dashboard/sales/new' },
  ]
  const doneSteps = onboarding.filter((s) => s.done).length

  // Uniquement des éléments actionnables, du plus urgent au moins urgent
  const todo = [
    !d.cash && can('/dashboard/cash') && {
      icon: Wallet, tone: 'warning' as const, title: 'La caisse n’est pas ouverte',
      text: 'Les encaissements en espèces ne seront pas comptés.', href: '/dashboard/cash', cta: 'Ouvrir',
    },
    d.lowStock.out > 0 && can('/dashboard/stock') && {
      icon: AlertTriangle, tone: 'danger' as const, title: `${d.lowStock.out} produit${d.lowStock.out > 1 ? 's' : ''} en rupture`,
      text: 'Ils ne peuvent plus être vendus.', href: '/dashboard/stock?lowStock=true', cta: 'Voir',
    },
    d.lowStock.low - d.lowStock.out > 0 && can('/dashboard/stock') && {
      icon: Warehouse, tone: 'warning' as const, title: `${d.lowStock.low - d.lowStock.out} produit${d.lowStock.low - d.lowStock.out > 1 ? 's' : ''} sous le seuil`,
      text: 'Pensez à réapprovisionner.', href: '/dashboard/procurement/new', cta: 'Commander',
    },
    d.credit.overdue > 0 && can('/dashboard/credits') && {
      icon: CreditCard, tone: 'danger' as const, title: `${d.credit.overdue} créance${d.credit.overdue > 1 ? 's' : ''} en retard`,
      text: 'Relancez les clients concernés.', href: '/dashboard/credits', cta: 'Relancer',
    },
    d.pos.open > 0 && can('/pos') && {
      icon: MonitorSmartphone, tone: 'info' as const, title: `${d.pos.open} ticket${d.pos.open > 1 ? 's' : ''} ouvert${d.pos.open > 1 ? 's' : ''} au point de vente`,
      text: `${formatMoney(d.pos.total)} à encaisser.`, href: '/pos', cta: 'Ouvrir',
    },
  ].filter(Boolean) as { icon: typeof Wallet; tone: 'warning' | 'danger' | 'info'; title: string; text: string; href: string; cta: string }[]

  const TODO_TONE = {
    warning: 'bg-warning-soft text-warning-foreground',
    danger: 'bg-destructive/10 text-destructive',
    info: 'bg-info-soft text-info',
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Tableau de bord" />

      <PageShell>
        <PageIntro
          eyebrow={capitalize(LONG_DATE.format(new Date()))}
          title={`${greeting}${firstName ? `, ${firstName}` : ''}`}
          actions={
            <>
              {can('/dashboard/sales') && (
                <Button variant="outline" asChild>
                  <Link href="/dashboard/sales/new">
                    <Plus aria-hidden="true" /> Nouvelle vente
                  </Link>
                </Button>
              )}
              {can('/pos') && (
                <Button variant="brand" asChild>
                  <Link href="/pos">
                    <MonitorSmartphone aria-hidden="true" /> Point de vente
                  </Link>
                </Button>
              )}
            </>
          }
        />

        <SubscriptionBanner />

        {doneSteps < onboarding.length && (
          <Panel
            title="Bien démarrer avec B-Stock"
            description={`${doneSteps} étape${doneSteps > 1 ? 's' : ''} sur ${onboarding.length} — moins de 10 minutes au total`}
          >
            <div className="h-1 bg-muted">
              <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${(doneSteps / onboarding.length) * 100}%` }} />
            </div>
            <ol className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
              {onboarding.map((step, i) =>
                step.done ? (
                  <li key={step.href} className="flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
                    <span className="line-through">{step.label}</span>
                    <span className="sr-only">(terminé)</span>
                  </li>
                ) : (
                  <li key={step.href}>
                    <Link href={step.href} className="group flex items-center gap-3 px-5 py-4 text-sm transition-colors hover:bg-muted/40">
                      <span className="tabular flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] font-semibold text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="font-medium text-foreground">{step.label}</span>
                      <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  </li>
                )
              )}
            </ol>
          </Panel>
        )}

        {/* Indicateurs clés */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            emphasis
            label="Chiffre d’affaires du jour"
            value={formatMoney(d.today.total)}
            hint={`${d.today.count} vente${d.today.count > 1 ? 's' : ''} · ${trendLabel(d.today.total, d.yesterday.total)}`}
            icon={Banknote}
            href={can('/dashboard/sales') ? '/dashboard/sales' : undefined}
          />
          <StatCard
            label="Encours clients"
            value={formatMoney(d.credit.outstanding)}
            hint={d.credit.overdue > 0 ? `${d.credit.overdue} créance${d.credit.overdue > 1 ? 's' : ''} en retard` : 'Aucune créance en retard'}
            icon={CreditCard}
            tone={d.credit.overdue > 0 ? 'danger' : 'default'}
            href={can('/dashboard/credits') ? '/dashboard/credits' : undefined}
          />
          <StatCard
            label="Caisse"
            value={d.cash ? 'Ouverte' : 'Fermée'}
            hint={d.cash ? `Depuis ${formatDateTime(d.cash.opened_at).split(' ')[1]} · fonds ${formatMoney(d.cash.opening_amount)}` : 'Ouvrez-la avant les premières ventes'}
            icon={Wallet}
            tone={d.cash ? 'success' : 'warning'}
            href={can('/dashboard/cash') ? '/dashboard/cash' : undefined}
          />
          <StatCard
            label="Alertes de stock"
            value={formatNumber(d.lowStock.low)}
            hint={d.lowStock.out > 0 ? `dont ${d.lowStock.out} en rupture` : d.lowStock.low > 0 ? 'Produits sous le seuil' : 'Stock suffisant partout'}
            icon={Warehouse}
            tone={d.lowStock.out > 0 ? 'danger' : d.lowStock.low > 0 ? 'warning' : 'success'}
            href={can('/dashboard/stock') ? '/dashboard/stock' : undefined}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Ventes de la semaine */}
          <Panel
            title="Ventes des 7 derniers jours"
            description={`${formatMoney(weekTotal)} au total`}
            action={can('/dashboard/reports') ? { label: 'Rapports', href: '/dashboard/reports' } : undefined}
            className="lg:col-span-2"
            bodyClassName="px-5 pb-5 pt-6"
          >
            <div className="flex h-44 items-end gap-2 sm:gap-3" role="img" aria-label={`Ventes des 7 derniers jours, total ${formatMoney(weekTotal)}`}>
              {d.days.map((day, i) => {
                const isToday = i === d.days.length - 1
                const height = day.total > 0 ? Math.max(6, (day.total / maxDay) * 100) : 2
                return (
                  <div key={day.day.toISOString()} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                    <span className="tabular text-[11px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                      {day.total > 0 ? formatNumber(Math.round(day.total / 1000)) + ' k' : '—'}
                    </span>
                    <div
                      className={isToday ? 'w-full rounded-md bg-brand' : 'w-full rounded-md bg-primary/80 group-hover:bg-primary'}
                      style={{ height: `${height}%` }}
                      title={`${formatMoney(day.total)} · ${day.count} vente(s)`}
                    />
                    <span className={isToday ? 'text-xs font-semibold text-foreground' : 'text-xs capitalize text-muted-foreground'}>
                      {isToday ? 'Auj.' : WEEKDAY.format(day.day).replace('.', '')}
                    </span>
                  </div>
                )
              })}
            </div>
          </Panel>

          {/* À faire */}
          <Panel title="À faire" description={todo.length ? `${todo.length} point${todo.length > 1 ? 's' : ''} d’attention` : undefined}>
            {todo.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">Tout est en ordre</p>
                <p className="text-xs text-muted-foreground">Aucune action urgente pour le moment.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {todo.map((item) => (
                  <li key={item.title}>
                    <Link href={item.href} className="group flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40">
                      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TODO_TONE[item.tone]}`}>
                        <item.icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">{item.title}</span>
                        <span className="block text-xs text-muted-foreground">{item.text}</span>
                      </span>
                      <span className="mt-1 shrink-0 text-xs font-semibold text-foreground opacity-70 group-hover:opacity-100">
                        {item.cta} →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Ventes récentes */}
        <Panel title="Dernières ventes" action={can('/dashboard/sales') ? { label: 'Toutes les ventes', href: '/dashboard/sales' } : undefined}>
          {d.recent.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">Aucune vente pour l’instant.</p>
              {can('/dashboard/sales') && (
                <Button size="sm" asChild>
                  <Link href="/dashboard/sales/new">Enregistrer une vente</Link>
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {d.recent.map((sale) => (
                <li key={sale.id}>
                  <Link href={`/dashboard/sales/${sale.id}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-muted/40">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                      {(sale.client_name || 'C').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {sale.client_name || 'Client comptoir'}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {sale.order_number} · {formatDateTime(sale.created_at)}
                        {sale.order_source === 'pos' ? ' · Point de vente' : ''}
                      </span>
                    </span>
                    <span className="hidden sm:block">
                      <StatusBadge status={sale.status} />
                    </span>
                    <span className="tabular w-28 shrink-0 text-right text-sm font-semibold text-foreground">
                      {formatMoney(sale.total_amount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </PageShell>
    </div>
  )
}
