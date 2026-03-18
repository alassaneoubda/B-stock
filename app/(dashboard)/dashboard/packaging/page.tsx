import { auth } from '@/lib/auth'
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
import { Plus, MoreHorizontal, BoxesIcon, Edit, Trash2, ArrowLeftRight, RotateCcw, Box, PackageOpen } from 'lucide-react'
import Link from 'next/link'

interface PackagingType {
    id: string
    name: string
    units_per_case: number | null
    is_returnable: boolean
    deposit_price: number | null
    stock_quantity: number
    equivalences: string[]
}

async function getPackagingTypes(companyId: string): Promise<PackagingType[]> {
    try {
        const types = await sql`
      SELECT
        pt.*,
        COALESCE(SUM(ps.quantity), 0) as stock_quantity
      FROM packaging_types pt
      LEFT JOIN packaging_stock ps ON ps.packaging_type_id = pt.id
      WHERE pt.company_id = ${companyId}
      GROUP BY pt.id
      ORDER BY pt.name
    `

        const equivalences = await sql`
      SELECT pe.packaging_type_a, pe.packaging_type_b, pta.name as name_a, ptb.name as name_b
      FROM packaging_equivalences pe
      JOIN packaging_types pta ON pe.packaging_type_a = pta.id
      JOIN packaging_types ptb ON pe.packaging_type_b = ptb.id
      WHERE pe.company_id = ${companyId}
    `

        return (types as PackagingType[]).map((pt) => ({
            ...pt,
            equivalences: (equivalences as Array<{
                packaging_type_a: string;
                packaging_type_b: string;
                name_a: string;
                name_b: string;
            }>)
                .filter((eq) => eq.packaging_type_a === pt.id || eq.packaging_type_b === pt.id)
                .map((eq) => (eq.packaging_type_a === pt.id ? eq.name_b : eq.name_a)),
        }))
    } catch {
        return []
    }
}

export default async function PackagingPage() {
    const session = await auth()
    const companyId = session?.user?.companyId || ''
    const packagingTypes = await getPackagingTypes(companyId)

    const totalStock = packagingTypes.reduce((acc, pt) => acc + Number(pt.stock_quantity), 0)
    const returnableCount = packagingTypes.filter(pt => pt.is_returnable).length

    const statsData = [
        {
            title: "Types d'Emballages",
            value: packagingTypes.length,
            description: "Modèles configurés",
            icon: Box,
            color: "bg-blue-500/10 text-blue-600",
        },
        {
            title: "Articles Consignés",
            value: returnableCount,
            description: "Avec suivi de caution",
            icon: RotateCcw,
            color: "bg-amber-500/10 text-amber-600",
        },
        {
            title: "Stock Vides Total",
            value: totalStock,
            description: "Casiers disponibles",
            icon: PackageOpen,
            color: "bg-emerald-500/10 text-emerald-600",
        }
    ]

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Bibliothèque d'Emballages"
                description="Référentiel des formats de conditionnement et consignes"
                actions={
                    <div className="flex gap-3">
                        <Button variant="outline" asChild className="rounded-md h-11 px-6 border-slate-200 font-bold hover:bg-white hover:shadow-md transition-all">
                            <Link href="/dashboard/packaging/equivalences">
                                <ArrowLeftRight className="h-5 w-5 mr-2 text-slate-400" />
                                Équivalences
                            </Link>
                        </Button>
                        <Button asChild className="rounded-md h-11 px-6 bg-blue-600 hover:bg-blue-700 transition-all active:scale-95 font-bold">
                            <Link href="/dashboard/packaging/new">
                                <Plus className="h-5 w-5 mr-2" />
                                Nouvel emballage
                            </Link>
                        </Button>
                    </div>
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
                                    <div className="text-3xl font-semibold text-slate-950 tracking-tight">{stat.value}</div>
                                    <p className="text-sm font-bold text-slate-400 mt-2">{stat.description}</p>
                                </div>
                            </div>
                            <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-slate-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700" />
                        </div>
                    ))}
                </div>

                {/* Packaging Table */}
                <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-8 py-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                        <div>
                            <h3 className="text-2xl font-semibold text-slate-950 tracking-tight">Catalogue Formats</h3>
                            <p className="text-sm font-medium text-slate-400 mt-1">Spécifications techniques et valeurs de consigne</p>
                        </div>
                    </div>

                    <div className="p-2">
                        {packagingTypes.length === 0 ? (
                            <div className="text-center py-24 flex flex-col items-center">
                                <div className="h-24 w-24 rounded-full bg-slate-50 flex items-center justify-center mb-6">
                                    <BoxesIcon className="h-10 w-10 text-slate-300" />
                                </div>
                                <h3 className="text-xl font-semibold text-slate-950">Aucun emballage configuré</h3>
                                <p className="mt-2 text-slate-400 font-medium max-w-xs mx-auto">
                                    Définissez vos types de casiers (12×33cl, 24×50cl...) pour un suivi précis.
                                </p>
                                <Button className="mt-8 rounded-md h-12 px-8 bg-blue-600 hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20" asChild>
                                    <Link href="/dashboard/packaging/new">
                                        <Plus className="h-5 w-5 mr-2" />
                                        Ajouter un emballage
                                    </Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50/50">
                                        <TableRow className="border-none hover:bg-transparent">
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-8">Type de Conditionnement</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-center">Contenance</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Statut Consigne</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Valeur Unitaire</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Stock Actuel</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Équivalences Directes</TableHead>
                                            <TableHead className="py-5 pr-8"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {packagingTypes.map((pt) => (
                                            <TableRow key={pt.id} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <TableCell className="py-6 pl-8">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-12 w-12 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-white group-hover:shadow group-hover:scale-105 transition-all">
                                                            <Box className="h-6 w-6" />
                                                        </div>
                                                        <span className="font-semibold text-slate-950 text-base tracking-tight leading-tight">
                                                            {pt.name}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-6 text-center">
                                                    <span className="font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl text-xs">
                                                        {pt.units_per_case || '—'} unités
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-6">
                                                    <Badge className={`rounded-full px-4 py-1 font-semibold uppercase text-[9px] tracking-wider border-none shadow-none ${pt.is_returnable ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'
                                                        }`}>
                                                        {pt.is_returnable ? 'Consigné' : 'Perdu'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="py-6 text-right">
                                                    {pt.deposit_price && Number(pt.deposit_price) > 0 ? (
                                                        <span className="font-semibold text-blue-600">
                                                            {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', minimumFractionDigits: 0 }).format(Number(pt.deposit_price))}
                                                        </span>
                                                    ) : <span className="text-slate-300 font-bold">—</span>}
                                                </TableCell>
                                                <TableCell className="py-6 text-right font-semibold text-slate-950 text-base">
                                                    {pt.stock_quantity}
                                                </TableCell>
                                                <TableCell className="py-6">
                                                    {pt.equivalences.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {pt.equivalences.map((eq) => (
                                                                <span key={eq} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-50 text-[10px] font-semibold text-blue-600 uppercase tracking-tight">
                                                                    <ArrowLeftRight className="h-2.5 w-2.5" />
                                                                    {eq}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-300 text-xs font-bold font-italic">Aucune correspondance</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-6 pr-8 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-white hover:shadow-md border border-transparent hover:border-slate-100 transition-all">
                                                                <MoreHorizontal className="h-5 w-5 text-slate-400 group-hover:text-slate-950" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-60 p-2 rounded-md border-slate-100 shadow-lg">
                                                            <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-slate-50 focus:bg-slate-50 transition-colors">
                                                                <Link href={`/dashboard/packaging/${pt.id}/edit`} className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                                                                        <Edit className="h-4 w-4" />
                                                                    </div>
                                                                    <span className="font-bold text-sm">Modifier Détails</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-blue-50 focus:bg-blue-50 transition-colors">
                                                                <Link href={`/dashboard/packaging/equivalences?add=${pt.id}`} className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                                                                        <ArrowLeftRight className="h-4 w-4" />
                                                                    </div>
                                                                    <span className="font-bold text-sm">Lier Équivalence</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <div className="h-px bg-slate-100 my-1 mx-2" />
                                                            <DropdownMenuItem className="rounded-xl cursor-pointer py-3 hover:bg-rose-50 focus:bg-rose-50 text-rose-600 group/del transition-colors">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600">
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </div>
                                                                    <span className="font-bold text-sm">Supprimer l'Entrée</span>
                                                                </div>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Helper Card */}
                <div className="rounded-lg bg-slate-900 p-10 text-white relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col md:flex-row items-start justify-between gap-8">
                        <div className="space-y-4 max-w-lg">
                            <div className="h-12 w-12 rounded-md bg-blue-600 flex items-center justify-center mb-6 shadow-lg shadow-blue-500/30">
                                <ArrowLeftRight className="h-6 w-6" />
                            </div>
                            <h3 className="text-2xl font-semibold tracking-tight">Système d'Équivalences Intelligentes</h3>
                            <p className="text-slate-400 font-medium leading-relaxed">
                                Optimisez vos échanges de casiers entre distributeurs. Le système permet de substituer dynamiquement les contenants compatibles lors des retours clients.
                            </p>
                            <Button variant="outline" className="mt-4 rounded-xl border-slate-700 hover:bg-white hover:text-slate-950 font-semibold transition-all" asChild>
                                <Link href="/dashboard/packaging/equivalences">Gérer les règles métier</Link>
                            </Button>
                        </div>
                    </div>
                    {/* Abstract background blur */}
                    <div className="absolute top-0 right-0 w-1/3 h-full bg-blue-600/10 blur-[120px] pointer-events-none" />
                </div>
            </main>
        </div>
    )
}
