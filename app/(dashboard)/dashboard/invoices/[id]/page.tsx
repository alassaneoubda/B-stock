'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Printer,
  Download,
  ArrowLeft,
  FileText,
} from 'lucide-react'
import Link from 'next/link'

type InvoiceItem = {
  id: string
  product_name: string | null
  description: string | null
  quantity: number
  unit_price: number
  total_price: number
  item_type: string
}

type InvoiceDetail = {
  id: string
  invoice_number: string
  type: 'client' | 'supplier'
  total_amount: number
  amount_paid: number
  remaining_amount: number
  status: string
  notes: string | null
  created_at: string
  client_name: string | null
  client_phone: string | null
  client_address: string | null
  client_email: string | null
  supplier_name: string | null
  supplier_phone: string | null
  supplier_address: string | null
  supplier_email: string | null
  company_name: string | null
  company_phone: string | null
  company_address: string | null
  company_email: string | null
  items: InvoiceItem[]
}

const statusConfig: Record<string, { label: string; color: string }> = {
  paid: { label: 'Payée', color: 'bg-emerald-50 text-emerald-700' },
  partial: { label: 'Partielle', color: 'bg-amber-50 text-amber-700' },
  draft: { label: 'Brouillon', color: 'bg-zinc-100 text-zinc-600' },
  sent: { label: 'Envoyée', color: 'bg-blue-50 text-blue-700' },
  cancelled: { label: 'Annulée', color: 'bg-red-50 text-red-600' },
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount)
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const printRef = useRef<HTMLDivElement>(null)
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  const invoiceId = params.id as string
  const shouldPrint = searchParams.get('print') === '1'

  useEffect(() => {
    fetchInvoice()
  }, [invoiceId])

  useEffect(() => {
    if (shouldPrint && invoice && !isLoading) {
      setTimeout(() => window.print(), 500)
    }
  }, [shouldPrint, invoice, isLoading])

  async function fetchInvoice() {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setInvoice(data.data)
        } else {
          await tryGenerateFromSale()
        }
      } else if (res.status === 404) {
        await tryGenerateFromSale()
      }
    } catch (error) {
      console.error('Error:', error)
      await tryGenerateFromSale()
    } finally {
      setIsLoading(false)
    }
  }

  async function tryGenerateFromSale() {
    setIsGenerating(true)
    try {
      const genRes = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: invoiceId }),
      })
      if (genRes.ok) {
        const genData = await genRes.json()
        if (genData.success && genData.data?.id) {
          const detailRes = await fetch(`/api/invoices/${genData.data.id}`)
          if (detailRes.ok) {
            const detail = await detailRes.json()
            setInvoice(detail.data)
          }
        }
      }
    } catch (e) {
      console.error('Error generating invoice:', e)
    } finally {
      setIsGenerating(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  if (isLoading || isGenerating) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Facture" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">
              {isGenerating ? 'Génération de la facture...' : 'Chargement...'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Facture" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText className="h-12 w-12 text-zinc-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-zinc-950 mb-1">Facture non trouvée</h3>
            <p className="text-sm text-zinc-500 mb-4">La facture demandée n'existe pas.</p>
            <Button size="sm" asChild>
              <Link href="/dashboard/invoices">Retour aux factures</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const status = statusConfig[invoice.status] || { label: invoice.status, color: 'bg-zinc-100 text-zinc-600' }
  const partyName = invoice.type === 'client' ? invoice.client_name : invoice.supplier_name
  const partyPhone = invoice.type === 'client' ? invoice.client_phone : invoice.supplier_phone
  const partyAddress = invoice.type === 'client' ? invoice.client_address : invoice.supplier_address
  const partyEmail = invoice.type === 'client' ? invoice.client_email : invoice.supplier_email
  const productItems = invoice.items?.filter(i => i.item_type === 'product') || []
  const packagingItems = invoice.items?.filter(i => i.item_type === 'packaging') || []

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      {/* Header - hidden on print */}
      <div className="no-print">
        <DashboardHeader
          title={`Facture ${invoice.invoice_number}`}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                <Link href="/dashboard/invoices">
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                  Retour
                </Link>
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={handlePrint}>
                <Printer className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline">Imprimer / PDF</span>
                <span className="sm:hidden">PDF</span>
              </Button>
            </div>
          }
        />
      </div>

      <main className="flex-1 p-4 lg:p-6">
        {/* Invoice Document */}
        <div
          ref={printRef}
          className="bg-white rounded-lg border border-zinc-200/80 max-w-3xl mx-auto print:border-none print:shadow-none print:max-w-none"
        >
          {/* Invoice Header */}
          <div className="p-6 sm:p-8 border-b border-zinc-100 print:p-8">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg bg-zinc-950 flex items-center justify-center">
                    <span className="text-white text-lg font-bold">B</span>
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-zinc-950">
                      {invoice.company_name || 'B-Stock'}
                    </h1>
                    {invoice.company_address && (
                      <p className="text-xs text-zinc-500">{invoice.company_address}</p>
                    )}
                  </div>
                </div>
                {invoice.company_phone && (
                  <p className="text-xs text-zinc-500">Tél: {invoice.company_phone}</p>
                )}
                {invoice.company_email && (
                  <p className="text-xs text-zinc-500">Email: {invoice.company_email}</p>
                )}
              </div>

              <div className="text-left sm:text-right">
                <h2 className="text-2xl font-bold text-zinc-950 tracking-tight">FACTURE</h2>
                <p className="text-sm font-mono font-medium text-blue-600 mt-1">
                  {invoice.invoice_number}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Date: {new Date(invoice.created_at).toLocaleDateString('fr-FR', {
                    day: '2-digit', month: 'long', year: 'numeric'
                  })}
                </p>
                <Badge className={`mt-2 text-xs font-medium ${status.color} border-none no-print`}>
                  {status.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Client/Supplier Info */}
          <div className="p-6 sm:p-8 border-b border-zinc-100 print:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-2">
                  {invoice.type === 'client' ? 'Facturé à' : 'Fournisseur'}
                </p>
                <p className="text-sm font-semibold text-zinc-950">{partyName || '—'}</p>
                {partyPhone && <p className="text-xs text-zinc-500 mt-0.5">Tél: {partyPhone}</p>}
                {partyAddress && <p className="text-xs text-zinc-500 mt-0.5">{partyAddress}</p>}
                {partyEmail && <p className="text-xs text-zinc-500 mt-0.5">{partyEmail}</p>}
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-2">
                  Détails
                </p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Type</span>
                    <span className="font-medium text-zinc-700">
                      {invoice.type === 'client' ? 'Facture client' : 'Facture fournisseur'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Statut</span>
                    <span className="font-medium text-zinc-700">{status.label}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="p-6 sm:p-8 print:p-8">
            {productItems.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-zinc-950 uppercase tracking-wider mb-3">Produits</h3>
                <div className="border border-zinc-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200">
                        <th className="text-left text-[10px] font-medium text-zinc-500 uppercase px-4 py-2">Description</th>
                        <th className="text-right text-[10px] font-medium text-zinc-500 uppercase px-4 py-2">Qté</th>
                        <th className="text-right text-[10px] font-medium text-zinc-500 uppercase px-4 py-2 hidden sm:table-cell">P.U.</th>
                        <th className="text-right text-[10px] font-medium text-zinc-500 uppercase px-4 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {productItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5 text-sm text-zinc-900">
                            {item.product_name || item.description || 'Produit'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-zinc-600 text-right">{Number(item.quantity)}</td>
                          <td className="px-4 py-2.5 text-sm text-zinc-600 text-right hidden sm:table-cell">
                            {formatCurrency(Number(item.unit_price))}
                          </td>
                          <td className="px-4 py-2.5 text-sm font-medium text-zinc-900 text-right">
                            {formatCurrency(Number(item.total_price))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {packagingItems.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-zinc-950 uppercase tracking-wider mb-3">Emballages</h3>
                <div className="border border-zinc-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200">
                        <th className="text-left text-[10px] font-medium text-zinc-500 uppercase px-4 py-2">Description</th>
                        <th className="text-right text-[10px] font-medium text-zinc-500 uppercase px-4 py-2">Qté</th>
                        <th className="text-right text-[10px] font-medium text-zinc-500 uppercase px-4 py-2 hidden sm:table-cell">P.U.</th>
                        <th className="text-right text-[10px] font-medium text-zinc-500 uppercase px-4 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {packagingItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5 text-sm text-zinc-900">
                            {item.product_name || item.description || 'Emballage'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-zinc-600 text-right">{Number(item.quantity)}</td>
                          <td className="px-4 py-2.5 text-sm text-zinc-600 text-right hidden sm:table-cell">
                            {formatCurrency(Number(item.unit_price))}
                          </td>
                          <td className="px-4 py-2.5 text-sm font-medium text-zinc-900 text-right">
                            {formatCurrency(Number(item.total_price))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full sm:w-72 space-y-2 pt-4 border-t border-zinc-200">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Total HT</span>
                  <span className="font-medium text-zinc-900">{formatCurrency(Number(invoice.total_amount))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Total TTC</span>
                  <span className="font-semibold text-zinc-950">{formatCurrency(Number(invoice.total_amount))}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-zinc-100">
                  <span className="text-zinc-500">Montant payé</span>
                  <span className="font-medium text-emerald-600">{formatCurrency(Number(invoice.amount_paid))}</span>
                </div>
                {Number(invoice.remaining_amount) > 0 && (
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-zinc-200">
                    <span className="text-red-600">Reste à payer</span>
                    <span className="text-red-600">{formatCurrency(Number(invoice.remaining_amount))}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="mt-8 pt-4 border-t border-zinc-100">
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 mb-1">Notes</p>
                <p className="text-xs text-zinc-600">{invoice.notes}</p>
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-zinc-100 text-center">
              <p className="text-[10px] text-zinc-400">
                Merci pour votre confiance — {invoice.company_name || 'B-Stock'}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
