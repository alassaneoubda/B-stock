'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Shield, CheckCircle2, XCircle, Eye, Loader2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatDateTime, formatMoney } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface CashMovement {
  id: string; movement_type: string; category: string; amount: number
  description: string | null; reference_type: string | null; reference_id: string | null
  created_by_name: string; created_at: string; requires_validation: boolean
  validated_by_name: string | null; validated_at: string | null; validation_notes: string | null
}

const fmt = formatMoney

const categoryLabels: Record<string, string> = {
  sale: 'Vente', credit_payment: 'Encaissement crédit', expense: 'Dépense',
  refund: 'Remboursement', deposit: 'Dépôt', withdrawal: 'Retrait', other: 'Autre',
}

export default function CashValidationPage() {
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [validating, setValidating] = useState<string | null>(null)
  const [selectedMovement, setSelectedMovement] = useState<CashMovement | null>(null)
  const [validationNotes, setValidationNotes] = useState('')
  const [showValidationDialog, setShowValidationDialog] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const fetchMovements = useCallback(async () => {
    setIsLoading(true)
    setLoadError(false)
    try {
      const json = await apiFetch('/api/cash/movements?requires_validation=true')
      setMovements(json.data || [])
    } catch (e) {
      setLoadError(true)
      toastError(e, 'Impossible de charger les mouvements')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchMovements() }, [fetchMovements])

  async function handleValidate(movement: CashMovement, approved: boolean) {
    if (validating) return
    setValidating(movement.id)
    try {
      await apiFetch(`/api/cash/movements/${movement.id}/validate`, {
        method: 'POST',
        body: {
          approved,
          notes: validationNotes || undefined,
        },
      })
      // Retiré de la liste uniquement si le serveur a accepté
      setMovements(prev => prev.filter(m => m.id !== movement.id))
      setShowValidationDialog(false)
      setConfirmReject(false)
      setValidationNotes('')
      toast.success(approved ? 'Mouvement approuvé' : 'Mouvement rejeté')
    } catch (e) {
      setConfirmReject(false)
      toastError(e, approved ? 'Approbation impossible' : 'Rejet impossible')
    } finally {
      setValidating(null)
    }
  }

  const pendingIn = movements.filter((m) => m.movement_type === 'cash_in').reduce((s, m) => s + Number(m.amount), 0)
  const pendingOut = movements.filter((m) => m.movement_type !== 'cash_in').reduce((s, m) => s + Number(m.amount), 0)

  const openMovement = (movement: CashMovement) => {
    setSelectedMovement(movement)
    setValidationNotes('')
    setShowValidationDialog(true)
  }

  const reference = (m: CashMovement) =>
    m.reference_type && m.reference_id ? `${m.reference_type} #${m.reference_id.slice(0, 8)}` : null

  if (isLoading) {
    return <PageSkeleton />
  }

  const header = (
    <DashboardHeader
      title="Validation de caisse"
      description="Approuvez ou rejetez les mouvements manuels avant qu'ils soient comptés"
    />
  )

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col">
        {header}
        <PageShell>
          <ErrorState title="Impossible de charger les mouvements" onRetry={fetchMovements} />
        </PageShell>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <PageShell>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label="En attente"
            value={movements.length}
            icon={Shield}
            tone={movements.length > 0 ? 'warning' : 'default'}
            hint={movements.length > 0 ? 'Mouvements à examiner' : 'Tout est à jour'}
          />
          <StatCard label="Entrées à valider" value={fmt(pendingIn)} icon={ArrowDownCircle} tone="success" />
          <StatCard label="Sorties à valider" value={fmt(pendingOut)} icon={ArrowUpCircle} tone="danger" />
        </div>

        <Panel
          title="Mouvements en attente de validation"
          description={`${movements.length} mouvement(s) non comptés dans la caisse`}
        >
          {movements.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              className="m-4"
              title="Aucun mouvement en attente de validation"
              description="Les mouvements manuels de caisse à valider apparaîtront ici."
              action={{ label: 'Retour à la caisse', href: '/dashboard/cash' }}
            />
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5">Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Par</TableHead>
                      <TableHead>Référence</TableHead>
                      <TableHead className="text-right">Montant</TableHead>
                      <TableHead className="pr-5"><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((movement) => (
                      <TableRow key={movement.id} className="cursor-pointer" onClick={() => openMovement(movement)}>
                        <TableCell className="tabular pl-5 text-xs text-muted-foreground">{formatDateTime(movement.created_at)}</TableCell>
                        <TableCell>
                          <StatusBadge
                            label={movement.movement_type === 'cash_in' ? 'Entrée' : 'Sortie'}
                            tone={movement.movement_type === 'cash_in' ? 'success' : 'danger'}
                          />
                        </TableCell>
                        <TableCell className="text-sm">{categoryLabels[movement.category] || movement.category}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground" title={movement.description || ''}>
                          {movement.description || '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{movement.created_by_name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{reference(movement) ?? '—'}</TableCell>
                        <TableCell className={`tabular text-right text-sm font-semibold ${movement.movement_type === 'cash_in' ? 'text-success' : 'text-destructive'}`}>
                          {movement.movement_type === 'cash_in' ? '+' : '-'}{fmt(Number(movement.amount))}
                        </TableCell>
                        <TableCell className="pr-5 text-right">
                          <Button
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); openMovement(movement) }}
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Examiner
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul className="divide-y divide-border md:hidden">
                {movements.map((movement) => (
                  <li key={movement.id}>
                    <button
                      type="button"
                      onClick={() => openMovement(movement)}
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <StatusBadge
                            label={movement.movement_type === 'cash_in' ? 'Entrée' : 'Sortie'}
                            tone={movement.movement_type === 'cash_in' ? 'success' : 'danger'}
                          />
                          <span className="truncate text-sm font-medium text-foreground">
                            {categoryLabels[movement.category] || movement.category}
                          </span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {formatDateTime(movement.created_at)} · {movement.created_by_name}
                        </p>
                        {movement.description && <p className="truncate text-xs text-muted-foreground">{movement.description}</p>}
                      </div>
                      <span className={`tabular shrink-0 text-sm font-semibold ${movement.movement_type === 'cash_in' ? 'text-success' : 'text-destructive'}`}>
                        {movement.movement_type === 'cash_in' ? '+' : '-'}{fmt(Number(movement.amount))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>

        {/* Dialogue de validation */}
        <Dialog open={showValidationDialog} onOpenChange={(o) => { if (!validating) setShowValidationDialog(o) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Validation du mouvement</DialogTitle>
              <DialogDescription>Un mouvement approuvé est compté dans le solde attendu de la caisse.</DialogDescription>
            </DialogHeader>
            {selectedMovement && (
              <div className="space-y-4 py-2">
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-4">
                  <StatusBadge
                    label={selectedMovement.movement_type === 'cash_in' ? 'Entrée' : 'Sortie'}
                    tone={selectedMovement.movement_type === 'cash_in' ? 'success' : 'danger'}
                  />
                  <span className={`tabular text-xl font-semibold tracking-tight ${selectedMovement.movement_type === 'cash_in' ? 'text-success' : 'text-destructive'}`}>
                    {selectedMovement.movement_type === 'cash_in' ? '+' : '-'}{fmt(Number(selectedMovement.amount))}
                  </span>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Catégorie</dt>
                    <dd className="text-right">{categoryLabels[selectedMovement.category] || selectedMovement.category}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Saisi par</dt>
                    <dd className="text-right">{selectedMovement.created_by_name}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Date</dt>
                    <dd className="tabular text-right">{formatDateTime(selectedMovement.created_at)}</dd>
                  </div>
                  {reference(selectedMovement) && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Référence</dt>
                      <dd className="text-right">{reference(selectedMovement)}</dd>
                    </div>
                  )}
                  {selectedMovement.description && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Description</dt>
                      <dd className="text-right">{selectedMovement.description}</dd>
                    </div>
                  )}
                </dl>
                <div className="space-y-2">
                  <Label htmlFor="validation-notes">Notes de validation</Label>
                  <Textarea
                    id="validation-notes"
                    value={validationNotes}
                    onChange={(e) => setValidationNotes(e.target.value)}
                    placeholder="Commentaires sur cette validation…"
                  />
                  <p className="text-xs text-muted-foreground">Facultatif, conservé dans l&apos;historique du mouvement.</p>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setShowValidationDialog(false)}>Annuler</Button>
              <Button
                variant="destructive"
                onClick={() => setConfirmReject(true)}
                disabled={validating !== null}
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Rejeter
              </Button>
              <Button
                onClick={() => selectedMovement && handleValidate(selectedMovement, true)}
                disabled={validating !== null}
              >
                {validating === selectedMovement?.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                Approuver
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={confirmReject} onOpenChange={(o) => { if (!validating) setConfirmReject(o) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rejeter ce mouvement ?</AlertDialogTitle>
              <AlertDialogDescription>
                {selectedMovement
                  ? `${selectedMovement.movement_type === 'cash_in' ? 'Entrée' : 'Sortie'} de ${fmt(Number(selectedMovement.amount))} saisie par ${selectedMovement.created_by_name || 'un utilisateur'}. `
                  : ''}
                Un mouvement rejeté n&apos;est pas compté dans la caisse. Cette décision est définitive.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={validating !== null}>Revenir</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); if (selectedMovement) handleValidate(selectedMovement, false) }}
                disabled={validating !== null}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {validating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                Oui, rejeter
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageShell>
    </div>
  )
}
