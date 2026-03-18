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
import {
    Plus,
    MoreHorizontal,
    PackageSearch,
    Eye,
    Edit,
    Trash2,
    Phone,
    MapPin,
    Truck,
    Building2,
    Mail
} from 'lucide-react'
import Link from 'next/link'

interface Supplier {
    id: string
    name: string
    type: string | null
    contact_name: string | null
    phone: string | null
    email: string | null
    address: string | null
    orders_count: number
    created_at: string
}

async function getSuppliers(companyId: string): Promise<Supplier[]> {
    try {
        const suppliers = await sql`
      SELECT
        s.*,
        COUNT(po.id) as orders_count
      FROM suppliers s
      LEFT JOIN purchase_orders po ON po.supplier_id = s.id
      WHERE s.company_id = ${companyId}
      GROUP BY s.id
      ORDER BY s.name
    `
        return suppliers as Supplier[]
    } catch {
        return []
    }
}

const typeLabels: Record<string, string> = {
    manufacturer: 'Fabricant',
    distributor: 'Distributeur',
    wholesaler: 'Grossiste',
}

export default async function SuppliersPage() {
    const session = await auth()
    const companyId = session?.user?.companyId || ''
    const suppliers = await getSuppliers(companyId)

    const statsData = [
        {
            title: "Total Fournisseurs",
            value: suppliers.length,
            description: "Partenaires enregistrés",
            icon: Building2,
            color: "bg-blue-500/10 text-blue-600",
        },
        {
            title: "Fabricants",
            value: suppliers.filter(s => s.type === 'manufacturer').length,
            description: "Direct usine (Solibra...)",
            icon: Truck,
            color: "bg-emerald-500/10 text-emerald-600",
        },
        {
            title: "Distributeurs",
            value: suppliers.filter(s => s.type === 'distributor').length,
            description: "Grossistes & Revendeurs",
            icon: PackageSearch,
            color: "bg-indigo-500/10 text-indigo-600",
        }
    ]

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Réseau Fournisseurs"
                description="Gérez vos relations avec les brasseries et distributeurs"
                actions={
                    <Button asChild className="rounded-md h-11 px-6 bg-blue-600 hover:bg-blue-700 transition-all active:scale-95 font-bold">
                        <Link href="/dashboard/suppliers/new" className="flex items-center gap-2">
                            <Plus className="h-5 w-5" />
                            <span>Nouveau fournisseur</span>
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
                                    <div className="text-3xl font-semibold text-slate-950 tracking-tight">{stat.value}</div>
                                    <p className="text-sm font-bold text-slate-400 mt-2">{stat.description}</p>
                                </div>
                            </div>
                            <div className="absolute -right-4 -bottom-4 h-32 w-32 bg-slate-50 rounded-full opacity-50 group-hover:scale-150 transition-transform duration-700" />
                        </div>
                    ))}
                </div>

                {/* Suppliers Table */}
                <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-8 py-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
                        <div>
                            <h3 className="text-2xl font-semibold text-slate-950 tracking-tight">Liste des Partenaires</h3>
                            <p className="text-sm font-medium text-slate-400 mt-1">Coordonnées et historique de commandes</p>
                        </div>
                        <div className="relative w-full sm:w-80 group">
                            <Plus className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Rechercher par nom..."
                                className="w-full pl-11 h-12 rounded-md bg-slate-50 border-transparent focus:bg-white focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500/20 text-sm font-bold transition-all shadow-sm outline-none px-4"
                            />
                        </div>
                    </div>

                    <div className="p-2">
                        {suppliers.length === 0 ? (
                            <div className="text-center py-24 flex flex-col items-center">
                                <div className="h-24 w-24 rounded-full bg-slate-50 flex items-center justify-center mb-6">
                                    <Building2 className="h-10 w-10 text-slate-300" />
                                </div>
                                <h3 className="text-xl font-semibold text-slate-950">Aucun fournisseur</h3>
                                <p className="mt-2 text-slate-400 font-medium max-w-xs mx-auto">
                                    Commencez par enregistrer vos fournisseurs habituels pour automatiser vos commandes.
                                </p>
                                <Button className="mt-8 rounded-md h-12 px-8 bg-blue-600 hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20" asChild>
                                    <Link href="/dashboard/suppliers/new">
                                        <Plus className="h-5 w-5 mr-2" />
                                        Ajouter un partenaire
                                    </Link>
                                </Button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50/50">
                                        <TableRow className="border-none hover:bg-transparent">
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-8">Identité Fournisseur</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Contact & Mobile</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Localisation</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Type</TableHead>
                                            <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 text-right">Mouvements</TableHead>
                                            <TableHead className="py-5 pr-8"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {suppliers.map((supplier) => (
                                            <TableRow key={supplier.id} className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                                <TableCell className="py-6 pl-8">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-14 w-14 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 border border-slate-100 group-hover:bg-white group-hover:shadow-lg group-hover:scale-105 transition-all duration-300">
                                                            <Building2 className="h-6 w-6" />
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-slate-950 text-base tracking-tight leading-tight">
                                                                {supplier.name}
                                                            </p>
                                                            {supplier.email && (
                                                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mt-1 flex items-center gap-1.5">
                                                                    <Mail className="h-3 w-3" />
                                                                    {supplier.email}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-6">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-slate-700 text-sm italic group-hover:text-blue-600 transition-colors">
                                                            {supplier.contact_name || 'Inconnu'}
                                                        </span>
                                                        {supplier.phone && (
                                                            <span className="text-[11px] font-bold text-slate-400 mt-1 flex items-center gap-1.5 uppercase tracking-wider">
                                                                <Phone className="h-3 w-3" />
                                                                {supplier.phone}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-6">
                                                    {supplier.address ? (
                                                        <div className="flex items-start gap-1.5 max-w-[200px]">
                                                            <MapPin className="h-3.5 w-3.5 mt-0.5 text-slate-400 shrink-0" />
                                                            <span className="text-sm font-bold text-slate-500 leading-snug">
                                                                {supplier.address}
                                                            </span>
                                                        </div>
                                                    ) : <span className="text-slate-300 font-bold">—</span>}
                                                </TableCell>
                                                <TableCell className="py-6">
                                                    <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border border-slate-200/50 group-hover:bg-white transition-colors">
                                                        {typeLabels[supplier.type || ''] || supplier.type || 'Non classé'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-6 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-base font-semibold text-slate-950 tracking-tight">
                                                            {supplier.orders_count}
                                                        </span>
                                                        <span className="text-[10px] font-semibold uppercase text-slate-400 tracking-tighter">Commandes</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="py-6 pr-8 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-white hover:shadow-md border border-transparent hover:border-slate-100 transition-all">
                                                                <MoreHorizontal className="h-5 w-5 text-slate-400 group-hover:text-slate-950" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-60 p-2 rounded-md border-slate-100 shadow-lg">
                                                            <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-blue-50 focus:bg-blue-50">
                                                                <Link href={`/dashboard/suppliers/${supplier.id}`} className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                                                                        <Eye className="h-4 w-4" />
                                                                    </div>
                                                                    <span className="font-bold text-sm">Fiche Partenaire</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-emerald-50 focus:bg-emerald-50">
                                                                <Link href={`/dashboard/procurement/new?supplier=${supplier.id}`} className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                                                                        <Plus className="h-4 w-4" />
                                                                    </div>
                                                                    <span className="font-bold text-sm text-emerald-700">Commander</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-slate-50 focus:bg-slate-50">
                                                                <Link href={`/dashboard/suppliers/${supplier.id}/edit`} className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                                                                        <Edit className="h-4 w-4" />
                                                                    </div>
                                                                    <span className="font-bold text-sm">Modifier Profil</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <div className="h-px bg-slate-100 my-1 mx-2" />
                                                            <DropdownMenuItem className="rounded-xl cursor-pointer py-3 hover:bg-rose-50 focus:bg-rose-50 text-rose-600">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="h-8 w-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-600">
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </div>
                                                                    <span className="font-bold text-sm">Supprimer</span>
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
            </main>
        </div>
    )
}
