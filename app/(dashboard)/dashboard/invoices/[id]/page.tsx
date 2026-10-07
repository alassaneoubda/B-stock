'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Loader2,
  Printer,
  ArrowLeft,
  FileText,
  Trash2,
  Ban,
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, ApiError, toastError } from '@/lib/api-client'
import { formatDateShort, formatMoney, formatNumber } from '@/lib/format'
import { ErrorState, PageSkeleton } from '@/components/states'

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
  paid: { label: 'Payée', color: 'bg-success-soft text-success' },
  partial: { label: 'Partielle', color: 'bg-warning-soft text-warning-foreground' },
  draft: { label: 'Brouillon', color: 'bg-muted text-muted-foreground' },
  sent: { label: 'Envoyée', color: 'bg-brand-soft text-brand-strong' },
  cancelled: { label: 'Annulée', color: 'bg-destructive/10 text-destructive' },
}

const formatCurrency = formatMoney

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const printRef = useRef<HTMLDivElement>(null)
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<'delete' | 'cancel' | null>(null)
  const [acting, setActing] = useState(false)

  const invoiceId = params.id as string
  const shouldPrint = searchParams.get('print') === '1'

  useEffect(() => {
    if (shouldPrint && invoice && !isLoading) {
      setTimeout(() => window.print(), 500)
    }
  }, [shouldPrint, invoice, isLoading])

  // L'id peut être celui d'une VENTE (lien « Facture » de la liste des ventes) :
  // si aucune facture n'a cet id, on génère / retrouve celle de la vente.
  const tryGenerateFromSale = useCallback(async () => {
    setIsGenerating(true)
    try {
      const genData = await apiFetch('/api/invoices/generate', {
        method: 'POST',
        body: { orderId: invoiceId },
      })
      if (genData?.data?.id) {
        const detail = await apiFetch(`/api/invoices/${genData.data.id}`)
        setInvoice(detail.data)
      }
    } catch (e) {
      // 404 = ni facture ni vente : écran « Facture non trouvée »
      if (!(e instanceof ApiError && e.status === 404)) {
        setLoadError(e instanceof Error ? e.message : 'Erreur inattendue')
      }
    } finally {
      setIsGenerating(false)
    }
  }, [invoiceId])

  const fetchInvoice = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const data = await apiFetch(`/api/invoices/${invoiceId}`)
      if (data?.data) setInvoice(data.data)
      else await tryGenerateFromSale()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        await tryGenerateFromSale()
      } else {
        setLoadError(error instanceof Error ? error.message : 'Erreur inattendue')
      }
    } finally {
      setIsLoading(false)
    }
  }, [invoiceId, tryGenerateFromSale])

  useEffect(() => {
    fetchInvoice()
  }, [fetchInvoice])

  async function handleDelete() {
    if (!invoice || acting) return
    setActing(true)
    try {
      await apiFetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' })
      toast.success(`Facture ${invoice.invoice_number} supprimée`)
      setConfirmAction(null)
      router.push('/dashboard/invoices')
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Facture payée / partiellement payée : proposer l'annulation à la place
        toast.warning('Suppression impossible', { description: e.message })
        setConfirmAction('cancel')
      } else {
        setConfirmAction(null)
        toastError(e, 'Suppression impossible')
      }
    } finally {
      setActing(false)
    }
  }

  async function handleCancel() {
    if (!invoice || acting) return
    setActing(true)
    try {
      await apiFetch(`/api/invoices/${invoice.id}`, { method: 'PATCH', body: { status: 'cancelled' } })
      toast.success(`Facture ${invoice.invoice_number} annulée`)
      setInvoice({ ...invoice, status: 'cancelled' })
      setConfirmAction(null)
    } catch (e) {
      setConfirmAction(null)
      toastError(e, 'Annulation impossible')
    } finally {
      setActing(false)
    }
  }

  function handlePrint() {
    window.print()
  }

  if (isGenerating) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <DashboardHeader title="Facture" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/70 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Génération de la facture...</p>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return <PageSkeleton />
  }

  if (loadError) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <DashboardHeader title="Facture" />
        <main className="flex-1 p-4 lg:p-6">
          <ErrorState title="Impossible de charger la facture" description={loadError} onRetry={fetchInvoice} />
        </main>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <DashboardHeader title="Facture" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FileText className="h-12 w-12 text-muted-foreground/70 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-foreground mb-1">Facture non trouvée</h3>
            <p className="text-sm text-muted-foreground mb-4">La facture demandée n&apos;existe pas.</p>
            <Button size="sm" asChild>
              <Link href="/dashboard/invoices">Retour aux factures</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const status = statusConfig[invoice.status] || { label: invoice.status, color: 'bg-muted text-muted-foreground' }
  const partyName = invoice.type === 'client' ? invoice.client_name : invoice.supplier_name
  const partyPhone = invoice.type === 'client' ? invoice.client_phone : invoice.supplier_phone
  const partyAddress = invoice.type === 'client' ? invoice.client_address : invoice.supplier_address
  const partyEmail = invoice.type === 'client' ? invoice.client_email : invoice.supplier_email
  const isPaidOrPartial =
    invoice.status === 'paid' || invoice.status === 'partial' || Number(invoice.amount_paid) > 0
  const canAct = invoice.status !== 'cancelled'
  const productItems = invoice.items?.filter(i => i.item_type === 'product') || []
  const packagingItems = invoice.items?.filter(i => i.item_type === 'packaging') || []

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
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
              {canAct && (
                isPaidOrPartial ? (
                  <Button variant="outline" size="sm" className="h-8 text-xs text-destructive" onClick={() => setConfirmAction('cancel')}>
                    <Ban className="h-3.5 w-3.5 mr-1" />
                    <span className="hidden sm:inline">Annuler la facture</span>
                    <span className="sm:hidden">Annuler</span>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8 text-xs text-destructive" onClick={() => setConfirmAction('delete')}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Supprimer
                  </Button>
                )
              )}
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
          className="bg-card rounded-lg border border-border max-w-3xl mx-auto print:border-none print:shadow-none print:max-w-none"
        >
          {/* Invoice Header */}
          <div className="p-6 sm:p-8 border-b border-border print:p-8">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                    <span className="text-white text-lg font-bold">B</span>
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-foreground">
                      {invoice.company_name || 'B-Stock'}
                    </h1>
                    {invoice.company_address && (
                      <p className="text-xs text-muted-foreground">{invoice.company_address}</p>
                    )}
                  </div>
                </div>
                {invoice.company_phone && (
                  <p className="text-xs text-muted-foreground">Tél: {invoice.company_phone}</p>
                )}
                {invoice.company_email && (
                  <p className="text-xs text-muted-foreground">Email: {invoice.company_email}</p>
                )}
              </div>

              <div className="text-left sm:text-right">
                <h2 className="text-2xl font-bold text-foreground tracking-tight">FACTURE</h2>
                <p className="text-sm font-mono font-medium text-brand-strong mt-1">
                  {invoice.invoice_number}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Date: {formatDateShort(invoice.created_at)}
                </p>
                <Badge className={`mt-2 text-xs font-medium ${status.color} border-none no-print`}>
                  {status.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Client/Supplier Info */}
          <div className="p-6 sm:p-8 border-b border-border print:p-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">
                  {invoice.type === 'client' ? 'Facturé à' : 'Fournisseur'}
                </p>
                <p className="text-sm font-semibold text-foreground">{partyName || '—'}</p>
                {partyPhone && <p className="text-xs text-muted-foreground mt-0.5">Tél: {partyPhone}</p>}
                {partyAddress && <p className="text-xs text-muted-foreground mt-0.5">{partyAddress}</p>}
                {partyEmail && <p className="text-xs text-muted-foreground mt-0.5">{partyEmail}</p>}
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-2">
                  Détails
                </p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium text-foreground/80">
                      {invoice.type === 'client' ? 'Facture client' : 'Facture fournisseur'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Statut</span>
                    <span className="font-medium text-foreground/80">{status.label}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="p-6 sm:p-8 print:p-8">
            {productItems.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Produits</h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Description</th>
                        <th className="text-right text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Qté</th>
                        <th className="text-right text-[10px] font-medium text-muted-foreground uppercase px-4 py-2 hidden sm:table-cell">P.U.</th>
                        <th className="text-right text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {productItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5 text-sm text-foreground">
                            {item.product_name || item.description || 'Produit'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-muted-foreground text-right">{formatNumber(item.quantity)}</td>
                          <td className="px-4 py-2.5 text-sm text-muted-foreground text-right hidden sm:table-cell">
                            {formatCurrency(Number(item.unit_price))}
                          </td>
                          <td className="px-4 py-2.5 text-sm font-medium text-foreground text-right">
                            {formatCurrency(Number(item.total_price))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            )}

            {packagingItems.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Emballages</h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Description</th>
                        <th className="text-right text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Qté</th>
                        <th className="text-right text-[10px] font-medium text-muted-foreground uppercase px-4 py-2 hidden sm:table-cell">P.U.</th>
                        <th className="text-right text-[10px] font-medium text-muted-foreground uppercase px-4 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {packagingItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2.5 text-sm text-foreground">
                            {item.product_name || item.description || 'Emballage'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-muted-foreground text-right">{formatNumber(item.quantity)}</td>
                          <td className="px-4 py-2.5 text-sm text-muted-foreground text-right hidden sm:table-cell">
                            {formatCurrency(Number(item.unit_price))}
                          </td>
                          <td className="px-4 py-2.5 text-sm font-medium text-foreground text-right">
                            {formatCurrency(Number(item.total_price))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-full sm:w-72 space-y-2 pt-4 border-t border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total HT</span>
                  <span className="font-medium text-foreground">{formatCurrency(Number(invoice.total_amount))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total TTC</span>
                  <span className="font-semibold text-foreground">{formatCurrency(Number(invoice.total_amount))}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-border">
                  <span className="text-muted-foreground">Montant payé</span>
                  <span className="font-medium text-success">{formatCurrency(Number(invoice.amount_paid))}</span>
                </div>
                {Number(invoice.remaining_amount) > 0 && (
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-border">
                    <span className="text-destructive">Reste à payer</span>
                    <span className="text-destructive">{formatCurrency(Number(invoice.remaining_amount))}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="mt-8 pt-4 border-t border-border">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1">Notes</p>
                <p className="text-xs text-muted-foreground">{invoice.notes}</p>
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-4 border-t border-border text-center">
              <p className="text-[10px] text-muted-foreground/70">
                Merci pour votre confiance — {invoice.company_name || 'B-Stock'}
              </p>
            </div>
          </div>
        </div>
      </main>

      <AlertDialog open={confirmAction !== null} onOpenChange={(o) => { if (!o && !acting) setConfirmAction(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'delete'
                ? `Supprimer la facture ${invoice.invoice_number} ?`
                : `Annuler la facture ${invoice.invoice_number} ?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'delete'
                ? 'La facture sera définitivement supprimée. Cette action est irréversible.'
                : `La facture passera au statut « Annulée » et restera dans l'historique${Number(invoice.amount_paid) > 0 ? ` (${formatCurrency(Number(invoice.amount_paid))} déjà encaissés : régularisez le client si nécessaire)` : ''}. Cette action est définitive.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={acting}>Revenir</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (confirmAction === 'delete') handleDelete(); else handleCancel() }}
              disabled={acting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {acting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {confirmAction === 'delete' ? 'Oui, supprimer' : 'Oui, annuler la facture'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
