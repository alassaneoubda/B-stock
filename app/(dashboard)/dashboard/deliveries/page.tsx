import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
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
import { Plus, MoreHorizontal, Truck, Eye, PlayCircle, CheckCircle2, Clock } from 'lucide-react'
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

type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const statusConfig: Record<string, { label: string; tone: Tone }> = {
    planned: { label: 'Planifiée', tone: 'default' },
    loading: { label: 'Chargement', tone: 'warning' },
    in_progress: { label: 'En route', tone: 'brand' },
    completed: { label: 'Terminée', tone: 'success' },
    cancelled: { label: 'Annulée', tone: 'danger' },
}

function getStatus(status: string) {
    return statusConfig[status] || { label: status, tone: 'default' as Tone }
}

function formatTourDate(value: string) {
    return new Date(value).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
}

function formatCreatedTime(value: string) {
    return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function TourProgress({ delivered, total }: { delivered: number; total: number }) {
    const progress = total > 0 ? Math.round((delivered / total) * 100) : 0
    return (
        <div className="flex min-w-[140px] flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular">
                    {formatNumber(delivered)} / {formatNumber(total)} arrêts
                </span>
                <span className={`tabular font-medium ${progress === 100 ? 'text-success' : 'text-foreground'}`}>{progress}%</span>
            </div>
            <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progression des livraisons"
            >
                <div
                    className={`h-full rounded-full ${progress === 100 ? 'bg-success' : 'bg-brand'}`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    )
}

export default async function DeliveriesPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const [stats, tours] = await Promise.all([
        getDeliveryStats(companyId),
        getDeliveryTours(companyId),
    ])

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Livraisons"
                description="Suivi des tournées de distribution"
                actions={
                    <Button asChild variant="brand" size="sm" className="h-9">
                        <Link href="/dashboard/deliveries/new">
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Nouvelle tournée</span>
                            <span className="sm:hidden">Tournée</span>
                        </Link>
                    </Button>
                }
            />

            <PageShell>
                <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard label="Planifiées" value={formatNumber(stats.planned)} hint="Tournées à venir" icon={Clock} />
                    <StatCard
                        label="En cours"
                        value={formatNumber(stats.inProgress)}
                        hint="Actuellement en route"
                        icon={Truck}
                        tone="brand"
                    />
                    <StatCard
                        label="Terminées aujourd'hui"
                        value={formatNumber(stats.completedToday)}
                        hint="Tournées clôturées ce jour"
                        icon={CheckCircle2}
                        tone="success"
                    />
                </div>

                <Panel
                    title="Tournées"
                    description="Les 50 tournées les plus récentes"
                    action={{ label: 'Gérer les véhicules', href: '/dashboard/vehicles' }}
                >
                    {tours.length === 0 ? (
                        <div className="p-5">
                            <EmptyState
                                icon={Truck}
                                title="Aucune tournée planifiée"
                                description="Planifiez une tournée en assignant un véhicule et un chauffeur."
                                action={{ label: 'Planifier une tournée', href: '/dashboard/deliveries/new' }}
                            />
                        </div>
                    ) : (
                        <>
                            {/* Mobile : liste de cartes */}
                            <ul className="divide-y divide-border md:hidden">
                                {tours.map((tour) => {
                                    const statusInfo = getStatus(tour.status)
                                    return (
                                        <li key={tour.id}>
                                            <Link
                                                href={`/dashboard/deliveries/${tour.id}`}
                                                className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium capitalize text-foreground">
                                                            {formatTourDate(tour.tour_date)}
                                                        </p>
                                                        <p className="truncate text-xs text-muted-foreground">
                                                            {tour.vehicle_name
                                                                ? `${tour.vehicle_name}${tour.vehicle_plate ? ` · ${tour.vehicle_plate.toUpperCase()}` : ''}`
                                                                : 'Véhicule non assigné'}
                                                            {' · '}
                                                            {tour.driver_name || 'Chauffeur à définir'}
                                                        </p>
                                                    </div>
                                                    <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
                                                </div>
                                                <TourProgress delivered={Number(tour.delivered_count)} total={Number(tour.stops_count)} />
                                            </Link>
                                        </li>
                                    )
                                })}
                            </ul>

                            {/* Bureau : tableau */}
                            <div className="hidden overflow-x-auto md:block">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-5">Date</TableHead>
                                            <TableHead>Véhicule</TableHead>
                                            <TableHead>Chauffeur</TableHead>
                                            <TableHead>Progression</TableHead>
                                            <TableHead>Statut</TableHead>
                                            <TableHead className="w-12 pr-5">
                                                <span className="sr-only">Actions</span>
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {tours.map((tour) => {
                                            const statusInfo = getStatus(tour.status)
                                            return (
                                                <TableRow key={tour.id} className="transition-colors hover:bg-muted/40">
                                                    <TableCell className="pl-5">
                                                        <Link
                                                            href={`/dashboard/deliveries/${tour.id}`}
                                                            className="flex flex-col rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        >
                                                            <span className="text-sm font-medium capitalize text-foreground hover:underline">
                                                                {formatTourDate(tour.tour_date)}
                                                            </span>
                                                            <span className="tabular text-xs text-muted-foreground">
                                                                Créée à {formatCreatedTime(tour.created_at)}
                                                            </span>
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>
                                                        {tour.vehicle_name ? (
                                                            <div className="flex flex-col">
                                                                <span className="text-sm text-foreground">{tour.vehicle_name}</span>
                                                                {tour.vehicle_plate && (
                                                                    <span className="font-mono text-xs text-muted-foreground">
                                                                        {tour.vehicle_plate.toUpperCase()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-sm text-muted-foreground">Non assigné</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`text-sm ${tour.driver_name ? 'text-foreground' : 'text-muted-foreground'}`}>
                                                            {tour.driver_name || 'À définir'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <TourProgress delivered={Number(tour.delivered_count)} total={Number(tour.stops_count)} />
                                                    </TableCell>
                                                    <TableCell>
                                                        <StatusBadge label={statusInfo.label} tone={statusInfo.tone} />
                                                    </TableCell>
                                                    <TableCell className="pr-5 text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon-sm" aria-label="Actions de la tournée">
                                                                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-52">
                                                                <DropdownMenuItem asChild>
                                                                    <Link href={`/dashboard/deliveries/${tour.id}`}>
                                                                        <Eye aria-hidden="true" />
                                                                        Voir la tournée
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                                {tour.status === 'planned' && (
                                                                    <DropdownMenuItem asChild>
                                                                        <Link href={`/dashboard/deliveries/${tour.id}/load`}>
                                                                            <PlayCircle aria-hidden="true" />
                                                                            Démarrer le chargement
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
                        </>
                    )}
                </Panel>
            </PageShell>
        </div>
    )
}
