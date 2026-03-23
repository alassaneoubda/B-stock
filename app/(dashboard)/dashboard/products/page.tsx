import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Plus, Search, MoreHorizontal, Package, Edit, Trash2, Eye, Check, TrendingUp } from 'lucide-react'
import Link from 'next/link'

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

async function getProducts(companyId: string): Promise<Product[]> {
  try {
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
  } catch (error) {
    console.error('Error fetching products:', error)
    return []
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount)
}

export default async function ProductsPage() {
  const session = await auth()
  const products = await getProducts(session?.user?.companyId || '')

  const statsData = [
    {
      title: "Total produits",
      value: products.length,
      description: "Articles référencés",
      icon: Package,
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      title: "Produits actifs",
      value: products.filter(p => p.is_active).length,
      description: "En vente actuellement",
      icon: Check,
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      title: "Articles en stock",
      value: products.reduce((acc, p) => acc + Number(p.total_stock), 0),
      description: "Quantité cumulée",
      icon: TrendingUp,
      color: "bg-indigo-500/10 text-indigo-600",
    }
  ]

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
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
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {statsData.map((stat) => (
            <div key={stat.title} className="bg-white rounded-lg border border-zinc-200/80 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-500">{stat.title}</span>
                <stat.icon className="h-3.5 w-3.5 text-zinc-400" />
              </div>
              <p className="text-xl font-bold text-zinc-950 tracking-tight">{stat.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{stat.description}</p>
            </div>
          ))}
        </div>

        {/* Products Table */}
        <div className="bg-white rounded-lg border border-zinc-200/80 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-zinc-950">Catalogue</h3>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-16 flex flex-col items-center">
              <div className="h-12 w-12 rounded-lg bg-zinc-100 flex items-center justify-center mb-4">
                <Package className="h-6 w-6 text-zinc-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-950">Aucun produit</h3>
              <p className="mt-1 text-sm text-zinc-500 max-w-xs">
                Ajoutez vos premiers articles pour commencer.
              </p>
              <Button size="sm" className="mt-4" asChild>
                <Link href="/dashboard/products/new">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Ajouter un produit
                </Link>
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-medium text-zinc-500 pl-4">Produit</TableHead>
                      <TableHead className="text-xs font-medium text-zinc-500">SKU</TableHead>
                      <TableHead className="text-xs font-medium text-zinc-500">Catégorie</TableHead>
                      <TableHead className="text-xs font-medium text-zinc-500 text-right">Prix de vente</TableHead>
                      <TableHead className="text-xs font-medium text-zinc-500 text-right">Stock</TableHead>
                      <TableHead className="text-xs font-medium text-zinc-500">État</TableHead>
                      <TableHead className="pr-4"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id} className="group">
                        <TableCell className="pl-4">
                          <div>
                            <p className="text-sm font-medium text-zinc-950">{product.name}</p>
                            <p className="text-xs text-zinc-400">
                              {product.variants_count} variante{Number(product.variants_count) > 1 ? 's' : ''}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                            {product.sku}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-zinc-500">{product.category || '—'}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-semibold text-zinc-950">
                            {formatCurrency(Number(product.selling_price))}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm font-medium ${Number(product.total_stock) < 10 ? 'text-red-600' : 'text-zinc-950'}`}>
                            {product.total_stock} {product.base_unit || 'unit'}
                          </span>
                          {Number(product.total_stock) < 10 && (
                            <p className="text-[10px] text-red-500">Stock bas</p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] font-medium ${product.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'} border-none`}>
                            {product.is_active ? 'Actif' : 'Masqué'}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md">
                                <MoreHorizontal className="h-4 w-4 text-zinc-400" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href={`/dashboard/products/${product.id}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4 text-zinc-500" />
                                  <span className="text-sm">Fiche produit</span>
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href={`/dashboard/products/${product.id}/edit`} className="flex items-center gap-2">
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
                {products.map((product) => (
                  <Link
                    key={product.id}
                    href={`/dashboard/products/${product.id}`}
                    className="block p-4 active:bg-zinc-50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-950 truncate">{product.name}</p>
                        <p className="text-xs text-zinc-400 font-mono">{product.sku}</p>
                      </div>
                      <Badge className={`text-[10px] font-medium ml-2 shrink-0 ${product.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'} border-none`}>
                        {product.is_active ? 'Actif' : 'Masqué'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-zinc-400">{product.category || 'Sans catégorie'}</span>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium ${Number(product.total_stock) < 10 ? 'text-red-600' : 'text-zinc-600'}`}>
                          {product.total_stock} {product.base_unit || 'unit'}
                        </span>
                        <span className="text-sm font-bold text-zinc-950">
                          {formatCurrency(Number(product.selling_price))}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
