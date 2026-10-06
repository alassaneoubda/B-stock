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
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
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
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
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
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
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
        <div className="bg-white rounded-lg border border-zinc-200/80 max-w-4xl mx-auto print:border-none print:shadow-none print:max-w-none">
          {/* Header */}
          <div className="p-6 sm:p-8 border-b border-zinc-100 print:p-8">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="h-10 w-10 rounded-lg bg-zinc-950 flex items-center justify-center">
                    <span className="text-white text-lg font-bold">B</span>
                  </div>
                  <h1 className="text-lg font-bold text-zinc-950">{data.company.name || 'B-Stock'}</h1>
                </div>
                {data.company.address && <p className="text-xs text-zinc-500">{data.company.address}</p>}
                {data.company.phone && <p className="text-xs text-zinc-500">Tél: {data.company.phone}</p>}
              </div>
              <div className="text-left sm:text-right">
                <h2 className="text-xl font-bold text-zinc-950 tracking-tight">ÉTAT DU STOCK</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  {formatDateTime(data.exportDate)}
                </p>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="p-6 sm:p-8 border-b border-zinc-100 print:p-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Références</p>
                <p className="text-lg font-bold text-zinc-950">{formatNumber(data.products.length)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Quantité totale</p>
                <p className="text-lg font-bold text-zinc-950">{formatNumber(totalItems)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Valeur totale</p>
                <p className="text-lg font-bold text-zinc-950">{formatMoney(totalValue)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">Stock bas</p>
                <p className={`text-lg font-bold ${lowStock.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{lowStock.length}</p>
              </div>
            </div>
          </div>

          {/* Products Table */}
          <div className="p-6 sm:p-8 print:p-8">
            <h3 className="text-xs font-semibold text-zinc-950 uppercase tracking-wider mb-3">Détail des produits</h3>
            {data.products.length === 0 ? (
              <EmptyState
                title="Aucun produit en stock"
                description="Les produits apparaîtront ici après un approvisionnement."
                action={{ label: 'Retour au stock', href: '/dashboard/stock' }}
              />
            ) : (
            <div className="border border-zinc-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200">
                    <th className="text-left text-[10px] font-medium text-zinc-500 uppercase px-3 py-2">Produit</th>
                    <th className="text-left text-[10px] font-medium text-zinc-500 uppercase px-3 py-2 hidden sm:table-cell">SKU</th>
                    <th className="text-left text-[10px] font-medium text-zinc-500 uppercase px-3 py-2 hidden sm:table-cell">Catégorie</th>
                    <th className="text-right text-[10px] font-medium text-zinc-500 uppercase px-3 py-2">Qté</th>
                    <th className="text-right text-[10px] font-medium text-zinc-500 uppercase px-3 py-2">Prix</th>
                    <th className="text-right text-[10px] font-medium text-zinc-500 uppercase px-3 py-2">Valeur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.products.map((p, i) => {
                    const isLow = Number(p.stock_quantity) <= Number(p.min_stock_level)
                    return (
                      <tr key={i} className={isLow ? 'bg-red-50/50' : ''}>
                        <td className="px-3 py-2 text-sm text-zinc-900 font-medium">
                          {p.name}
                          {isLow && <span className="text-[10px] text-red-500 ml-1 font-normal">(bas)</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-500 font-mono hidden sm:table-cell">{p.sku}</td>
                        <td className="px-3 py-2 text-xs text-zinc-500 hidden sm:table-cell">{p.category || '—'}</td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${isLow ? 'text-red-600' : 'text-zinc-900'}`}>
                          {formatNumber(p.stock_quantity)}
                        </td>
                        <td className="px-3 py-2 text-sm text-right text-zinc-600">{formatMoney(p.selling_price)}</td>
                        <td className="px-3 py-2 text-sm text-right font-medium text-zinc-900">{formatMoney(Number(p.stock_quantity) * Number(p.selling_price))}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-zinc-50 border-t border-zinc-200">
                    <td colSpan={3} className="px-3 py-2 text-sm font-semibold text-zinc-950 hidden sm:table-cell">Total</td>
                    <td className="px-3 py-2 text-sm font-semibold text-zinc-950 sm:hidden">Total</td>
                    <td className="px-3 py-2 text-sm text-right font-bold text-zinc-950">{formatNumber(totalItems)}</td>
                    <td className="px-3 py-2 text-sm text-right text-zinc-600">—</td>
                    <td className="px-3 py-2 text-sm text-right font-bold text-zinc-950">{formatMoney(totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-zinc-100 text-center">
              <p className="text-[10px] text-zinc-400">
                Document généré le {formatDate(new Date())} — {data.company.name || 'B-Stock'}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
