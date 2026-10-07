'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
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
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

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

type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

const statusConfig: Record<string, { label: string; tone: Tone }> = {
  paid: { label: 'Payée', tone: 'success' },
  partial: { label: 'Partielle', tone: 'warning' },
  draft: { label: 'Brouillon', tone: 'default' },
  sent: { label: 'Envoyée', tone: 'info' },
  cancelled: { label: 'Annulée', tone: 'danger' },
}

function getStatus(status: string): { label: string; tone: Tone } {
  return statusConfig[status] || { label: status, tone: 'default' }
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
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Facture" />
        <PageShell className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Génération de la facture…</p>
          </div>
        </PageShell>
      </div>
    )
  }

  if (isLoading) {
    return <PageSkeleton />
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Facture" />
        <PageShell>
          <BackLink />
          <ErrorState title="Impossible de charger la facture" description={loadError} onRetry={fetchInvoice} />
        </PageShell>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Facture" />
        <PageShell>
          <BackLink />
          <EmptyState
            icon={FileText}
            title="Facture non trouvée"
            description="La facture demandée n'existe pas ou a été supprimée."
            action={{ label: 'Retour aux factures', href: '/dashboard/invoices' }}
          />
        </PageShell>
      </div>
    )
  }

  const status = getStatus(invoice.status)
  const partyName = invoice.type === 'client' ? invoice.client_name : invoice.supplier_name
  const partyPhone = invoice.type === 'client' ? invoice.client_phone : invoice.supplier_phone
  const partyAddress = invoice.type === 'client' ? invoice.client_address : invoice.supplier_address
  const partyEmail = invoice.type === 'client' ? invoice.client_email : invoice.supplier_email
  const isPaidOrPartial =
    invoice.status === 'paid' || invoice.status === 'partial' || Number(invoice.amount_paid) > 0
  const canAct = invoice.status !== 'cancelled'
  const productItems = invoice.items?.filter(i => i.item_type === 'product') || []
  const packagingItems = invoice.items?.filter(i => i.item_type === 'packaging') || []
  const remaining = Number(invoice.remaining_amount)

  const itemSections = [
    { key: 'product', title: 'Produits', fallback: 'Produit', items: productItems },
    { key: 'packaging', title: 'Emballages', fallback: 'Emballage', items: packagingItems },
  ].filter((s) => s.items.length > 0)

  return (
    <div className="flex min-h-screen flex-col">
      {/* En-tête — masqué à l'impression */}
      <div className="no-print">
        <DashboardHeader
          title={`Facture ${invoice.invoice_number}`}
          description={invoice.type === 'client' ? 'Facture client' : 'Facture fournisseur'}
        />
      </div>

      <PageShell>
        {/* Retour, titre, statut, actions — masqués à l'impression */}
        <div className="no-print space-y-3">
          <BackLink />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h2 className="truncate font-mono text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {invoice.invoice_number}
              </h2>
              <StatusBadge label={status.label} tone={status.tone} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canAct && (
                isPaidOrPartial ? (
                  <Button variant="outline" onClick={() => setConfirmAction('cancel')} className="text-destructive hover:text-destructive">
                    <Ban className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">Annuler la facture</span>
                    <span className="sm:hidden">Annuler</span>
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setConfirmAction('delete')} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Supprimer
                  </Button>
                )
              )}
              <Button variant="brand" onClick={handlePrint}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                Imprimer / PDF
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3 print:block">
          {/* Document imprimable */}
          <div
            ref={printRef}
            className="overflow-hidden rounded-xl border border-border bg-card lg:col-span-2 print:rounded-none print:border-none print:bg-white print:text-black print:shadow-none"
          >
            {/* Émetteur / numéro */}
            <div className="border-b border-border p-6 sm:p-8 print:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary print:border print:border-black print:bg-white">
                      <span className="text-lg font-semibold text-primary-foreground print:text-black">B</span>
                    </div>
                    <div>
                      <p className="text-base font-semibold text-foreground print:text-black">
                        {invoice.company_name || 'B-Stock'}
                      </p>
                      {invoice.company_address && (
                        <p className="text-xs text-muted-foreground">{invoice.company_address}</p>
                      )}
                    </div>
                  </div>
                  {invoice.company_phone && (
                    <p className="text-xs text-muted-foreground">Tél. {invoice.company_phone}</p>
                  )}
                  {invoice.company_email && (
                    <p className="text-xs text-muted-foreground">{invoice.company_email}</p>
                  )}
                </div>

                <div className="space-y-1 text-left sm:text-right">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground print:text-black">Facture</h1>
                  <p className="font-mono text-sm font-medium text-foreground print:text-black">
                    {invoice.invoice_number}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Émise le {formatDateShort(invoice.created_at)}
                  </p>
                </div>
              </div>
            </div>

            {/* Tiers / détails */}
            <div className="border-b border-border p-6 sm:p-8 print:p-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {invoice.type === 'client' ? 'Facturé à' : 'Fournisseur'}
                  </p>
                  <p className="text-sm font-semibold text-foreground print:text-black">{partyName || '—'}</p>
                  {partyPhone && <p className="mt-0.5 text-xs text-muted-foreground">Tél. {partyPhone}</p>}
                  {partyAddress && <p className="mt-0.5 text-xs text-muted-foreground">{partyAddress}</p>}
                  {partyEmail && <p className="mt-0.5 text-xs text-muted-foreground">{partyEmail}</p>}
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Détails</p>
                  <dl className="space-y-1 text-xs">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Type</dt>
                      <dd className="font-medium text-foreground print:text-black">
                        {invoice.type === 'client' ? 'Facture client' : 'Facture fournisseur'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Statut</dt>
                      <dd className="font-medium text-foreground print:text-black">{status.label}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Lignes */}
            <div className="space-y-6 p-6 sm:p-8 print:p-8">
              {itemSections.map((section) => (
                <div key={section.key}>
                  <h3 className="mb-3 text-sm font-semibold text-foreground print:text-black">{section.title}</h3>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/50 print:bg-white">
                            <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Désignation</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Qté</th>
                            <th className="hidden px-4 py-2 text-right text-xs font-medium text-muted-foreground sm:table-cell print:table-cell">Prix unitaire</th>
                            <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {section.items.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-2.5 text-sm text-foreground print:text-black">
                                {item.product_name || item.description || section.fallback}
                              </td>
                              <td className="tabular px-4 py-2.5 text-right text-sm text-muted-foreground">{formatNumber(item.quantity)}</td>
                              <td className="tabular hidden px-4 py-2.5 text-right text-sm text-muted-foreground sm:table-cell print:table-cell">
                                {formatCurrency(Number(item.unit_price))}
                              </td>
                              <td className="tabular px-4 py-2.5 text-right text-sm font-medium text-foreground print:text-black">
                                {formatCurrency(Number(item.total_price))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}

              {/* Totaux */}
              <div className="flex justify-end">
                <dl className="w-full space-y-2 border-t border-border pt-4 text-sm sm:w-72">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total HT</dt>
                    <dd className="tabular font-medium text-foreground print:text-black">{formatCurrency(Number(invoice.total_amount))}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total TTC</dt>
                    <dd className="tabular font-semibold text-foreground print:text-black">{formatCurrency(Number(invoice.total_amount))}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <dt className="text-muted-foreground">Montant payé</dt>
                    <dd className="tabular font-medium text-success print:text-black">{formatCurrency(Number(invoice.amount_paid))}</dd>
                  </div>
                  {remaining > 0 && (
                    <div className="flex justify-between border-t border-border pt-2 font-semibold">
                      <dt className="text-destructive print:text-black">Reste à payer</dt>
                      <dd className="tabular text-destructive print:text-black">{formatCurrency(remaining)}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Notes */}
              {invoice.notes && (
                <div className="border-t border-border pt-4">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-line text-sm text-foreground print:text-black">{invoice.notes}</p>
                </div>
              )}

              {/* Pied de page */}
              <div className="border-t border-border pt-4 text-center">
                <p className="text-xs text-muted-foreground">
                  Merci pour votre confiance — {invoice.company_name || 'B-Stock'}
                </p>
              </div>
            </div>
          </div>

          {/* Résumé — masqué à l'impression */}
          <div className="no-print space-y-4">
            <Panel title="Règlement" description={remaining > 0 ? 'Montant restant à encaisser' : 'Facture entièrement réglée'}>
              <dl className="space-y-3 px-5 py-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="tabular font-medium text-foreground">{formatCurrency(Number(invoice.total_amount))}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">Déjà payé</dt>
                  <dd className="tabular font-medium text-success">{formatCurrency(Number(invoice.amount_paid))}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                  <dt className="font-medium text-foreground">Reste à payer</dt>
                  <dd className={`tabular text-lg font-semibold ${remaining > 0 ? 'text-destructive' : 'text-foreground'}`}>
                    {remaining > 0 ? formatCurrency(remaining) : 'Soldé'}
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel title={invoice.type === 'client' ? 'Client' : 'Fournisseur'}>
              <div className="space-y-1 px-5 py-4 text-sm">
                <p className="font-medium text-foreground">{partyName || '—'}</p>
                {partyPhone && <p className="text-xs text-muted-foreground">Tél. {partyPhone}</p>}
                {partyAddress && <p className="text-xs text-muted-foreground">{partyAddress}</p>}
                {partyEmail && <p className="text-xs text-muted-foreground">{partyEmail}</p>}
              </div>
            </Panel>
          </div>
        </div>
      </PageShell>

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
              {acting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {confirmAction === 'delete' ? 'Oui, supprimer' : 'Oui, annuler la facture'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
      <Link href="/dashboard/invoices">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Factures
      </Link>
    </Button>
  )
}
