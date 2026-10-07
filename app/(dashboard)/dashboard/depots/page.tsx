import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Edit, MoreHorizontal, Package, Plus, Warehouse } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/states'
import { formatNumber } from '@/lib/format'

interface Depot {
    id: string
    name: string
    address: string | null
    phone: string | null
    is_main: boolean
    stock_count: number
}

async function getDepots(companyId: string): Promise<Depot[]> {
        const depots = await sql`
      SELECT
        d.*,
        COUNT(DISTINCT s.id) as stock_count
      FROM depots d
      LEFT JOIN stock s ON s.depot_id = d.id AND s.quantity > 0
      WHERE d.company_id = ${companyId}
      GROUP BY d.id
      ORDER BY d.is_main DESC, d.name
    `
        return depots as Depot[]
}

export default async function DepotsPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const depots = await getDepots(companyId)

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Dépôts"
                description="Vos entrepôts et points de stockage"
                actions={
                    <Button asChild size="sm" className="h-9">
                        <Link href="/dashboard/depots/new">
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Nouveau dépôt</span>
                            <span className="sm:hidden">Nouveau</span>
                        </Link>
                    </Button>
                }
            />

            <PageShell>
                {depots.length === 0 ? (
                    <EmptyState
                        icon={Warehouse}
                        title="Aucun dépôt"
                        description="Créez votre dépôt principal pour commencer à suivre vos stocks."
                        action={{ label: 'Créer mon premier dépôt', href: '/dashboard/depots/new' }}
                    />
                ) : (
                    <Panel
                        title="Liste des dépôts"
                        description={`${formatNumber(depots.length)} dépôt${depots.length > 1 ? 's' : ''} · références en stock par site`}
                    >
                        {/* Tableau (≥ md) */}
                        <div className="hidden md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="pl-5">Dépôt</TableHead>
                                        <TableHead>Adresse</TableHead>
                                        <TableHead>Téléphone</TableHead>
                                        <TableHead className="text-right">Références en stock</TableHead>
                                        <TableHead className="w-12 pr-5">
                                            <span className="sr-only">Actions</span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {depots.map((depot) => (
                                        <TableRow key={depot.id} className="transition-colors hover:bg-muted/40">
                                            <TableCell className="py-3 pl-5">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Link
                                                        href={`/dashboard/stock?depot=${depot.id}`}
                                                        className="rounded-sm text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        {depot.name}
                                                    </Link>
                                                    {depot.is_main && <StatusBadge label="Principal" tone="brand" />}
                                                </div>
                                            </TableCell>
                                            <TableCell className="max-w-[280px] py-3">
                                                <span className="block truncate text-sm text-muted-foreground">{depot.address || '—'}</span>
                                            </TableCell>
                                            <TableCell className="tabular py-3 text-sm text-muted-foreground">
                                                {depot.phone || '—'}
                                            </TableCell>
                                            <TableCell className="tabular py-3 text-right text-sm font-medium text-foreground">
                                                {formatNumber(depot.stock_count)}
                                            </TableCell>
                                            <TableCell className="py-3 pr-5 text-right">
                                                <DepotActions depot={depot} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Cartes (< md) */}
                        <ul className="divide-y divide-border md:hidden">
                            {depots.map((depot) => (
                                <li key={depot.id} className="flex items-start gap-2 px-4 py-3.5">
                                    <Link
                                        href={`/dashboard/stock?depot=${depot.id}`}
                                        className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <div className="min-w-0 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="truncate text-sm font-medium text-foreground">{depot.name}</p>
                                                {depot.is_main && <StatusBadge label="Principal" tone="brand" />}
                                            </div>
                                            <p className="truncate text-xs text-muted-foreground">
                                                {[depot.address, depot.phone].filter(Boolean).join(' · ') || 'Aucune coordonnée'}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="tabular text-sm font-medium text-foreground">{formatNumber(depot.stock_count)}</p>
                                            <p className="text-xs text-muted-foreground">réf.</p>
                                        </div>
                                    </Link>
                                    <DepotActions depot={depot} />
                                </li>
                            ))}
                        </ul>
                    </Panel>
                )}
            </PageShell>
        </div>
    )
}

function DepotActions({ depot }: { depot: Depot }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    aria-label={`Actions pour le dépôt ${depot.name}`}
                >
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                    <Link href={`/dashboard/stock?depot=${depot.id}`}>
                        <Package aria-hidden="true" />
                        Voir le stock
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                    <Link href={`/dashboard/depots/${depot.id}/edit`}>
                        <Edit aria-hidden="true" />
                        Modifier
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
