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
    } catch (error) {
        console.error('Error fetching suppliers:', error)
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {statsData.map((stat) => (
                        <div key={stat.title} className="bg-white rounded-lg border border-zinc-200/80 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-zinc-500">{stat.title}</span>
                                <stat.icon className="h-3.5 w-3.5 text-zinc-400" />
                            </div>
                            <p className="text-lg sm:text-xl font-bold text-zinc-950 tracking-tight">{stat.value}</p>
                            <p className="text-xs text-zinc-500 mt-1">{stat.description}</p>
                        </div>
                    ))}
                </div>

                {/* Suppliers Table */}
                <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm overflow-hidden">
                    <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h3 className="text-base sm:text-lg font-semibold text-slate-950">Liste des Partenaires</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Coordonnées et historique de commandes</p>
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
                            <>
                              {/* Desktop table */}
                              <div className="hidden md:block overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-slate-50/50">
                                        <TableRow className="border-none hover:bg-transparent">
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 pl-4">Fournisseur</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Contact</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Localisation</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Type</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400 text-right">Cmd</TableHead>
                                            <TableHead className="py-3 pr-4"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {suppliers.map((supplier) => (
                                            <TableRow key={supplier.id} className="group border-b border-slate-50 hover:bg-slate-50/50">
                                                <TableCell className="py-3 pl-4">
                                                    <p className="text-sm font-semibold text-slate-950">{supplier.name}</p>
                                                    {supplier.email && (
                                                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                                            <Mail className="h-3 w-3" />{supplier.email}
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <span className="text-sm text-slate-700">{supplier.contact_name || '—'}</span>
                                                    {supplier.phone && (
                                                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                                            <Phone className="h-3 w-3" />{supplier.phone}
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    {supplier.address ? (
                                                        <span className="text-xs text-slate-500">{supplier.address}</span>
                                                    ) : <span className="text-slate-300">—</span>}
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                                        {typeLabels[supplier.type || ''] || supplier.type || 'Non classé'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-3 text-right text-sm font-semibold text-slate-950">
                                                    {supplier.orders_count}
                                                </TableCell>
                                                <TableCell className="py-3 pr-4 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md">
                                                                <MoreHorizontal className="h-4 w-4 text-slate-400" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48">
                                                            <DropdownMenuItem asChild className="cursor-pointer">
                                                                <Link href={`/dashboard/suppliers/${supplier.id}`} className="flex items-center gap-2">
                                                                    <Eye className="h-4 w-4 text-zinc-500" />
                                                                    <span className="text-sm">Fiche Partenaire</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild className="cursor-pointer">
                                                                <Link href={`/dashboard/procurement/new?supplier=${supplier.id}`} className="flex items-center gap-2">
                                                                    <Plus className="h-4 w-4 text-zinc-500" />
                                                                    <span className="text-sm">Commander</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild className="cursor-pointer">
                                                                <Link href={`/dashboard/suppliers/${supplier.id}/edit`} className="flex items-center gap-2">
                                                                    <Edit className="h-4 w-4 text-zinc-500" />
                                                                    <span className="text-sm">Modifier</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                              </div>

                              {/* Mobile cards */}
                              <div className="md:hidden divide-y divide-zinc-100">
                                {suppliers.map((supplier) => (
                                    <Link
                                        key={supplier.id}
                                        href={`/dashboard/suppliers/${supplier.id}`}
                                        className="block p-4 active:bg-zinc-50 transition-colors"
                                    >
                                        <div className="flex items-start justify-between mb-1.5">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-zinc-950 truncate">{supplier.name}</p>
                                                {supplier.phone && (
                                                    <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                                                        <Phone className="h-3 w-3" /> {supplier.phone}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 ml-2 shrink-0">
                                                {typeLabels[supplier.type || ''] || supplier.type || 'Non classé'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs mt-2">
                                            <span className="text-zinc-400 truncate max-w-[60%]">{supplier.address || 'Sans adresse'}</span>
                                            <span className="text-zinc-600 font-medium">{supplier.orders_count} cmd</span>
                                        </div>
                                    </Link>
                                ))}
                              </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
