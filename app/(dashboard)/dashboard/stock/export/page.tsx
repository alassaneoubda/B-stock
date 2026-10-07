'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Printer, ArrowLeft } from 'lucide-react'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import Link from 'next/link'

type StockProduct = {
  name: string
  sku: string
  category: string | null
  selling_price: number
  purchase_price: number
  stock_quantity: number
  min_stock_level: number
  unit: string | null
}

type StockExportData = {
  products: StockProduct[]
  company: { name?: string; phone?: string; address?: string; email?: string }
  exportDate: string
}

export default function StockExportPage() {
  const [data, setData] = useState<StockExportData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const json = await apiFetch<{ data: StockExportData }>('/api/stock/export')
      setData(json.data)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <DashboardHeader title="Export Stock" />
        <main className="flex-1 p-4 lg:p-6">
          <div className="max-w-4xl mx-auto">
            <TableSkeleton rows={8} columns={5} />
          </div>
        </main>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <DashboardHeader title="Export Stock" />
        <main className="flex-1 p-4 lg:p-6">
          <ErrorState
            className="max-w-4xl mx-auto"
            description={error ?? "L'état du stock n'a pas pu être chargé."}
            onRetry={fetchData}
          />
        </main>
      </div>
    )
  }

  const totalValue = data.products.reduce((s, p) => s + Number(p.stock_quantity) * Number(p.selling_price), 0)
  const totalItems = data.products.reduce((s, p) => s + Number(p.stock_quantity), 0)
  const lowStock = data.products.filter(p => Number(p.stock_quantity) <= Number(p.min_stock_level))

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <div className="no-print">
        <DashboardHeader
          title="Export du stock"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                <Link href="/dashboard/stock">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  Retour
                </Link>
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Imprimer / PDF</span>
                <span className="sm:hidden">PDF</span>
              </Button>
            </div>
          }
        />
      </div>

      <main className="flex-1 p-4 lg:p-6">
        <div className="bg-card rounded-lg border border-border max-w-4xl mx-auto print:border-none print:shadow-none print:max-w-none">
          {/* Header */}
          <div className="p-6 sm:p-8 border-b border-border print:p-8">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                    <span className="text-white text-lg font-bold">B</span>
                  </div>
                  <h1 className="text-lg font-bold text-foreground">{data.company.name || 'B-Stock'}</h1>
                </div>
                {data.company.address && <p className="text-xs text-muted-foreground">{data.company.address}</p>}
                {data.company.phone && <p className="text-xs text-muted-foreground">Tél: {data.company.phone}</p>}
              </div>
              <div className="text-left sm:text-right">
                <h2 className="text-xl font-bold text-foreground tracking-tight">ÉTAT DU STOCK</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDateTime(data.exportDate)}
                </p>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="p-6 sm:p-8 border-b border-border print:p-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Références</p>
                <p className="text-lg font-bold text-foreground">{formatNumber(data.products.length)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Quantité totale</p>
                <p className="text-lg font-bold text-foreground">{formatNumber(totalItems)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Valeur totale</p>
                <p className="text-lg font-bold text-foreground">{formatMoney(totalValue)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">Stock bas</p>
                <p className={`text-lg font-bold ${lowStock.length > 0 ? 'text-destructive' : 'text-success'}`}>{lowStock.length}</p>
              </div>
            </div>
          </div>

          {/* Products Table */}
          <div className="p-6 sm:p-8 print:p-8">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Détail des produits</h3>
            {data.products.length === 0 ? (
              <EmptyState
                title="Aucun produit en stock"
                description="Les produits apparaîtront ici après un approvisionnement."
                action={{ label: 'Retour au stock', href: '/dashboard/stock' }}
              />
            ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left text-[10px] font-medium text-muted-foreground uppercase px-3 py-2">Produit</th>
                    <th className="text-left text-[10px] font-medium text-muted-foreground uppercase px-3 py-2 hidden sm:table-cell">SKU</th>
                    <th className="text-left text-[10px] font-medium text-muted-foreground uppercase px-3 py-2 hidden sm:table-cell">Catégorie</th>
                    <th className="text-right text-[10px] font-medium text-muted-foreground uppercase px-3 py-2">Qté</th>
                    <th className="text-right text-[10px] font-medium text-muted-foreground uppercase px-3 py-2">Prix</th>
                    <th className="text-right text-[10px] font-medium text-muted-foreground uppercase px-3 py-2">Valeur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.products.map((p, i) => {
                    const isLow = Number(p.stock_quantity) <= Number(p.min_stock_level)
                    return (
                      <tr key={i} className={isLow ? 'bg-destructive/10' : ''}>
                        <td className="px-3 py-2 text-sm text-foreground font-medium">
                          {p.name}
                          {isLow && <span className="text-[10px] text-destructive ml-1 font-normal">(bas)</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground font-mono hidden sm:table-cell">{p.sku}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground hidden sm:table-cell">{p.category || '—'}</td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${isLow ? 'text-destructive' : 'text-foreground'}`}>
                          {formatNumber(p.stock_quantity)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right text-muted-foreground">{formatMoney(p.selling_price)}</td>
                        <td className="px-3 py-2 text-sm text-right font-medium text-foreground">{formatMoney(Number(p.stock_quantity) * Number(p.selling_price))}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 border-t border-border">
                    <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-foreground hidden sm:table-cell">Total</td>
                    <td className="px-3 py-2 text-sm font-semibold text-foreground sm:hidden">Total</td>
                    <td className="px-3 py-2 text-sm text-right font-bold text-foreground">{formatNumber(totalItems)}</td>
                    <td className="px-3 py-2 text-sm text-right text-muted-foreground">—</td>
                    <td className="px-3 py-2 text-sm text-right font-bold text-foreground">{formatMoney(totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-border text-center">
              <p className="text-[10px] text-muted-foreground/70">
                Document généré le {formatDate(new Date())} — {data.company.name || 'B-Stock'}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
