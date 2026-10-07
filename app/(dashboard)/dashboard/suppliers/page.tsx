import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatCard } from '@/components/app/blocks'
import { EmptyState } from '@/components/states'
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
import { Building2, Edit, Eye, Factory, Mail, MoreHorizontal, Phone, Plus, ShoppingCart, Truck, Wallet } from 'lucide-react'
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

const typeLabel = (type: string | null) => typeLabels[type || ''] || type || 'Non classé'

export default async function SuppliersPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const suppliers = await getSuppliers(companyId)

    const manufacturers = suppliers.filter((s) => s.type === 'manufacturer').length
    const distributors = suppliers.filter((s) => s.type === 'distributor').length

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Fournisseurs"
                description="Brasseries, distributeurs et grossistes avec qui vous travaillez"
                actions={
                    <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="outline" className="h-9">
                        <Link href="/dashboard/suppliers/payables">
                            <Wallet className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Dettes fournisseurs</span>
                            <span className="sm:hidden">Dettes</span>
                        </Link>
                    </Button>
                    <Button asChild size="sm" className="h-9">
                        <Link href="/dashboard/suppliers/new">
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Nouveau fournisseur</span>
                            <span className="sm:hidden">Nouveau</span>
                        </Link>
                    </Button>
                    </div>
                }
            />

            <PageShell>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                    <StatCard
                        label="Fournisseurs"
                        value={formatNumber(suppliers.length)}
                        hint="Partenaires enregistrés"
                        icon={Building2}
                    />
                    <StatCard
                        label="Fabricants"
                        value={formatNumber(manufacturers)}
                        hint="Achat direct usine"
                        icon={Factory}
                        tone="brand"
                    />
                    <StatCard
                        label="Distributeurs"
                        value={formatNumber(distributors)}
                        hint="Grossistes et revendeurs"
                        icon={Truck}
                        tone="info"
                    />
                </div>

                {suppliers.length === 0 ? (
                    <EmptyState
                        icon={Building2}
                        title="Aucun fournisseur"
                        description="Enregistrez vos fournisseurs habituels pour passer vos commandes d'achat plus vite."
                        action={{ label: 'Ajouter un fournisseur', href: '/dashboard/suppliers/new' }}
                    />
                ) : (
                    <Panel
                        title="Liste des fournisseurs"
                        description={`${formatNumber(suppliers.length)} fournisseur${suppliers.length > 1 ? 's' : ''} · coordonnées et commandes`}
                    >
                        {/* Tableau (≥ md) */}
                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="pl-5">Fournisseur</TableHead>
                                        <TableHead>Contact</TableHead>
                                        <TableHead>Adresse</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-right">Commandes</TableHead>
                                        <TableHead className="w-12 pr-5">
                                            <span className="sr-only">Actions</span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {suppliers.map((supplier) => (
                                        <TableRow key={supplier.id} className="transition-colors hover:bg-muted/40">
                                            <TableCell className="py-3 pl-5">
                                                <Link
                                                    href={`/dashboard/suppliers/${supplier.id}`}
                                                    className="rounded-sm text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                >
                                                    {supplier.name}
                                                </Link>
                                                {supplier.email && (
                                                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Mail className="h-3 w-3" aria-hidden="true" />
                                                        {supplier.email}
                                                    </p>
                                                )}
                                            </TableCell>
                                            <TableCell className="py-3">
                                                <span className="text-sm text-foreground">{supplier.contact_name || '—'}</span>
                                                {supplier.phone && (
                                                    <p className="tabular mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Phone className="h-3 w-3" aria-hidden="true" />
                                                        {supplier.phone}
                                                    </p>
                                                )}
                                            </TableCell>
                                            <TableCell className="max-w-[240px] py-3">
                                                <span className="block truncate text-sm text-muted-foreground">
                                                    {supplier.address || '—'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-3">
                                                <Badge variant="muted">{typeLabel(supplier.type)}</Badge>
                                            </TableCell>
                                            <TableCell className="tabular py-3 text-right text-sm font-medium text-foreground">
                                                {formatNumber(supplier.orders_count)}
                                            </TableCell>
                                            <TableCell className="py-3 pr-5 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground"
                                                            aria-label={`Actions pour ${supplier.name}`}
                                                        >
                                                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        <DropdownMenuItem asChild>
                                                            <Link href={`/dashboard/suppliers/${supplier.id}`}>
                                                                <Eye aria-hidden="true" />
                                                                Voir la fiche
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem asChild>
                                                            <Link href={`/dashboard/procurement/new?supplier=${supplier.id}`}>
                                                                <ShoppingCart aria-hidden="true" />
                                                                Commander
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem asChild>
                                                            <Link href={`/dashboard/suppliers/${supplier.id}/edit`}>
                                                                <Edit aria-hidden="true" />
                                                                Modifier
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

                        {/* Cartes (< md) */}
                        <ul className="divide-y divide-border md:hidden">
                            {suppliers.map((supplier) => (
                                <li key={supplier.id}>
                                    <Link
                                        href={`/dashboard/suppliers/${supplier.id}`}
                                        className="flex items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                                    >
                                        <div className="min-w-0 flex-1 space-y-0.5">
                                            <p className="truncate text-sm font-medium text-foreground">{supplier.name}</p>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {[typeLabel(supplier.type), supplier.phone, supplier.address].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="tabular text-sm font-medium text-foreground">
                                                {formatNumber(supplier.orders_count)}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                commande{Number(supplier.orders_count) > 1 ? 's' : ''}
                                            </p>
                                        </div>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </Panel>
                )}
            </PageShell>
        </div>
    )
}
