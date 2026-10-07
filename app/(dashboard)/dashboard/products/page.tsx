import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, StatCard, StatusBadge } from '@/components/app/blocks'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { AlertTriangle, Boxes, CheckCircle2, Edit, Eye, MoreHorizontal, Package, PackagePlus, Plus, Search } from 'lucide-react'
import { formatMoney, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ProductCatalogSetup } from '@/components/dashboard/product-catalog-setup'

interface Product {
  id: string
  name: string
  sku: string
  category: string | null
  base_unit: string
  purchase_price: number
  selling_price: number
  is_active: boolean
  created_at: string
  variants_count: number
  total_stock: number
}

// Pas de try/catch : une panne SQL doit afficher la page d'erreur, pas un catalogue vide.
async function getProducts(companyId: string): Promise<Product[]> {
    const products = await sql`
      SELECT
        p.*,
        COALESCE(
          (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id),
          0
        ) as variants_count,
        COALESCE(
          (SELECT SUM(s.quantity)
           FROM stock s
           JOIN product_variants pv ON s.product_variant_id = pv.id
           WHERE pv.product_id = p.id),
          0
        ) as total_stock
      FROM products p
      WHERE p.company_id = ${companyId}
      ORDER BY p.created_at DESC
    `
    return products as Product[]
}

/** Seuil d'affichage « Stock bas » (inchangé : moins de 10 unités). */
const LOW_STOCK = 10

function stockStatus(qty: number): { label: string; tone: 'danger' | 'warning' | 'success' } {
  if (qty <= 0) return { label: 'Rupture', tone: 'danger' }
  if (qty < LOW_STOCK) return { label: 'Stock bas', tone: 'warning' }
  return { label: 'OK', tone: 'success' }
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'hidden', label: 'Masqués' },
] as const

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const session = await requirePageSession()
  const products = await getProducts(session?.user?.companyId || '')
  const { q: rawQ, status: rawStatus } = await searchParams
  const q = (rawQ ?? '').trim()
  const status = rawStatus === 'active' || rawStatus === 'hidden' ? rawStatus : 'all'

  // Filtrage d'affichage uniquement (recherche + statut), sur la liste déjà chargée.
  const needle = q.toLowerCase()
  const visible = products.filter((p) => {
    if (status === 'active' && !p.is_active) return false
    if (status === 'hidden' && p.is_active) return false
    if (!needle) return true
    return [p.name, p.sku, p.category].some((v) => (v ?? '').toLowerCase().includes(needle))
  })

  const activeCount = products.filter((p) => p.is_active).length
  const lowCount = products.filter((p) => Number(p.total_stock) < LOW_STOCK).length
  const totalUnits = products.reduce((acc, p) => acc + Number(p.total_stock), 0)

  const filterHref = (value: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (value !== 'all') params.set('status', value)
    const s = params.toString()
    return s ? `/dashboard/products?${s}` : '/dashboard/products'
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Produits"
        description="Catalogue, prix et niveaux de stock"
        actions={
          // Catalogue vide : l'action phare est « Charger vos produits » (assistant ci-dessous)
          <div className="flex items-center gap-2">
          {products.length > 0 && (
            <Button size="sm" variant="outline" asChild>
              <Link href="/dashboard/products/catalog">
                <PackagePlus aria-hidden="true" />
                <span className="hidden sm:inline">Depuis le catalogue</span>
                <span className="sm:hidden">Catalogue</span>
              </Link>
            </Button>
          )}
          <Button size="sm" variant={products.length === 0 ? 'outline' : 'brand'} asChild>
            <Link href="/dashboard/products/new">
              <Plus aria-hidden="true" />
              <span className="hidden sm:inline">Nouveau produit</span>
              <span className="sm:hidden">Produit</span>
            </Link>
          </Button>
          </div>
        }
      />

      <PageShell>
        {products.length === 0 ? (
          <ProductCatalogSetup />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Produits" value={formatNumber(products.length)} hint="Articles référencés" icon={Package} />
              <StatCard label="Actifs" value={formatNumber(activeCount)} hint="Disponibles à la vente" icon={CheckCircle2} tone="success" />
              <StatCard
                label="Stock bas ou rupture"
                value={formatNumber(lowCount)}
                hint={`Moins de ${LOW_STOCK} unités`}
                icon={AlertTriangle}
                tone={lowCount > 0 ? 'warning' : 'default'}
              />
              <StatCard label="Unités en stock" value={formatNumber(totalUnits)} hint="Tous dépôts confondus" icon={Boxes} tone="info" />
            </div>

            {/* Barre d'outils */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <form action="/dashboard/products" method="get" role="search" className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  name="q"
                  type="search"
                  defaultValue={q}
                  placeholder="Rechercher un produit, un SKU…"
                  aria-label="Rechercher un produit"
                  className="h-10 pl-9"
                />
                {status !== 'all' && <input type="hidden" name="status" value={status} />}
              </form>
              <nav className="flex items-center gap-1 rounded-lg border border-border bg-card p-1" aria-label="Filtrer par statut">
                {STATUS_FILTERS.map((f) => (
                  <Link
                    key={f.value}
                    href={filterHref(f.value)}
                    aria-current={status === f.value ? 'page' : undefined}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      status === f.value
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {f.label}
                  </Link>
                ))}
              </nav>
            </div>

            {visible.length === 0 ? (
              <EmptyState
                title="Aucun produit ne correspond"
                description="Modifiez la recherche ou le filtre de statut."
                action={{ label: 'Réinitialiser', href: '/dashboard/products' }}
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
                {/* Bureau */}
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-5">Produit</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead className="text-right">Prix de vente</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                        <TableHead>Niveau</TableHead>
                        <TableHead>État</TableHead>
                        <TableHead className="w-12 pr-5"><span className="sr-only">Actions</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((product) => {
                        const level = stockStatus(Number(product.total_stock))
                        return (
                          <TableRow key={product.id} className="relative cursor-pointer transition-colors hover:bg-muted/40">
                            <TableCell className="pl-5">
                              <Link
                                href={`/dashboard/products/${product.id}`}
                                className="text-sm font-medium text-foreground outline-none after:absolute after:inset-0 focus-visible:underline"
                              >
                                {product.name}
                              </Link>
                              <p className="text-xs text-muted-foreground">
                                {product.variants_count} variante{Number(product.variants_count) > 1 ? 's' : ''}
                              </p>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{product.category || '—'}</TableCell>
                            <TableCell className="tabular text-right text-sm font-medium text-foreground">
                              {formatMoney(product.selling_price)}
                            </TableCell>
                            <TableCell className="tabular text-right text-sm text-foreground">
                              {formatNumber(product.total_stock)}{' '}
                              <span className="text-muted-foreground">{product.base_unit || 'unit'}</span>
                            </TableCell>
                            <TableCell>
                              <StatusBadge label={level.label} tone={level.tone} />
                            </TableCell>
                            <TableCell>
                              <StatusBadge label={product.is_active ? 'Actif' : 'Masqué'} tone={product.is_active ? 'success' : 'default'} />
                            </TableCell>
                            <TableCell className="relative z-10 pr-5 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${product.name}`}>
                                    <MoreHorizontal className="text-muted-foreground" aria-hidden="true" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/products/${product.id}`}>
                                      <Eye aria-hidden="true" />
                                      Fiche produit
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <Link href={`/dashboard/products/${product.id}/edit`}>
                                      <Edit aria-hidden="true" />
                                      Modifier
                                    </Link>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile */}
                <ul className="divide-y divide-border md:hidden">
                  {visible.map((product) => {
                    const level = stockStatus(Number(product.total_stock))
                    return (
                      <li key={product.id}>
                        <Link
                          href={`/dashboard/products/${product.id}`}
                          className="flex items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/40"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {product.category || 'Sans catégorie'} · <span className="font-mono">{product.sku}</span>
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              <StatusBadge label={level.label} tone={level.tone} />
                              {!product.is_active && <StatusBadge label="Masqué" />}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="tabular text-sm font-semibold text-foreground">{formatMoney(product.selling_price)}</p>
                            <p className="tabular text-xs text-muted-foreground">
                              {formatNumber(product.total_stock)} {product.base_unit || 'unit'}
                            </p>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </PageShell>
    </div>
  )
}
