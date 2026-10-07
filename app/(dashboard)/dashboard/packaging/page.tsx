import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
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
import { Plus, MoreHorizontal, BoxesIcon, Edit, ArrowLeftRight, RotateCcw, Box, PackageOpen } from 'lucide-react'
import Link from 'next/link'
import { formatMoney, formatNumber } from '@/lib/format'

interface PackagingType {
    id: string
    name: string
    units_per_case: number | null
    is_returnable: boolean
    deposit_price: number | null
    stock_quantity: number
    /** Produits qui utilisent cet emballage (plusieurs emballages peuvent porter le même format). */
    product_names: string | null
    equivalences: string[]
}

// Pas de try/catch : une panne SQL doit afficher la page d'erreur, pas une liste vide.
async function getPackagingTypes(companyId: string): Promise<PackagingType[]> {
    const types = await sql`
  SELECT
    pt.*,
    COALESCE(SUM(ps.quantity), 0) as stock_quantity,
    (SELECT string_agg(DISTINCT p.name, ', ')
       FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.packaging_type_id = pt.id) as product_names
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
}

export default async function PackagingPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const packagingTypes = await getPackagingTypes(companyId)

    const totalStock = packagingTypes.reduce((acc, pt) => acc + Number(pt.stock_quantity), 0)
    const returnableCount = packagingTypes.filter(pt => pt.is_returnable).length

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Emballages"
                description="Formats de conditionnement et consignes"
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild className="h-9">
                            <Link href="/dashboard/packaging/equivalences" aria-label="Équivalences">
                                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                                <span className="hidden sm:inline">Équivalences</span>
                            </Link>
                        </Button>
                        <Button variant="brand" size="sm" asChild className="h-9">
                            <Link href="/dashboard/packaging/new" aria-label="Nouvel emballage">
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                <span className="hidden sm:inline">Nouvel emballage</span>
                            </Link>
                        </Button>
                    </div>
                }
            />

            <PageShell>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                    <StatCard
                        label="Types d'emballages"
                        value={formatNumber(packagingTypes.length)}
                        hint="Formats configurés"
                        icon={Box}
                    />
                    <StatCard
                        label="Emballages consignés"
                        value={formatNumber(returnableCount)}
                        hint="Avec suivi de caution"
                        icon={RotateCcw}
                        tone="warning"
                    />
                    <StatCard
                        label="Stock de vides"
                        value={formatNumber(totalStock)}
                        hint="Casiers disponibles"
                        icon={PackageOpen}
                        tone="success"
                    />
                </div>

                {packagingTypes.length === 0 ? (
                    <EmptyState
                        icon={BoxesIcon}
                        title="Aucun emballage configuré"
                        description="Définissez vos types de casiers (12 × 33 cl, 24 × 50 cl…) pour suivre précisément vides et consignes."
                        action={{ label: 'Ajouter un emballage', href: '/dashboard/packaging/new' }}
                    />
                ) : (
                    <Panel title="Catalogue des formats" description="Contenance, consigne et stock de vides">
                        {/* Tableau (desktop) */}
                        <div className="hidden overflow-x-auto md:block">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="pl-5">Emballage</TableHead>
                                        <TableHead className="text-right">Contenance</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead className="text-right">Consigne</TableHead>
                                        <TableHead className="text-right">Stock de vides</TableHead>
                                        <TableHead>Équivalences</TableHead>
                                        <TableHead className="w-12 pr-5"><span className="sr-only">Actions</span></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {packagingTypes.map((pt) => (
                                        <TableRow key={pt.id} className="transition-colors hover:bg-muted/40">
                                            <TableCell className="pl-5">
                                                <Link
                                                    href={`/dashboard/packaging/${pt.id}/edit`}
                                                    className="text-sm font-medium text-foreground transition-colors hover:text-brand-strong"
                                                >
                                                    {pt.name}
                                                </Link>
                                                {pt.product_names && (
                                                    <p className="truncate text-xs text-muted-foreground">{pt.product_names}</p>
                                                )}
                                            </TableCell>
                                            <TableCell className="tabular text-right text-sm text-muted-foreground">
                                                {pt.units_per_case ? `${formatNumber(pt.units_per_case)} u.` : '—'}
                                            </TableCell>
                                            <TableCell>
                                                <StatusBadge
                                                    label={pt.is_returnable ? 'Consigné' : 'Perdu'}
                                                    tone={pt.is_returnable ? 'warning' : 'default'}
                                                />
                                            </TableCell>
                                            <TableCell className="tabular text-right text-sm">
                                                {pt.deposit_price && Number(pt.deposit_price) > 0 ? (
                                                    <span className="font-medium text-foreground">{formatMoney(pt.deposit_price)}</span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="tabular text-right text-sm font-semibold text-foreground">
                                                {formatNumber(pt.stock_quantity)}
                                            </TableCell>
                                            <TableCell>
                                                {pt.equivalences.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {pt.equivalences.map((eq) => (
                                                            <Badge key={eq} variant="muted">{eq}</Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="pr-5 text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${pt.name}`}>
                                                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-52">
                                                        <DropdownMenuItem asChild className="cursor-pointer">
                                                            <Link href={`/dashboard/packaging/${pt.id}/edit`}>
                                                                <Edit aria-hidden="true" />
                                                                Modifier
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem asChild className="cursor-pointer">
                                                            <Link href={`/dashboard/packaging/equivalences?add=${pt.id}`}>
                                                                <ArrowLeftRight aria-hidden="true" />
                                                                Ajouter une équivalence
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

                        {/* Cartes (mobile) */}
                        <ul className="divide-y divide-border md:hidden">
                            {packagingTypes.map((pt) => (
                                <li key={pt.id}>
                                    <Link
                                        href={`/dashboard/packaging/${pt.id}/edit`}
                                        className="block px-5 py-4 transition-colors hover:bg-muted/40"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-foreground">{pt.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {[pt.product_names, pt.units_per_case ? `${formatNumber(pt.units_per_case)} unités` : 'Contenance non renseignée'].filter(Boolean).join(' · ')}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="tabular text-sm font-semibold text-foreground">{formatNumber(pt.stock_quantity)}</p>
                                                <p className="text-xs text-muted-foreground">en stock</p>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <StatusBadge
                                                label={pt.is_returnable ? 'Consigné' : 'Perdu'}
                                                tone={pt.is_returnable ? 'warning' : 'default'}
                                            />
                                            {pt.deposit_price && Number(pt.deposit_price) > 0 && (
                                                <span className="tabular text-xs text-muted-foreground">
                                                    Consigne {formatMoney(pt.deposit_price)}
                                                </span>
                                            )}
                                        </div>
                                        {pt.equivalences.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {pt.equivalences.map((eq) => (
                                                    <Badge key={eq} variant="muted">{eq}</Badge>
                                                ))}
                                            </div>
                                        )}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </Panel>
                )}

                {/* Aide : équivalences */}
                <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
                            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="space-y-0.5">
                            <p className="text-sm font-semibold text-foreground">Équivalences d&apos;emballages</p>
                            <p className="max-w-xl text-sm text-muted-foreground">
                                Déclarez les contenants interchangeables : lors des retours clients, un casier compatible est accepté à la place de l&apos;autre.
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" asChild className="shrink-0">
                        <Link href="/dashboard/packaging/equivalences">Gérer les équivalences</Link>
                    </Button>
                </div>
            </PageShell>
        </div>
    )
}
