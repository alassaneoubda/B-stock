import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Settings,
    Building2,
    UserCog,
    CreditCard,
    Bell,
    Shield,
    ChevronRight,
    MapPin,
    Globe,
    Layers,
    Users,
    Package
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

const subscriptionLabels: Record<string, { label: string; color: string }> = {
    trialing: { label: 'Essai gratuit', color: 'bg-brand-soft text-brand-strong' },
    active: { label: 'Abonnement Actif', color: 'bg-success-soft text-success' },
    past_due: { label: 'Paiement en retard', color: 'bg-destructive/10 text-destructive' },
    canceled: { label: 'Compte Suspendu', color: 'bg-muted text-muted-foreground' },
}

const settingsSections = [
    {
        href: '/dashboard/settings/company',
        icon: Building2,
        title: 'Informations Entreprise',
        description: 'Identité commerciale, secteur et coordonnées',
        color: 'bg-primary/10 text-brand-strong'
    },
    {
        href: '/dashboard/settings/users',
        icon: UserCog,
        title: 'Collaborateurs & Rôles',
        description: 'Gestion des accès et permissions d\'équipe',
        color: 'bg-success/10 text-success'
    },
    {
        href: '/dashboard/settings/subscription',
        icon: CreditCard,
        title: 'Facturation & Plan',
        description: 'Suivi de l\'abonnement et historique de paiement',
        color: 'bg-info/10 text-info'
    },
    {
        href: '/dashboard/settings/notifications',
        icon: Bell,
        title: 'Alertes & Notifications',
        description: 'Configuration des seuils de stock et rappels',
        color: 'bg-warning/10 text-warning-foreground'
    },
    {
        href: '/dashboard/settings/security',
        icon: Shield,
        title: 'Sécurité & Accès',
        description: 'Mot de passe et sessions',
        color: 'bg-destructive/10 text-destructive'
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

    return (
        <div className="flex flex-col min-h-screen bg-muted/30">
            <DashboardHeader
                title="Configuration de l'Espace"
                description="Personnalisez votre plateforme B-Stock"
            />

            <main className="flex-1 p-4 lg:p-6 max-w-5xl mx-auto w-full space-y-12 ">
                {/* Company Profile Header */}
                {company && (
                    <div className="relative overflow-hidden rounded-lg bg-card border border-border shadow-sm p-8 lg:p-10">
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                            <div className="flex items-center gap-6">
                                <div className="h-20 w-20 rounded-lg bg-primary flex items-center justify-center text-white shadow-md shadow-blue-500/30">
                                    <Building2 className="h-10 w-10" aria-hidden="true" />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-3xl font-semibold text-foreground tracking-tight">{company.name}</h2>
                                        <Badge className={`rounded-full px-4 py-1 font-semibold uppercase text-[10px] tracking-wider ${subscription?.color} border-none shadow-none`}>
                                            {subscription?.label}
                                        </Badge>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 text-muted-foreground/70">
                                        <span className="text-sm font-bold flex items-center gap-1.5">
                                            <Layers className="h-4 w-4" />
                                            {sectorLabels[company.sector] || company.sector || 'Distribution de boissons'}
                                        </span>
                                        {company.address && (
                                            <span className="text-sm font-bold flex items-center gap-1.5">
                                                <MapPin className="h-4 w-4" />
                                                {company.address}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-6 md:gap-10 border-t md:border-t-0 md:border-l border-border pt-8 md:pt-0 md:pl-10">
                                <div className="text-center md:text-left">
                                    <p className="text-2xl font-semibold text-foreground">{formatNumber(company.users_count)}</p>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mt-1">Équipe</p>
                                </div>
                                <div className="text-center md:text-left">
                                    <p className="text-2xl font-semibold text-foreground">{formatNumber(company.depots_count)}</p>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mt-1">Dépôts</p>
                                </div>
                                <div className="text-center md:text-left">
                                    <p className="text-2xl font-semibold text-foreground">{formatNumber(company.products_count)}</p>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mt-1">Articles</p>
                                </div>
                            </div>
                        </div>
                        {/* Decorative background circle */}
                        <div className="absolute -right-16 -top-16 h-64 w-64 bg-muted/50 rounded-full opacity-50" />
                    </div>
                )}

                {/* Settings Grid */}
                <div className="grid gap-6">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground/70 pl-4">Préférences du Système</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {visibleSections.map((section) => (
                            <Link
                                key={section.href}
                                href={section.href}
                                className="group relative flex items-center gap-5 p-6 rounded-xl bg-card border border-border shadow-sm hover:border-border hover:bg-muted/30 transition-colors"
                            >
                                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md ${section.color}`}>
                                    <section.icon className="h-6 w-6" aria-hidden="true" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-foreground text-base tracking-tight">{section.title}</p>
                                    <p className="text-sm font-medium text-muted-foreground/70 mt-0.5 line-clamp-1">{section.description}</p>
                                </div>
                                <div className="h-10 w-10 rounded-xl bg-muted/50 items-center justify-center text-muted-foreground/70 group-hover:bg-primary group-hover:text-white transition-colors hidden md:flex">
                                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Quick Info/Help */}
                <div className="rounded-lg bg-primary p-10 text-white relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="space-y-4 max-w-lg">
                            <h3 className="text-2xl font-semibold tracking-tight">Besoin d&apos;aide pour configurer B-Stock ?</h3>
                            <p className="text-muted-foreground/70 font-medium leading-relaxed">
                                Notre guide d&apos;utilisation explique pas à pas la gestion du stock, des ventes et de la caisse.
                            </p>
                            <Button asChild className="rounded-md h-12 px-8 bg-card text-foreground hover:bg-muted transition-colors font-semibold shadow-md">
                                <Link href="/guide">Accéder à la documentation</Link>
                            </Button>
                        </div>
                        <div className="h-32 w-32 rounded-lg bg-card/10 flex items-center justify-center backdrop-blur-sm">
                            <Settings className="h-16 w-16 text-white/50" aria-hidden="true" />
                        </div>
                    </div>
                    {/* Dark gradient overlap */}
                    <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-600/20 to-transparent pointer-events-none" />
                </div>
            </main>

        </div>
    )
}
