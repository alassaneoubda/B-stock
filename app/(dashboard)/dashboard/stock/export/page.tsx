'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
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


  const backLink = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link href="/dashboard/stock">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Stock
      </Link>
    </Button>
  )

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="État du stock" description="Chargement…" />
        <PageShell>
          <div className="mx-auto w-full max-w-4xl space-y-6">
            {backLink}
            <div className="rounded-xl border border-border bg-card p-5">
              <TableSkeleton rows={8} columns={5} />
            </div>
          </div>
        </PageShell>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="État du stock" />
        <PageShell>
          <div className="mx-auto w-full max-w-4xl space-y-6">
            {backLink}
            <ErrorState
              description={error ?? "L'état du stock n'a pas pu être chargé."}
              onRetry={fetchData}
            />
          </div>
        </PageShell>
      </div>
    )
  }

  const totalValue = data.products.reduce((s, p) => s + Number(p.stock_quantity) * Number(p.selling_price), 0)
  const totalItems = data.products.reduce((s, p) => s + Number(p.stock_quantity), 0)
  const lowStock = data.products.filter(p => Number(p.stock_quantity) <= Number(p.min_stock_level))

  return (
    <div className="flex min-h-screen flex-col">
      <div className="no-print">
        <DashboardHeader
          title="État du stock"
          description="Document imprimable ou exportable en PDF"
          actions={
            <Button size="sm" className="h-9" onClick={() => window.print()} aria-label="Imprimer ou enregistrer en PDF">
              <Printer className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Imprimer / PDF</span>
            </Button>
          }
        />
      </div>

      <PageShell className="print:max-w-none print:space-y-0">
        <div className="no-print mx-auto w-full max-w-4xl">{backLink}</div>

        <article className="mx-auto w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] print:max-w-none print:rounded-none print:border-none print:shadow-none">
          {/* En-tête du document */}
          <div className="border-b border-border p-6 sm:p-8 print:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary" aria-hidden="true">
                    <span className="text-lg font-semibold text-primary-foreground">B</span>
                  </div>
                  <p className="text-lg font-semibold text-foreground">{data.company.name || 'B-Stock'}</p>
                </div>
                {data.company.address && <p className="text-xs text-muted-foreground">{data.company.address}</p>}
                {data.company.phone && <p className="text-xs text-muted-foreground">Tél. : {data.company.phone}</p>}
              </div>
              <div className="text-left sm:text-right">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">État du stock</h2>
                <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(data.exportDate)}</p>
              </div>
            </div>
          </div>

          {/* Synthèse */}
          <div className="border-b border-border p-6 sm:p-8 print:p-8">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Références</dt>
                <dd className="tabular text-lg font-semibold text-foreground">{formatNumber(data.products.length)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Quantité totale</dt>
                <dd className="tabular text-lg font-semibold text-foreground">{formatNumber(totalItems)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Valeur totale</dt>
                <dd className="tabular text-lg font-semibold text-foreground">{formatMoney(totalValue)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-muted-foreground">Stock bas</dt>
                <dd className={`tabular text-lg font-semibold ${lowStock.length > 0 ? 'text-destructive' : 'text-success'}`}>
                  {formatNumber(lowStock.length)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Détail des produits */}
          <div className="p-6 sm:p-8 print:p-8">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Détail des produits</h3>
            {data.products.length === 0 ? (
              <EmptyState
                title="Aucun produit en stock"
                description="Les produits apparaîtront ici après un approvisionnement."
                action={{ label: 'Retour au stock', href: '/dashboard/stock' }}
              />
            ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Produit</th>
                    <th className="hidden px-3 py-2 text-left text-xs font-medium text-muted-foreground sm:table-cell">SKU</th>
                    <th className="hidden px-3 py-2 text-left text-xs font-medium text-muted-foreground sm:table-cell">Catégorie</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qté</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Prix</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Valeur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.products.map((p, i) => {
                    const isLow = Number(p.stock_quantity) <= Number(p.min_stock_level)
                    return (
                      <tr key={i} className={isLow ? 'bg-destructive/5' : ''}>
                        <td className="px-3 py-2 text-sm font-medium text-foreground">
                          {p.name}
                          {isLow && <span className="ml-1.5 text-xs font-normal text-destructive">(stock bas)</span>}
                        </td>
                        <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground sm:table-cell">{p.sku}</td>
                        <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">{p.category || '—'}</td>
                        <td className={`tabular px-3 py-2 text-right text-sm font-medium ${isLow ? 'text-destructive' : 'text-foreground'}`}>
                          {formatNumber(p.stock_quantity)}
                        </td>
                        <td className="tabular px-3 py-2 text-right text-sm text-muted-foreground">{formatMoney(p.selling_price)}</td>
                        <td className="tabular px-3 py-2 text-right text-sm font-medium text-foreground">{formatMoney(Number(p.stock_quantity) * Number(p.selling_price))}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/50">
                    <td colSpan={3} className="hidden px-3 py-2 text-sm font-semibold text-foreground sm:table-cell">Total</td>
                    <td className="px-3 py-2 text-sm font-semibold text-foreground sm:hidden">Total</td>
                    <td className="tabular px-3 py-2 text-right text-sm font-semibold text-foreground">{formatNumber(totalItems)}</td>
                    <td className="px-3 py-2 text-right text-sm text-muted-foreground">—</td>
                    <td className="tabular px-3 py-2 text-right text-sm font-semibold text-foreground">{formatMoney(totalValue)}</td>
                  </tr>
                </tfoot>
              </table>
              </div>
            </div>
            )}

            {/* Pied du document */}
            <div className="mt-8 border-t border-border pt-4 text-center">
              <p className="text-xs text-muted-foreground">
                Document généré le {formatDate(new Date())} — {data.company.name || 'B-Stock'}
              </p>
            </div>
          </div>
        </article>
      </PageShell>
    </div>
  )
}
