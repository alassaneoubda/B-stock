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
import { Plus, MoreHorizontal, Package, Edit, Eye, Check, TrendingUp } from 'lucide-react'
import { formatMoney, formatNumber } from '@/lib/format'
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

export default async function ProductsPage() {
  const session = await requirePageSession()
  const products = await getProducts(session?.user?.companyId || '')

  const statsData = [
    {
      title: "Total produits",
      value: formatNumber(products.length),
      description: "Articles référencés",
      icon: Package,
      color: "bg-primary/10 text-brand-strong",
    },
    {
      title: "Produits actifs",
      value: formatNumber(products.filter(p => p.is_active).length),
      description: "En vente actuellement",
      icon: Check,
      color: "bg-success/10 text-success",
    },
    {
      title: "Articles en stock",
      value: formatNumber(products.reduce((acc, p) => acc + Number(p.total_stock), 0)),
      description: "Quantité cumulée",
      icon: TrendingUp,
      color: "bg-info/10 text-info",
    }
  ]

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <DashboardHeader
        title="Produits"
        actions={
          <Button size="sm" asChild className="h-8 px-3 text-xs font-medium">
            <Link href="/dashboard/products/new" className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Nouveau produit
            </Link>
          </Button>
        }
      />

      <main className="flex-1 p-4 lg:p-6 space-y-6">
        {products.length === 0 ? (
          <ProductCatalogSetup />
        ) : (
          <>
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {statsData.map((stat) => (
            <div key={stat.title} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">{stat.title}</span>
                <stat.icon className="h-3.5 w-3.5 text-muted-foreground/70" />
              </div>
              <p className="text-xl font-bold text-foreground tracking-tight">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </div>
          ))}
        </div>

        {/* Products Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-foreground">Catalogue</h3>
          </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-medium text-muted-foreground pl-4">Produit</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">SKU</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Catégorie</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground text-right">Prix de vente</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground text-right">Stock</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">État</TableHead>
                      <TableHead className="pr-4"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id} className="group">
                        <TableCell className="pl-4">
                          <div>
                            <p className="text-sm font-medium text-foreground">{product.name}</p>
                            <p className="text-xs text-muted-foreground/70">
                              {product.variants_count} variante{Number(product.variants_count) > 1 ? 's' : ''}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {product.sku}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">{product.category || '—'}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-semibold text-foreground">
                            {formatMoney(product.selling_price)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm font-medium ${Number(product.total_stock) < 10 ? 'text-destructive' : 'text-foreground'}`}>
                            {formatNumber(product.total_stock)} {product.base_unit || 'unit'}
                          </span>
                          {Number(product.total_stock) < 10 && (
                            <p className="text-[10px] text-destructive">Stock bas</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] font-medium ${product.is_active ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'} border-none`}>
                            {product.is_active ? 'Actif' : 'Masqué'}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md" aria-label={`Actions pour ${product.name}`}>
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground/70" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href={`/dashboard/products/${product.id}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">Fiche produit</span>
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href={`/dashboard/products/${product.id}/edit`} className="flex items-center gap-2">
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
                {products.map((product) => (
                  <Link
                    key={product.id}
                    href={`/dashboard/products/${product.id}`}
                    className="block p-4 active:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground/70 font-mono">{product.sku}</p>
                      </div>
                      <Badge className={`text-[10px] font-medium ml-2 shrink-0 ${product.is_active ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'} border-none`}>
                        {product.is_active ? 'Actif' : 'Masqué'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground/70">{product.category || 'Sans catégorie'}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium ${Number(product.total_stock) < 10 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {formatNumber(product.total_stock)} {product.base_unit || 'unit'}
                        </span>
                        <span className="text-sm font-bold text-foreground">
                          {formatMoney(product.selling_price)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
        </div>
          </>
        )}
      </main>
    </div>
  )
}
