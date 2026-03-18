import { auth } from '@/lib/auth'
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

async function getCompanyInfo(companyId: string) {
    try {
        const company = await sql`
      SELECT c.*, 
        (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.is_active = true) as users_count,
        (SELECT COUNT(*) FROM depots d WHERE d.company_id = c.id) as depots_count,
        (SELECT COUNT(*) FROM products p WHERE p.company_id = c.id AND p.is_active = true) as products_count
      FROM companies c WHERE c.id = ${companyId}
    `
        return company[0] || null
    } catch {
        return null
    }
}

const sectorLabels: Record<string, string> = {
    distributor: 'Distributeur officiel',
    wholesaler: 'Grossiste',
    semi_wholesaler: 'Demi-grossiste',
    depot: 'Dépôt de quartier',
}

const subscriptionLabels: Record<string, { label: string; color: string }> = {
    trialing: { label: 'Essai gratuit', color: 'bg-blue-50 text-blue-600' },
    active: { label: 'Abonnement Actif', color: 'bg-emerald-50 text-emerald-600' },
    past_due: { label: 'Paiement en retard', color: 'bg-rose-50 text-rose-600' },
    canceled: { label: 'Compte Suspendu', color: 'bg-slate-100 text-slate-500' },
}

const settingsSections = [
    {
        href: '/dashboard/settings/company',
        icon: Building2,
        title: 'Informations Entreprise',
        description: 'Identité commerciale, secteur et coordonnées',
        color: 'bg-blue-500/10 text-blue-600'
    },
    {
        href: '/dashboard/settings/users',
        icon: UserCog,
        title: 'Collaborateurs & Rôles',
        description: 'Gestion des accès et permissions d\'équipe',
        color: 'bg-emerald-500/10 text-emerald-600'
    },
    {
        href: '/dashboard/settings/subscription',
        icon: CreditCard,
        title: 'Facturation & Plan',
        description: 'Suivi de l\'abonnement et historique de paiement',
        color: 'bg-indigo-500/10 text-indigo-600'
    },
    {
        href: '/dashboard/settings/notifications',
        icon: Bell,
        title: 'Alertes & Notifications',
        description: 'Configuration des seuils de stock et rappels',
        color: 'bg-amber-500/10 text-amber-600'
    },
    {
        href: '/dashboard/settings/security',
        icon: Shield,
        title: 'Sécurité & Accès',
        description: 'Authentification forte et journal de sécurité',
        color: 'bg-rose-500/10 text-rose-600'
    },
]

export default async function SettingsPage() {
    const session = await auth()
    const companyId = session?.user?.companyId || ''
    const company = await getCompanyInfo(companyId)
    const subscription = subscriptionLabels[company?.subscription_status || 'trialing']

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Configuration de l'Espace"
                description="Personnalisez votre plateforme B-Stock"
            />

            <main className="flex-1 p-4 lg:p-6 max-w-5xl mx-auto w-full space-y-12 ">
                {/* Company Profile Header */}
                {company && (
                    <div className="relative overflow-hidden rounded-lg bg-white border border-slate-200/60 shadow-sm p-8 lg:p-10">
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                            <div className="flex items-center gap-6">
                                <div className="h-20 w-20 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30">
                                    <Building2 className="h-10 w-10" />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-3xl font-semibold text-slate-950 tracking-tight">{company.name}</h2>
                                        <Badge className={`rounded-full px-4 py-1 font-semibold uppercase text-[10px] tracking-wider ${subscription?.color} border-none shadow-none`}>
                                            {subscription?.label}
                                        </Badge>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-4 text-slate-400">
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

                            <div className="grid grid-cols-3 gap-6 md:gap-10 border-t md:border-t-0 md:border-l border-slate-100 pt-8 md:pt-0 md:pl-10">
                                <div className="text-center md:text-left">
                                    <p className="text-2xl font-semibold text-slate-950">{company.users_count || 0}</p>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-1">Équipe</p>
                                </div>
                                <div className="text-center md:text-left">
                                    <p className="text-2xl font-semibold text-slate-950">{company.depots_count || 0}</p>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-1">Dépôts</p>
                                </div>
                                <div className="text-center md:text-left">
                                    <p className="text-2xl font-semibold text-slate-950">{company.products_count || 0}</p>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mt-1">Articles</p>
                                </div>
                            </div>
                        </div>
                        {/* Decorative background circle */}
                        <div className="absolute -right-16 -top-16 h-64 w-64 bg-slate-50 rounded-full opacity-50" />
                    </div>
                )}

                {/* Settings Grid */}
                <div className="grid gap-6">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400 pl-4">Préférences du Système</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {settingsSections.map((section, i) => (
                            <Link
                                key={section.href}
                                href={section.href}
                                className="group relative flex items-center gap-5 p-6 rounded-[2rem] bg-white border border-slate-200/60 shadow-sm hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-300"
                            >
                                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-md ${section.color} transition-transform group-hover:scale-110 duration-500`}>
                                    <section.icon className="h-6 w-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-950 text-base tracking-tight">{section.title}</p>
                                    <p className="text-sm font-medium text-slate-400 mt-0.5 line-clamp-1">{section.description}</p>
                                </div>
                                <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all transform group-hover:block hidden md:flex">
                                    <ChevronRight className="h-5 w-5" />
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Quick Info/Help */}
                <div className="rounded-lg bg-slate-900 p-10 text-white relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="space-y-4 max-w-lg">
                            <h3 className="text-2xl font-semibold tracking-tight">Besoin d'aide pour configurer B-Stock ?</h3>
                            <p className="text-slate-400 font-medium leading-relaxed">
                                Notre centre d'aide contient des guides détaillés pour optimiser votre gestion de stock et paramétrer vos flux de facturation.
                            </p>
                            <Button className="rounded-md h-12 px-8 bg-white text-slate-950 hover:bg-slate-200 transition-all font-semibold shadow-md">
                                Accéder à la documentation
                            </Button>
                        </div>
                        <div className="h-32 w-32 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform duration-700">
                            <Settings className="h-16 w-16 text-white/50 animate-spin-slow" />
                        </div>
                    </div>
                    {/* Dark gradient overlap */}
                    <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-600/20 to-transparent pointer-events-none" />
                </div>
            </main>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .animate-spin-slow {
                    animation: spin-slow 12s linear infinite;
                }
            `}} />
        </div>
    )
}
