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
import { Plus, Car, User, Gauge, Truck } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/states'
import { formatNumber } from '@/lib/format'
import { VehicleRowActions } from './vehicle-row-actions'

interface Vehicle {
    id: string
    plate_number: string
    name: string | null
    capacity_cases: number | null
    driver_name: string | null
    driver_phone: string | null
    is_active: boolean
    tours_count: number
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

    const statsData = [
        {
            title: "Flotte Totale",
            value: vehicles.length,
            description: "Camions & Tricycles",
            icon: Truck,
            color: "bg-blue-500/10 text-blue-600",
        },
        {
            title: "En Service",
            value: activeVehicles.length,
            description: "Véhicules opérationnels",
            icon: Gauge,
            color: "bg-emerald-500/10 text-emerald-600",
        },
        {
            title: "Capacité Mobile",
            value: totalCapacity,
            description: "Casiers transportables",
            icon: Car,
            color: "bg-indigo-500/10 text-indigo-600",
        }
    ]

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Gestion de Flotte"
                description="Suivez et optimisez vos moyens de livraison"
                actions={
                    <Button asChild className="rounded-md h-11 px-6 bg-blue-600 hover:bg-blue-700 transition-all active:scale-95 font-bold">
                        <Link href="/dashboard/vehicles/new">
                            <Plus className="h-5 w-5 mr-2" />
                            Nouveau véhicule
                        </Link>
                    </Button>
                }
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                {/* Stats Grid */}
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {statsData.map((stat) => (
                        <div
                            key={stat.title}
                            className="group relative overflow-hidden rounded-lg bg-white p-8 shadow-sm border border-slate-200/60 hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-500"
                        >
                            <div className="relative z-10 flex flex-col gap-6">
                                <div className={`flex h-14 w-14 items-center justify-center rounded-md ${stat.color} transition-transform group-hover:scale-110 duration-500`}>
                                    <stat.icon className="h-7 w-7" />
                                </div>
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">{stat.title}</p>
                                    <div className="text-3xl font-semibold text-slate-950 tracking-tight">{formatNumber(stat.value)}</div>
                                    <p className="text-sm font-bold text-slate-400 mt-2">{stat.description}</p>
                                </div>
                            </div>
                            <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-slate-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700" />
                        </div>
                    ))}
                </div>

                {/* Vehicles Table */}
                <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-8 py-8 border-b border-slate-100">
                        <h3 className="text-2xl font-semibold text-slate-950 tracking-tight">Registre des Véhicules</h3>
                        <p className="text-sm font-medium text-slate-400 mt-1">Détails techniques et affectations chauffeurs</p>
                    </div>

                    <div className="p-2">
                        {vehicles.length === 0 ? (
                            <EmptyState
                                className="m-2 py-16"
                                title="Aucun véhicule enregistré"
                                description="Ajoutez vos camions ou tricycles pour commencer à planifier vos tournées."
                                action={{ label: 'Ajouter un véhicule', href: '/dashboard/vehicles/new' }}
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50/50">
                                        <TableRow className="border-none hover:bg-transparent">
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-8">Désignation</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Immatriculation</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Chauffeur Assigné</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Capacité (u)</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Usage (Tours)</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Statut</TableHead>
                                            <TableHead className="py-5 pr-8"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {vehicles.map((v) => (
                                            <TableRow key={v.id} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <TableCell className="py-6 pl-8">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-12 w-12 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-white group-hover:shadow group-hover:scale-105 transition-all">
                                                            <Truck className="h-6 w-6" />
                                                        </div>
                                                        <span className="font-semibold text-slate-950 text-base tracking-tight leading-tight">
                                                            {v.name || 'Véhicule Logistique'}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-6">
                                                    <code className="text-[11px] font-semibold bg-slate-100 px-3 py-1.5 rounded-xl text-slate-600 tracking-wider">
                                                        {v.plate_number.toUpperCase()}
                                                    </code>
                                                </TableCell>
                                                <TableCell className="py-6">
                                                    {v.driver_name ? (
                                                        <div className="flex flex-col">
                                                            <span className="font-semibold text-slate-700 text-sm flex items-center gap-2">
                                                                <User className="h-3.5 w-3.5 text-blue-500" />
                                                                {v.driver_name}
                                                            </span>
                                                            {v.driver_phone && (
                                                                <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                                                                    {v.driver_phone}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-300 font-bold italic text-xs">Non assigné</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-6 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-base font-semibold text-slate-950 tracking-tight">
                                                            {v.capacity_cases ? formatNumber(v.capacity_cases) : '—'}
                                                        </span>
                                                        <span className="text-[10px] font-semibold uppercase text-slate-400 tracking-tighter">Casiers</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-6 text-right">
                                                    <span className="text-base font-semibold text-slate-600 tracking-tight">
                                                        {formatNumber(v.tours_count)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-6">
                                                    <Badge className={`rounded-full px-4 py-1 font-semibold uppercase text-[9px] tracking-wider border-none shadow-none ${v.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                                                        }`}>
                                                        {v.is_active ? 'Actif' : 'Indisponible'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="py-6 pr-8 text-right">
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
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
