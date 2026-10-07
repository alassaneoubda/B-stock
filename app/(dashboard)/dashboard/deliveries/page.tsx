import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    Plus,
    MoreHorizontal,
    Truck,
    Eye,
    PlayCircle,
    CheckCircle2,
    Clock,
    MapPin,
    Calendar,
    Navigation,
    User,
    ArrowRight,
    XCircle,
} from 'lucide-react'
import { formatNumber } from '@/lib/format'
import Link from 'next/link'

interface DeliveryTour {
    id: string
    tour_date: string
    status: string
    driver_name: string | null
    vehicle_name: string | null
    vehicle_plate: string | null
    stops_count: number
    delivered_count: number
    created_at: string
}

// Pas de try/catch : une panne SQL doit remonter à error.tsx plutôt que
// d'afficher des compteurs à zéro et une liste vide trompeuse.
async function getDeliveryStats(companyId: string) {
    const [row] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'planned') AS planned,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'completed' AND DATE(completed_at) = CURRENT_DATE) AS completed_today
      FROM delivery_tours
      WHERE company_id = ${companyId}
    `
    return {
        planned: Number(row?.planned || 0),
        inProgress: Number(row?.in_progress || 0),
        completedToday: Number(row?.completed_today || 0),
    }
}

async function getDeliveryTours(companyId: string): Promise<DeliveryTour[]> {
        const tours = await sql`
      SELECT
        dt.id,
        dt.tour_date,
        dt.status,
        dt.driver_name,
        dt.created_at,
        v.name as vehicle_name,
        v.plate_number as vehicle_plate,
        COUNT(ts.id) as stops_count,
        COUNT(ts.id) FILTER (WHERE ts.status = 'delivered') as delivered_count
      FROM delivery_tours dt
      LEFT JOIN vehicles v ON dt.vehicle_id = v.id AND v.company_id = dt.company_id
      LEFT JOIN tour_stops ts ON ts.delivery_tour_id = dt.id
      WHERE dt.company_id = ${companyId}
      GROUP BY dt.id, v.name, v.plate_number
      ORDER BY dt.tour_date DESC, dt.created_at DESC
      LIMIT 50
    `
        return tours as DeliveryTour[]
}

const statusConfig: Record<string, { label: string; bg: string; text: string; icon: any }> = {
    planned: { label: 'Planifiée', bg: 'bg-muted/50', text: 'text-muted-foreground', icon: Clock },
    loading: { label: 'Chargement', bg: 'bg-warning-soft', text: 'text-warning-foreground', icon: PlayCircle },
    in_progress: { label: 'En route', bg: 'bg-brand-soft', text: 'text-brand-strong', icon: Navigation },
    completed: { label: 'Terminée', bg: 'bg-success-soft', text: 'text-success', icon: CheckCircle2 },
    cancelled: { label: 'Annulée', bg: 'bg-destructive/10', text: 'text-destructive', icon: XCircle },
}

export default async function DeliveriesPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const [stats, tours] = await Promise.all([
        getDeliveryStats(companyId),
        getDeliveryTours(companyId),
    ])

    const statsCards = [
        {
            title: "Planifiées",
            value: stats.planned,
            description: "Tournées à venir",
            icon: Clock,
            color: "text-muted-foreground",
            bg: "bg-muted-foreground/20"
        },
        {
            title: "En cours",
            value: stats.inProgress,
            description: "Actuellement en route",
            icon: Truck,
            color: "text-brand-strong",
            bg: "bg-primary/10"
        },
        {
            title: "Terminées",
            value: stats.completedToday,
            description: "Livraisons aujourd'hui",
            icon: CheckCircle2,
            color: "text-success",
            bg: "bg-success/10"
        }
    ]

    return (
        <div className="flex flex-col min-h-screen bg-muted/30">
            <DashboardHeader
                title="Logistique & Livraisons"
                description="Suivi en temps réel des tournées de distribution"
                actions={
                    <Button asChild className="rounded-md h-11 px-6 bg-primary hover:bg-primary transition-all active:scale-95 font-bold">
                        <Link href="/dashboard/deliveries/new">
                            <Plus className="h-5 w-5 mr-2" />
                            Nouvelle tournée
                        </Link>
                    </Button>
                }
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                {/* Stats Grid */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {statsCards.map((stat) => (
                        <div
                            key={stat.title}
                            className="group relative overflow-hidden rounded-lg bg-card p-8 shadow-sm border border-border hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-500"
                        >
                            <div className="relative z-10 flex flex-col gap-6">
                                <div className={`flex h-14 w-14 items-center justify-center rounded-md ${stat.bg} ${stat.color} transition-transform group-hover:scale-110 duration-500`}>
                                    <stat.icon className="h-7 w-7" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">{stat.title}</p>
                                    <div className="text-3xl font-semibold text-foreground tracking-tight">{formatNumber(stat.value)}</div>
                                    <p className="text-sm font-bold text-muted-foreground/70 mt-2">{stat.description}</p>
                                </div>
                            </div>
                            <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-muted/50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700" />
                        </div>
                    ))}
                </div>

                {/* Tours Listing */}
                <div className="rounded-lg bg-card border border-border shadow-sm overflow-hidden">
                    <div className="px-8 py-8 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-2xl font-semibold text-foreground tracking-tight">Registre des Tournées</h3>
                            <p className="text-sm font-medium text-muted-foreground/70 mt-1">Suivi détaillé des opérations logistiques</p>
                        </div>
                        <Button variant="ghost" className="rounded-md h-11 px-6 font-bold text-brand-strong hover:bg-brand-soft transition-all self-start" asChild>
                            <Link href="/dashboard/vehicles" className="flex items-center gap-2">
                                Gérer les véhicules
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </div>

                    <div className="p-2">
                        {tours.length === 0 ? (
                            <div className="text-center py-24 flex flex-col items-center">
                                <div className="h-24 w-24 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                                    <Truck className="h-10 w-10 text-muted-foreground/70" />
                                </div>
                                <h3 className="text-xl font-semibold text-foreground">Aucune livraison prévue</h3>
                                <p className="mt-2 text-muted-foreground/70 font-medium max-w-xs mx-auto">
                                    Commencez par planifier une nouvelle tournée en assignant un véhicule et un chauffeur.
                                </p>
                                <Button className="mt-8 rounded-md h-12 px-8 bg-primary hover:bg-primary transition-all font-bold" asChild>
                                    <Link href="/dashboard/deliveries/new">
                                        <Plus className="h-5 w-5 mr-2" />
                                        Planifier maintenant
                                    </Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow className="border-none hover:bg-transparent">
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70 pl-8">Planning</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70">Véhicule</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70">Personnel</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70 text-center">Progression</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-muted-foreground/70">Statut</TableHead>
                                            <TableHead className="py-5 pr-8"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {tours.map((tour) => {
                                            const statusInfo = statusConfig[tour.status] || {
                                                label: tour.status,
                                                bg: 'bg-muted/50',
                                                text: 'text-muted-foreground/70',
                                                icon: Truck
                                            }
                                            const progress = Number(tour.stops_count) > 0
                                                ? Math.round((Number(tour.delivered_count) / Number(tour.stops_count)) * 100)
                                                : 0

                                            return (
                                                <TableRow key={tour.id} className="group border-b border-border hover:bg-muted/30 transition-colors">
                                                    <TableCell className="py-6 pl-8">
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-12 w-12 rounded-md bg-card flex flex-col items-center justify-center border border-border shadow-sm transition-transform group-hover:scale-105">
                                                                <Calendar className="h-4 w-4 text-brand-strong mb-0.5" />
                                                                <span className="text-[10px] font-semibold text-foreground uppercase leading-none">
                                                                    {new Date(tour.tour_date).toLocaleDateString('fr-FR', { day: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-base font-semibold text-foreground tracking-tight leading-tight">
                                                                    {new Date(tour.tour_date).toLocaleDateString('fr-FR', { weekday: 'long', month: 'short' })}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider mt-1 italic">
                                                                    {new Date(tour.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-6">
                                                        {tour.vehicle_name ? (
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-foreground/80 text-sm leading-tight flex items-center gap-2">
                                                                    <Truck className="h-3.5 w-3.5 text-muted-foreground/70" />
                                                                    {tour.vehicle_name}
                                                                </span>
                                                                <code className="text-[10px] font-semibold bg-muted px-2 py-0.5 rounded-lg text-muted-foreground mt-1 w-fit tracking-wider">
                                                                    {tour.vehicle_plate?.toUpperCase()}
                                                                </code>
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground/70 font-bold italic text-xs">Non assigné</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="py-6">
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                                                <User className="h-4 w-4 text-muted-foreground" />
                                                            </div>
                                                            <span className="font-bold text-muted-foreground text-sm">
                                                                {tour.driver_name || 'À définir'}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-6 min-w-[180px]">
                                                        <div className="flex flex-col gap-2">
                                                            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                                                                <span className="flex items-center gap-1.5">
                                                                    <MapPin className="h-3 w-3" />
                                                                    {formatNumber(tour.delivered_count)} / {formatNumber(tour.stops_count)}
                                                                </span>
                                                                <span className={progress === 100 ? 'text-success' : 'text-foreground'}>
                                                                    {progress}%
                                                                </span>
                                                            </div>
                                                            <div className="h-2 w-full bg-muted rounded-full overflow-hidden relative">
                                                                <div
                                                                    className={`h-full transition-all duration-1000 ease-out rounded-full ${progress === 100 ? 'bg-success shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-primary'
                                                                        }`}
                                                                    style={{ width: `${progress}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-6">
                                                        <Badge className={`rounded-full px-4 py-1 font-semibold uppercase text-[9px] tracking-wider border-none shadow-none flex items-center gap-2 w-fit ${statusInfo.bg} ${statusInfo.text}`}>
                                                            <statusInfo.icon className="h-3 w-3" />
                                                            {statusInfo.label}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-6 pr-8 text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" aria-label="Actions de la tournée" className="h-10 w-10 rounded-xl hover:bg-card hover:shadow-md border border-transparent hover:border-border transition-all">
                                                                    <MoreHorizontal className="h-5 w-5 text-muted-foreground/70 group-hover:text-foreground" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-60 p-2 rounded-md border-border shadow-lg">
                                                                <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-muted/50 transition-colors">
                                                                    <Link href={`/dashboard/deliveries/${tour.id}`} className="flex items-center gap-3">
                                                                        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                                                            <Eye className="h-4 w-4" />
                                                                        </div>
                                                                        <span className="font-bold text-sm">Détails Tournée</span>
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                                {tour.status === 'planned' && (
                                                                    <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-brand-soft focus:bg-brand-soft transition-colors">
                                                                        <Link href={`/dashboard/deliveries/${tour.id}/load`} className="flex items-center gap-3">
                                                                            <div className="h-8 w-8 rounded-lg bg-brand-soft flex items-center justify-center text-brand-strong">
                                                                                <PlayCircle className="h-4 w-4" />
                                                                            </div>
                                                                            <span className="font-bold text-sm text-brand-strong">Démarrer Chargement</span>
                                                                        </Link>
                                                                    </DropdownMenuItem>
                                                                )}
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
