import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, StatusBadge } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import {
    BookOpen,
    Building2,
    Calculator,
    UserCog,
    CreditCard,
    Bell,
    Shield,
    ChevronRight,
    MapPin,
    Layers,
} from 'lucide-react'
import Link from 'next/link'
import { canAccessPath } from '@/lib/route-permissions'
import { formatNumber } from '@/lib/format'

// Pas de try/catch : une panne SQL affiche error.tsx plutôt qu'une page vide.
async function getCompanyInfo(companyId: string) {
    {
        const company = await sql`
      SELECT c.*,
        (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.is_active = true) as users_count,
        (SELECT COUNT(*) FROM depots d WHERE d.company_id = c.id) as depots_count,
        (SELECT COUNT(*) FROM products p WHERE p.company_id = c.id AND p.is_active = true) as products_count
      FROM companies c WHERE c.id = ${companyId}
    `
        return company[0] || null
    }
}

const sectorLabels: Record<string, string> = {
    distributor: 'Distributeur officiel',
    wholesaler: 'Grossiste',
    semi_wholesaler: 'Demi-grossiste',
    depot: 'Dépôt de quartier',
}

const subscriptionLabels: Record<string, { label: string; tone: 'brand' | 'success' | 'danger' | 'default' }> = {
    trialing: { label: 'Essai gratuit', tone: 'brand' },
    active: { label: 'Abonnement actif', tone: 'success' },
    past_due: { label: 'Paiement en retard', tone: 'danger' },
    canceled: { label: 'Compte suspendu', tone: 'default' },
}

const settingsSections = [
    {
        href: '/dashboard/settings/company',
        icon: Building2,
        title: 'Entreprise',
        description: 'Identité commerciale, secteur et coordonnées',
    },
    {
        href: '/dashboard/settings/users',
        icon: UserCog,
        title: 'Utilisateurs et rôles',
        description: 'Accès et permissions de votre équipe',
    },
    {
        href: '/dashboard/settings/subscription',
        icon: CreditCard,
        title: 'Abonnement',
        description: 'Offre en cours et historique des paiements',
    },
    {
        href: '/dashboard/settings/accounting',
        icon: Calculator,
        title: 'Comptabilité',
        description: 'Plan de comptes SYSCOHADA et journaux de l’export comptable',
    },
    {
        href: '/dashboard/settings/notifications',
        icon: Bell,
        title: 'Notifications',
        description: 'Seuils de stock, rappels et alertes',
    },
    {
        href: '/dashboard/settings/security',
        icon: Shield,
        title: 'Sécurité',
        description: 'Mot de passe et sessions actives',
    },
]

export default async function SettingsPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const company = await getCompanyInfo(companyId)
    const subscription = subscriptionLabels[company?.subscription_status || 'trialing']
    // N'affiche que les sections que le rôle peut réellement ouvrir
    const visibleSections = settingsSections.filter((section) =>
        canAccessPath(section.href, session.access.permissions)
    )

    const counters = company
        ? [
              { label: 'Utilisateurs actifs', value: company.users_count },
              { label: 'Dépôts', value: company.depots_count },
              { label: 'Articles actifs', value: company.products_count },
          ]
        : []

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader title="Paramètres" description="Votre entreprise, votre équipe et votre compte" />

            <PageShell className="max-w-5xl">
                {/* Résumé de l'entreprise */}
                {company && (
                    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
                        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
                            <span
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground"
                                aria-hidden="true"
                            >
                                {(company.name || 'E').slice(0, 1).toUpperCase()}
                            </span>
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2.5">
                                    <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">{company.name}</h2>
                                    {subscription && <StatusBadge label={subscription.label} tone={subscription.tone} />}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                    <span className="inline-flex items-center gap-1.5">
                                        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                                        {sectorLabels[company.sector] || company.sector || 'Distribution de boissons'}
                                    </span>
                                    {company.address && (
                                        <span className="inline-flex min-w-0 items-center gap-1.5">
                                            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                            <span className="truncate">{company.address}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <dl className="grid grid-cols-3 divide-x divide-border border-t border-border bg-muted/30">
                            {counters.map((c) => (
                                <div key={c.label} className="px-4 py-3.5 sm:px-6">
                                    <dt className="truncate text-xs text-muted-foreground">{c.label}</dt>
                                    <dd className="tabular mt-0.5 text-lg font-semibold tracking-tight text-foreground">
                                        {formatNumber(c.value)}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                )}

                {/* Rubriques */}
                <section aria-labelledby="settings-sections-title" className="space-y-3">
                    <h2 id="settings-sections-title" className="text-sm font-medium text-muted-foreground">
                        Réglages
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {visibleSections.map((section) => (
                            <Link
                                key={section.href}
                                href={section.href}
                                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] outline-none transition-[box-shadow,border-color] hover:border-foreground/15 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
                            >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition-colors group-hover:bg-brand-soft group-hover:text-brand-strong">
                                    <section.icon className="h-5 w-5" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-foreground">{section.title}</span>
                                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{section.description}</span>
                                </span>
                                <ChevronRight
                                    className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                                    aria-hidden="true"
                                />
                            </Link>
                        ))}
                    </div>
                </section>

                {/* Aide */}
                <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:p-6">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <BookOpen className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-foreground">Besoin d’aide pour configurer B-Stock ?</h2>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">
                            Le guide d’utilisation explique pas à pas la gestion du stock, des ventes et de la caisse.
                        </p>
                    </div>
                    <Button variant="outline" asChild>
                        <Link href="/guide">Ouvrir le guide</Link>
                    </Button>
                </section>
            </PageShell>
        </div>
    )
}
