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
    PackageSearch,
    Eye,
    Edit,
    Phone,
    MapPin,
    Truck,
    Building2,
    Mail
} from 'lucide-react'
import Link from 'next/link'
import { formatNumber } from '@/lib/format'

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

// Pas de try/catch : une panne SQL doit afficher la page d'erreur, pas une liste vide.
async function getSuppliers(companyId: string): Promise<Supplier[]> {
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
}

const typeLabels: Record<string, string> = {
    manufacturer: 'Fabricant',
    distributor: 'Distributeur',
    wholesaler: 'Grossiste',
}

export default async function SuppliersPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const suppliers = await getSuppliers(companyId)

    const statsData = [
        {
            title: "Total Fournisseurs",
            value: formatNumber(suppliers.length),
            description: "Partenaires enregistrés",
            icon: Building2,
            color: "bg-primary/10 text-brand-strong",
        },
        {
            title: "Fabricants",
            value: formatNumber(suppliers.filter(s => s.type === 'manufacturer').length),
            description: "Direct usine (Solibra...)",
            icon: Truck,
            color: "bg-success/10 text-success",
        },
        {
            title: "Distributeurs",
            value: formatNumber(suppliers.filter(s => s.type === 'distributor').length),
            description: "Grossistes & Revendeurs",
            icon: PackageSearch,
            color: "bg-info/10 text-info",
        }
    ]

    return (
        <div className="flex flex-col min-h-screen bg-muted/30">
            <DashboardHeader
                title="Réseau Fournisseurs"
                description="Gérez vos relations avec les brasseries et distributeurs"
                actions={
                    <Button asChild className="rounded-md h-11 px-6 bg-primary hover:bg-primary transition-all active:scale-95 font-bold">
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
                        <div key={stat.title} className="bg-card rounded-lg border border-border p-4">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-medium text-muted-foreground">{stat.title}</span>
                                <stat.icon className="h-3.5 w-3.5 text-muted-foreground/70" />
                            </div>
                            <p className="text-lg sm:text-xl font-bold text-foreground tracking-tight">{stat.value}</p>
                            <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                        </div>
                    ))}
                </div>

                {/* Suppliers Table */}
                <div className="rounded-lg bg-card border border-border shadow-sm overflow-hidden">
                    <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <h3 className="text-base sm:text-lg font-semibold text-foreground">Liste des Partenaires</h3>
                            <p className="text-xs text-muted-foreground/70 mt-0.5">Coordonnées et historique de commandes</p>
                        </div>
                    </div>

                    <div className="p-2">
                        {suppliers.length === 0 ? (
                            <div className="text-center py-24 flex flex-col items-center">
                                <div className="h-24 w-24 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                                    <Building2 className="h-10 w-10 text-muted-foreground/70" />
                                </div>
                                <h3 className="text-xl font-semibold text-foreground">Aucun fournisseur</h3>
                                <p className="mt-2 text-muted-foreground/70 font-medium max-w-xs mx-auto">
                                    Commencez par enregistrer vos fournisseurs habituels pour automatiser vos commandes.
                                </p>
                                <Button className="mt-8 rounded-md h-12 px-8 bg-primary hover:bg-primary transition-all shadow-md shadow-blue-500/20" asChild>
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
                                    <TableHeader className="bg-muted/30">
                                        <TableRow className="border-none hover:bg-transparent">
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pl-4">Fournisseur</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Contact</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Localisation</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Type</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 text-right">Cmd</TableHead>
                                            <TableHead className="py-3 pr-4"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {suppliers.map((supplier) => (
                                            <TableRow key={supplier.id} className="group border-b border-border hover:bg-muted/30">
                                                <TableCell className="py-3 pl-4">
                                                    <p className="text-sm font-semibold text-foreground">{supplier.name}</p>
                                                    {supplier.email && (
                                                        <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                                                            <Mail className="h-3 w-3" />{supplier.email}
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <span className="text-sm text-foreground/80">{supplier.contact_name || '—'}</span>
                                                    {supplier.phone && (
                                                        <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                                                            <Phone className="h-3 w-3" />{supplier.phone}
                                                        </p>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    {supplier.address ? (
                                                        <span className="text-xs text-muted-foreground">{supplier.address}</span>
                                                    ) : <span className="text-muted-foreground/70">—</span>}
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                                        {typeLabels[supplier.type || ''] || supplier.type || 'Non classé'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-3 text-right text-sm font-semibold text-foreground">
                                                    {formatNumber(supplier.orders_count)}
                                                </TableCell>
                                                <TableCell className="py-3 pr-4 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md" aria-label={`Actions pour ${supplier.name}`}>
                                                                <MoreHorizontal className="h-4 w-4 text-muted-foreground/70" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48">
                                                            <DropdownMenuItem asChild className="cursor-pointer">
                                                                <Link href={`/dashboard/suppliers/${supplier.id}`} className="flex items-center gap-2">
                                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                                    <span className="text-sm">Fiche Partenaire</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild className="cursor-pointer">
                                                                <Link href={`/dashboard/procurement/new?supplier=${supplier.id}`} className="flex items-center gap-2">
                                                                    <Plus className="h-4 w-4 text-muted-foreground" />
                                                                    <span className="text-sm">Commander</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild className="cursor-pointer">
                                                                <Link href={`/dashboard/suppliers/${supplier.id}/edit`} className="flex items-center gap-2">
                                                                    <Edit className="h-4 w-4 text-muted-foreground" />
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
                              <div className="md:hidden divide-y divide-border">
                                {suppliers.map((supplier) => (
                                    <Link
                                        key={supplier.id}
                                        href={`/dashboard/suppliers/${supplier.id}`}
                                        className="block p-4 active:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-start justify-between mb-1.5">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-foreground truncate">{supplier.name}</p>
                                                {supplier.phone && (
                                                    <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                                                        <Phone className="h-3 w-3" /> {supplier.phone}
                                                    </p>
                                                )}
                                            </div>
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground ml-2 shrink-0">
                                                {typeLabels[supplier.type || ''] || supplier.type || 'Non classé'}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs mt-2">
                                            <span className="text-muted-foreground/70 truncate max-w-[60%]">{supplier.address || 'Sans adresse'}</span>
                                            <span className="text-muted-foreground font-medium">{formatNumber(supplier.orders_count)} cmd</span>
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
