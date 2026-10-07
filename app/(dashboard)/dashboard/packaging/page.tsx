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
    equivalences: string[]
}

// Pas de try/catch : une panne SQL doit afficher la page d'erreur, pas une liste vide.
async function getPackagingTypes(companyId: string): Promise<PackagingType[]> {
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
}

export default async function PackagingPage() {
    const session = await requirePageSession()
    const companyId = session?.user?.companyId || ''
    const packagingTypes = await getPackagingTypes(companyId)

    const totalStock = packagingTypes.reduce((acc, pt) => acc + Number(pt.stock_quantity), 0)
    const returnableCount = packagingTypes.filter(pt => pt.is_returnable).length

    const statsData = [
        {
            title: "Types d'Emballages",
            value: formatNumber(packagingTypes.length),
            description: "Modèles configurés",
            icon: Box,
            color: "bg-primary/10 text-brand-strong",
        },
        {
            title: "Articles Consignés",
            value: formatNumber(returnableCount),
            description: "Avec suivi de caution",
            icon: RotateCcw,
            color: "bg-warning/10 text-warning-foreground",
        },
        {
            title: "Stock Vides Total",
            value: formatNumber(totalStock),
            description: "Casiers disponibles",
            icon: PackageOpen,
            color: "bg-success/10 text-success",
        }
    ]

    return (
        <div className="flex flex-col min-h-screen bg-muted/30">
            <DashboardHeader
                title="Bibliothèque d'Emballages"
                description="Référentiel des formats de conditionnement et consignes"
                actions={
                    <div className="flex gap-3">
                        <Button variant="outline" asChild className="rounded-md h-11 px-6 border-border font-bold hover:bg-card hover:shadow-md transition-all">
                            <Link href="/dashboard/packaging/equivalences">
                                <ArrowLeftRight className="h-5 w-5 mr-2 text-muted-foreground/70" />
                                Équivalences
                            </Link>
                        </Button>
                        <Button asChild className="rounded-md h-11 px-6 bg-primary hover:bg-primary transition-all active:scale-95 font-bold">
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

                {/* Packaging Table */}
                <div className="rounded-lg bg-card border border-border shadow-sm overflow-hidden">
                    <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-border">
                        <h3 className="text-base sm:text-lg font-semibold text-foreground">Catalogue Formats</h3>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">Spécifications techniques et valeurs de consigne</p>
                    </div>

                    <div className="p-2">
                        {packagingTypes.length === 0 ? (
                            <div className="text-center py-24 flex flex-col items-center">
                                <div className="h-24 w-24 rounded-full bg-muted/50 flex items-center justify-center mb-6">
                                    <BoxesIcon className="h-10 w-10 text-muted-foreground/70" />
                                </div>
                                <h3 className="text-xl font-semibold text-foreground">Aucun emballage configuré</h3>
                                <p className="mt-2 text-muted-foreground/70 font-medium max-w-xs mx-auto">
                                    Définissez vos types de casiers (12×33cl, 24×50cl...) pour un suivi précis.
                                </p>
                                <Button className="mt-8 rounded-md h-12 px-8 bg-primary hover:bg-primary transition-all shadow-md shadow-blue-500/20" asChild>
                                    <Link href="/dashboard/packaging/new">
                                        <Plus className="h-5 w-5 mr-2" />
                                        Ajouter un emballage
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
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pl-4">Emballage</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 text-center">Contenance</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Consigne</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 text-right">Valeur</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 text-right">Stock</TableHead>
                                            <TableHead className="py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Équivalences</TableHead>
                                            <TableHead className="py-3 pr-4"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {packagingTypes.map((pt) => (
                                            <TableRow key={pt.id} className="group border-b border-border hover:bg-muted/30">
                                                <TableCell className="py-3 pl-4">
                                                    <span className="text-sm font-semibold text-foreground">{pt.name}</span>
                                                </TableCell>
                                                <TableCell className="py-3 text-center">
                                                    <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                                        {pt.units_per_case || '—'} u.
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    <Badge className={`text-[10px] font-medium border-none ${pt.is_returnable ? 'bg-warning-soft text-warning-foreground' : 'bg-muted text-muted-foreground/70'}`}>
                                                        {pt.is_returnable ? 'Consigné' : 'Perdu'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="py-3 text-right">
                                                    {pt.deposit_price && Number(pt.deposit_price) > 0 ? (
                                                        <span className="text-sm font-semibold text-brand-strong">
                                                            {formatMoney(pt.deposit_price)}
                                                        </span>
                                                    ) : <span className="text-muted-foreground/70">—</span>}
                                                </TableCell>
                                                <TableCell className="py-3 text-right text-sm font-semibold text-foreground">
                                                    {formatNumber(pt.stock_quantity)}
                                                </TableCell>
                                                <TableCell className="py-3">
                                                    {pt.equivalences.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {pt.equivalences.map((eq) => (
                                                                <span key={eq} className="px-2 py-0.5 rounded bg-brand-soft text-[10px] font-medium text-brand-strong">{eq}</span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground/70 text-xs">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-3 pr-4 text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md" aria-label={`Actions pour ${pt.name}`}>
                                                                <MoreHorizontal className="h-4 w-4 text-muted-foreground/70" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48">
                                                            <DropdownMenuItem asChild className="cursor-pointer">
                                                                <Link href={`/dashboard/packaging/${pt.id}/edit`} className="flex items-center gap-2">
                                                                    <Edit className="h-4 w-4 text-muted-foreground" />
                                                                    <span className="text-sm">Modifier</span>
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild className="cursor-pointer">
                                                                <Link href={`/dashboard/packaging/equivalences?add=${pt.id}`} className="flex items-center gap-2">
                                                                    <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                                                                    <span className="text-sm">Équivalence</span>
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
                                {packagingTypes.map((pt) => (
                                    <Link
                                        key={pt.id}
                                        href={`/dashboard/packaging/${pt.id}/edit`}
                                        className="block p-4 active:bg-muted/50 transition-colors"
                                    >
                                        <div className="flex items-start justify-between mb-1.5">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-semibold text-foreground truncate">{pt.name}</p>
                                                <p className="text-xs text-muted-foreground/70">{pt.units_per_case || '—'} unités/casier</p>
                                            </div>
                                            <Badge className={`text-[10px] font-medium ml-2 shrink-0 border-none ${pt.is_returnable ? 'bg-warning-soft text-warning-foreground' : 'bg-muted text-muted-foreground/70'}`}>
                                                {pt.is_returnable ? 'Consigné' : 'Perdu'}
                                            </Badge>
                                        </div>
                                        <div className="flex items-center justify-between mt-2">
                                            <div className="flex flex-wrap gap-1">
                                                {pt.equivalences.length > 0 ? pt.equivalences.map((eq) => (
                                                    <span key={eq} className="px-1.5 py-0.5 rounded bg-brand-soft text-[10px] font-medium text-brand-strong">{eq}</span>
                                                )) : <span className="text-xs text-muted-foreground/70">Pas d&apos;équivalence</span>}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-foreground">{formatNumber(pt.stock_quantity)} en stock</p>
                                                {pt.deposit_price && Number(pt.deposit_price) > 0 && (
                                                    <p className="text-xs text-brand-strong font-medium">
                                                        {formatMoney(pt.deposit_price)}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                              </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Helper Card */}
                <div className="rounded-lg bg-primary p-10 text-white relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col md:flex-row items-start justify-between gap-8">
                        <div className="space-y-4 max-w-lg">
                            <div className="h-12 w-12 rounded-md bg-primary flex items-center justify-center mb-6 shadow-lg shadow-blue-500/30">
                                <ArrowLeftRight className="h-6 w-6" />
                            </div>
                            <h3 className="text-2xl font-semibold tracking-tight">Système d'Équivalences Intelligentes</h3>
                            <p className="text-muted-foreground/70 font-medium leading-relaxed">
                                Optimisez vos échanges de casiers entre distributeurs. Le système permet de substituer dynamiquement les contenants compatibles lors des retours clients.
                            </p>
                            <Button variant="outline" className="mt-4 rounded-xl border-border hover:bg-card hover:text-foreground font-semibold transition-all" asChild>
                                <Link href="/dashboard/packaging/equivalences">Gérer les règles métier</Link>
                            </Button>
                        </div>
                    </div>
                    {/* Abstract background blur */}
                    <div className="absolute top-0 right-0 w-1/3 h-full bg-primary/10 blur-[120px] pointer-events-none" />
                </div>
            </main>
        </div>
    )
}
