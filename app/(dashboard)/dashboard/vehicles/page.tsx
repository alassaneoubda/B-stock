import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Plus, Truck, Gauge, Package } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/states'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { formatNumber } from '@/lib/format'
import { VehicleRowActions } from './vehicle-row-actions'

interface Vehicle {
    id: string
    plate_number: string
    name: string | null
    vehicle_type?: string | null
    capacity_cases: number | null
    driver_name: string | null
    driver_phone: string | null
    is_active: boolean
    tours_count: number
}

const VEHICLE_TYPE_LABEL: Record<string, string> = {
    truck: 'Camion',
    van: 'Fourgonnette',
    tricycle: 'Tricycle',
}

async function getVehicles(companyId: string): Promise<Vehicle[]> {
        const vehicles = await sql`
      SELECT
        v.*,
        COUNT(dt.id) as tours_count
      FROM vehicles v
      LEFT JOIN delivery_tours dt ON dt.vehicle_id = v.id
      WHERE v.company_id = ${companyId}
      GROUP BY v.id
      ORDER BY v.name, v.plate_number
    `
        return vehicles as Vehicle[]
}

export default async function VehiclesPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const vehicles = await getVehicles(companyId)

    const activeVehicles = vehicles.filter(v => v.is_active)
    const totalCapacity = vehicles.reduce((acc, v) => acc + (Number(v.capacity_cases) || 0), 0)

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Véhicules"
                description="Votre flotte de livraison et ses chauffeurs"
                actions={
                    <Button asChild variant="brand" size="sm" className="h-9">
                        <Link href="/dashboard/vehicles/new">
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Nouveau véhicule</span>
                            <span className="sm:hidden">Ajouter</span>
                        </Link>
                    </Button>
                }
            />

            <PageShell>
                <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard label="Flotte" value={formatNumber(vehicles.length)} hint="Camions, fourgonnettes et tricycles" icon={Truck} />
                    <StatCard
                        label="En service"
                        value={formatNumber(activeVehicles.length)}
                        hint="Disponibles pour une tournée"
                        icon={Gauge}
                        tone="success"
                    />
                    <StatCard label="Capacité totale" value={formatNumber(totalCapacity)} hint="Casiers transportables" icon={Package} tone="info" />
                </div>

                {vehicles.length === 0 ? (
                    <EmptyState
                        icon={Truck}
                        title="Aucun véhicule enregistré"
                        description="Ajoutez vos camions ou tricycles pour commencer à planifier vos tournées."
                        action={{ label: 'Ajouter un véhicule', href: '/dashboard/vehicles/new' }}
                    />
                ) : (
                    <Panel
                        title="Registre des véhicules"
                        description={`${formatNumber(vehicles.length)} véhicule${vehicles.length > 1 ? 's' : ''}`}
                    >
                        {/* Mobile : cartes */}
                        <ul className="divide-y divide-border md:hidden">
                            {vehicles.map((v) => (
                                <li key={v.id} className="flex items-start gap-3 px-4 py-3">
                                    <Link
                                        href={`/dashboard/vehicles/${v.id}/edit`}
                                        className="min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="truncate text-sm font-medium text-foreground">{v.name || 'Véhicule'}</span>
                                            <StatusBadge label={v.is_active ? 'En service' : 'Indisponible'} tone={v.is_active ? 'success' : 'default'} />
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            <span className="tabular">{v.plate_number.toUpperCase()}</span>
                                            {' · '}
                                            {v.driver_name || 'Aucun chauffeur'}
                                        </p>
                                        <p className="tabular mt-0.5 text-xs text-muted-foreground">
                                            {v.capacity_cases ? `${formatNumber(v.capacity_cases)} casiers` : 'Capacité non renseignée'}
                                            {' · '}
                                            {formatNumber(v.tours_count)} tournée{Number(v.tours_count) > 1 ? 's' : ''}
                                        </p>
                                    </Link>
                                    <VehicleRowActions
                                        vehicleId={v.id}
                                        label={v.name || v.plate_number.toUpperCase()}
                                        toursCount={Number(v.tours_count) || 0}
                                    />
                                </li>
                            ))}
                        </ul>

                        {/* Desktop : tableau */}
                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="pl-5">Véhicule</TableHead>
                                        <TableHead>Immatriculation</TableHead>
                                        <TableHead>Chauffeur</TableHead>
                                        <TableHead className="text-right">Capacité (casiers)</TableHead>
                                        <TableHead className="text-right">Tournées</TableHead>
                                        <TableHead>Statut</TableHead>
                                        <TableHead className="w-12 pr-5">
                                            <span className="sr-only">Actions</span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {vehicles.map((v) => (
                                        <TableRow key={v.id} className="transition-colors hover:bg-muted/40">
                                            <TableCell className="pl-5">
                                                <Link
                                                    href={`/dashboard/vehicles/${v.id}/edit`}
                                                    className="group/link flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                                        <Truck className="h-4 w-4" aria-hidden="true" />
                                                    </span>
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-medium text-foreground group-hover/link:underline">
                                                            {v.name || 'Véhicule'}
                                                        </span>
                                                        {v.vehicle_type && VEHICLE_TYPE_LABEL[v.vehicle_type] && (
                                                            <span className="block text-xs text-muted-foreground">{VEHICLE_TYPE_LABEL[v.vehicle_type]}</span>
                                                        )}
                                                    </span>
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                <span className="tabular rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                                                    {v.plate_number.toUpperCase()}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                {v.driver_name ? (
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm text-foreground">{v.driver_name}</p>
                                                        {v.driver_phone && (
                                                            <p className="tabular text-xs text-muted-foreground">{v.driver_phone}</p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-muted-foreground">Non assigné</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="tabular text-right">
                                                {v.capacity_cases ? formatNumber(v.capacity_cases) : <span className="text-muted-foreground">—</span>}
                                            </TableCell>
                                            <TableCell className="tabular text-right text-muted-foreground">
                                                {formatNumber(v.tours_count)}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge label={v.is_active ? 'En service' : 'Indisponible'} tone={v.is_active ? 'success' : 'default'} />
                                            </TableCell>
                                            <TableCell className="pr-5 text-right">
                                                <VehicleRowActions
                                                    vehicleId={v.id}
                                                    label={v.name || v.plate_number.toUpperCase()}
                                                    toursCount={Number(v.tours_count) || 0}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </Panel>
                )}
            </PageShell>
        </div>
    )
}
