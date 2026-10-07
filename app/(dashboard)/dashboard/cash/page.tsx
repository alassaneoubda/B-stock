'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { formatDateShort, formatDateTime, formatMoney, formatSignedMoney } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'
import {
  Wallet, Plus, Lock, Unlock, ArrowDownCircle, ArrowUpCircle,
  Loader2, AlertTriangle, Receipt, Download,
} from 'lucide-react'

interface CashSession {
  id: string
  opening_amount: number
  closing_amount: number | null
  expected_amount: number | null
  variance: number | null
  total_sales: number
  total_expenses: number
  total_cash_in: number
  total_cash_out: number
  pending_validation_count?: number
  status: string
  notes: string | null
  opened_at: string
  closed_at: string | null
  opened_by_name: string
  closed_by_name: string | null
  depot_name: string | null
}

interface CashMovement {
  id: string
  movement_type: string
  category: string
  amount: number
  description: string | null
  created_by_name: string
  created_at: string
  requires_validation?: boolean
  validation_status?: string | null
}

const formatCurrency = formatMoney

export default function CashPage() {
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null)
  const [sessions, setSessions] = useState<CashSession[]>([])
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [openingAmount, setOpeningAmount] = useState('')
  const [closingAmount, setClosingAmount] = useState('')
  const [closingNotes, setClosingNotes] = useState('')
  const [movementType, setMovementType] = useState('cash_in')
  const [movementCategory, setMovementCategory] = useState('sale')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementDesc, setMovementDesc] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [openDialog, setOpenDialog] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      const [sessJson, movJson] = await Promise.all([
        apiFetch('/api/cash'),
        apiFetch('/api/cash/movements'),
      ])
      setCurrentSession(sessJson.data?.currentSession || null)
      setSessions(sessJson.data?.sessions || [])
      setMovements(movJson.data || [])
    } catch (e) {
      setLoadError(true)
      toastError(e, 'Impossible de charger la caisse')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleOpenSession() {
    if (submitting) return
    setSubmitting(true)
    try {
      await apiFetch('/api/cash', {
        method: 'POST',
        body: { opening_amount: Number(openingAmount) || 0 },
      })
      toast.success('Caisse ouverte')
      setOpeningAmount('')
      setOpenDialog('')
      fetchData()
    } catch (e) {
      toastError(e, 'Ouverture impossible')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCloseSession() {
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await apiFetch('/api/cash/close', {
        method: 'POST',
        body: { closing_amount: Number(closingAmount) || 0, notes: closingNotes || undefined },
      })
      const variance = Number(res.data?.variance ?? 0)
      toast.success('Caisse clôturée', {
        description: variance === 0 ? 'Aucun écart.' : `Écart : ${formatSignedMoney(variance)}`,
      })
      toastWarnings(res.warnings)
      setConfirmClose(false)
      setClosingAmount('')
      setClosingNotes('')
      setOpenDialog('')
      fetchData()
    } catch (e) {
      setConfirmClose(false)
      toastError(e, 'Clôture impossible')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddMovement() {
    if (submitting) return
    setSubmitting(true)
    try {
      await apiFetch('/api/cash/movements', {
        method: 'POST',
        body: {
          movement_type: movementType,
          category: movementCategory,
          amount: Number(movementAmount),
          description: movementDesc || undefined,
        },
      })
      toast.success('Mouvement enregistré', { description: 'Il sera compté après validation.' })
      setMovementAmount('')
      setMovementDesc('')
      setOpenDialog('')
      fetchData()
    } catch (e) {
      toastError(e, 'Mouvement non enregistré')
    } finally {
      setSubmitting(false)
    }
  }

  const categoryLabels: Record<string, string> = {
    sale: 'Vente', credit_payment: 'Encaissement crédit', expense: 'Dépense',
    refund: 'Remboursement', deposit: 'Dépôt', withdrawal: 'Retrait', other: 'Autre',
  }

  const validationLabel = (m: CashMovement): { label: string; tone: 'danger' | 'warning' } | null =>
    m.validation_status === 'rejected'
      ? { label: 'Rejeté', tone: 'danger' }
      : m.requires_validation && !m.validation_status
        ? { label: 'En attente', tone: 'warning' }
        : null

  // Totaux serveur : seuls les mouvements validés (ou sans validation) sont comptés
  const totalIn = Number(currentSession?.total_cash_in || 0)
  const totalOut = Number(currentSession?.total_cash_out || 0)
  const expectedAmount = currentSession
    ? Number(currentSession.expected_amount ?? Number(currentSession.opening_amount) + totalIn - totalOut)
    : 0
  const pendingCount = Number(currentSession?.pending_validation_count || 0)
  const countedAmount = Number(closingAmount) || 0
  const closeVariance = countedAmount - expectedAmount

  const closedSessions = sessions.filter((s) => s.status === 'closed')

  const varianceTone = (v: number | null) =>
    v == null || Number(v) === 0 ? 'text-muted-foreground' : Number(v) < 0 ? 'text-destructive' : 'text-warning-foreground'

  if (isLoading) {
    return <PageSkeleton />
  }

  if (loadError && !currentSession && sessions.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Caisse" description="Ouverture, mouvements et clôture de la caisse" />
        <PageShell>
          <ErrorState title="Impossible de charger la caisse" onRetry={() => { setIsLoading(true); fetchData() }} />
        </PageShell>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Caisse" description="Ouverture, mouvements et clôture de la caisse" />

      <PageShell>
        {!currentSession ? (
          /* Caisse fermée : l'ouverture est l'action phare de l'écran */
          <section className="rounded-xl border border-border bg-card px-6 py-10 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] sm:py-12">
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="space-y-2">
                <StatusBadge label="Caisse fermée" tone="default" />
                <h2 className="text-xl font-semibold tracking-tight text-foreground">Aucune session en cours</h2>
                <p className="text-sm text-muted-foreground">
                  Ouvrez la caisse avec votre fonds initial pour commencer à enregistrer les encaissements de la journée.
                </p>
              </div>
              <Dialog open={openDialog === 'open'} onOpenChange={(o) => setOpenDialog(o ? 'open' : '')}>
                <DialogTrigger asChild>
                  <Button variant="brand" size="xl" className="mt-2">
                    <Unlock className="h-5 w-5" aria-hidden="true" /> Ouvrir la caisse
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Ouverture de caisse</DialogTitle>
                    <DialogDescription>Saisissez le montant présent dans la caisse au démarrage.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 py-2">
                    <Label htmlFor="opening-amount">Fonds de caisse initial (FCFA)</Label>
                    <Input
                      id="opening-amount"
                      type="number"
                      min={0}
                      value={openingAmount}
                      onChange={(e) => setOpeningAmount(e.target.value)}
                      placeholder="0"
                      className="tabular h-10"
                    />
                    <p className="text-xs text-muted-foreground">Laissez vide si la caisse démarre à zéro.</p>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                    <Button onClick={handleOpenSession} disabled={submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Unlock className="h-4 w-4" aria-hidden="true" />}
                      Ouvrir
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </section>
        ) : (
          <>
            {/* Session ouverte */}
            <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                  <Wallet className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">Session en cours</h2>
                    <StatusBadge status="open" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Depuis {formatDateTime(currentSession.opened_at)}
                    {currentSession.opened_by_name && ` par ${currentSession.opened_by_name}`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Dialog open={openDialog === 'movement'} onOpenChange={(o) => setOpenDialog(o ? 'movement' : '')}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Plus className="h-4 w-4" aria-hidden="true" /> Mouvement
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nouveau mouvement</DialogTitle>
                      <DialogDescription>Entrée ou sortie d&apos;argent manuelle. Elle sera comptée après validation.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-2 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Select value={movementType} onValueChange={(v) => { setMovementType(v); setMovementCategory(v === 'cash_in' ? 'sale' : 'expense') }}>
                          <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash_in">Entrée d&apos;argent</SelectItem>
                            <SelectItem value="cash_out">Sortie d&apos;argent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Catégorie</Label>
                        <Select value={movementCategory} onValueChange={setMovementCategory}>
                          <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {movementType === 'cash_in' ? (
                              <>
                                <SelectItem value="sale">Vente</SelectItem>
                                <SelectItem value="credit_payment">Encaissement crédit</SelectItem>
                                <SelectItem value="deposit">Dépôt</SelectItem>
                                <SelectItem value="other">Autre entrée</SelectItem>
                              </>
                            ) : (
                              <>
                                <SelectItem value="expense">Dépense</SelectItem>
                                <SelectItem value="refund">Remboursement</SelectItem>
                                <SelectItem value="withdrawal">Retrait</SelectItem>
                                <SelectItem value="other">Autre sortie</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="movement-amount">Montant (FCFA)</Label>
                        <Input id="movement-amount" type="number" min={1} value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} placeholder="0" className="tabular h-10" />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="movement-desc">Description</Label>
                        <Textarea id="movement-desc" value={movementDesc} onChange={(e) => setMovementDesc(e.target.value)} placeholder="Détails…" />
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                      <Button onClick={handleAddMovement} disabled={submitting || !movementAmount || Number(movementAmount) <= 0}>
                        {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        Enregistrer
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={openDialog === 'close'} onOpenChange={(o) => { setOpenDialog(o ? 'close' : ''); if (o) fetchData() }}>
                  <DialogTrigger asChild>
                    <Button>
                      <Lock className="h-4 w-4" aria-hidden="true" /> Clôturer la caisse
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Clôture de caisse</DialogTitle>
                      <DialogDescription>Comptez l&apos;argent présent dans la caisse et saisissez le montant.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <dl className="space-y-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
                        <div className="flex justify-between"><dt className="text-muted-foreground">Fonds initial</dt><dd className="tabular font-medium">{formatCurrency(Number(currentSession.opening_amount))}</dd></div>
                        <div className="flex justify-between"><dt className="text-muted-foreground">Total entrées</dt><dd className="tabular font-medium text-success">+{formatCurrency(totalIn)}</dd></div>
                        <div className="flex justify-between"><dt className="text-muted-foreground">Total sorties</dt><dd className="tabular font-medium text-destructive">-{formatCurrency(totalOut)}</dd></div>
                        <div className="flex justify-between border-t border-border pt-2 font-semibold"><dt>Montant attendu</dt><dd className="tabular">{formatCurrency(expectedAmount)}</dd></div>
                        {pendingCount > 0 && (
                          <p className="flex items-center gap-1 text-xs text-warning-foreground">
                            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                            {pendingCount} mouvement(s) en attente de validation ne sont pas comptés.
                          </p>
                        )}
                      </dl>
                      <div className="space-y-2">
                        <Label htmlFor="closing-amount">Montant compté en caisse (FCFA)</Label>
                        <Input id="closing-amount" type="number" min={0} value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} placeholder="Comptez l'argent…" className="tabular h-10" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="closing-notes">Notes</Label>
                        <Textarea id="closing-notes" value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} placeholder="Observations…" />
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                      <Button onClick={() => setConfirmClose(true)} disabled={submitting || closingAmount === ''}>
                        <Lock className="h-4 w-4" aria-hidden="true" /> Clôturer
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <AlertDialog open={confirmClose} onOpenChange={(o) => { if (!submitting) setConfirmClose(o) }}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clôturer la caisse ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        La session sera définitivement fermée : aucun mouvement ne pourra plus y être ajouté.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <dl className="space-y-2 rounded-lg border border-border bg-muted/50 p-3 text-sm">
                      <div className="flex justify-between"><dt className="text-muted-foreground">Montant attendu</dt><dd className="tabular font-medium">{formatCurrency(expectedAmount)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">Montant compté</dt><dd className="tabular font-medium">{formatCurrency(countedAmount)}</dd></div>
                      <div className={`flex justify-between border-t border-border pt-2 font-semibold ${closeVariance < 0 ? 'text-destructive' : closeVariance > 0 ? 'text-warning-foreground' : 'text-foreground'}`}>
                        <dt>Écart</dt>
                        <dd className="tabular">
                          {closeVariance === 0 ? 'Aucun écart' : `${formatSignedMoney(closeVariance)} (${closeVariance < 0 ? 'manquant' : 'excédent'})`}
                        </dd>
                      </div>
                      {pendingCount > 0 && (
                        <p className="text-xs text-warning-foreground">
                          {pendingCount} mouvement(s) en attente de validation ne seront pas comptés.
                        </p>
                      )}
                    </dl>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={submitting}>Revenir</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => { e.preventDefault(); handleCloseSession() }}
                        disabled={submitting}
                      >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
                        Confirmer la clôture
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </section>

            {/* Indicateurs de la session */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Fonds initial" value={formatCurrency(Number(currentSession.opening_amount))} icon={Wallet} />
              <StatCard label="Encaissements" value={formatCurrency(totalIn)} icon={ArrowDownCircle} tone="success" hint="Mouvements validés" />
              <StatCard label="Sorties" value={formatCurrency(totalOut)} icon={ArrowUpCircle} tone="danger" hint="Mouvements validés" />
              <StatCard
                label="Solde attendu"
                value={formatCurrency(expectedAmount)}
                emphasis
                hint={pendingCount > 0 ? `${pendingCount} mouvement(s) en attente de validation` : 'Fonds + entrées − sorties'}
              />
            </div>

            {/* Mouvements */}
            <Panel title="Mouvements de la journée" description={`${movements.length} mouvement(s)`}>
              {movements.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  className="m-4"
                  title="Aucun mouvement enregistré"
                  description="Les ventes en espèces et les mouvements manuels apparaîtront ici."
                  action={{ label: 'Ajouter un mouvement', onClick: () => setOpenDialog('movement') }}
                />
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[150px] pl-5">Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Catégorie</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Par</TableHead>
                          <TableHead className="pr-5 text-right">Montant</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movements.map((m) => {
                          const v = validationLabel(m)
                          return (
                            <TableRow key={m.id}>
                              <TableCell className="tabular pl-5 text-xs text-muted-foreground">{formatDateTime(m.created_at)}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1">
                                  <StatusBadge label={m.movement_type === 'cash_in' ? 'Entrée' : 'Sortie'} tone={m.movement_type === 'cash_in' ? 'success' : 'danger'} />
                                  {v && <StatusBadge label={v.label} tone={v.tone} />}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">{categoryLabels[m.category] || m.category}</TableCell>
                              <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">{m.description || '—'}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{m.created_by_name || '—'}</TableCell>
                              <TableCell className={`tabular pr-5 text-right font-medium ${m.movement_type === 'cash_in' ? 'text-success' : 'text-destructive'}`}>
                                {m.movement_type === 'cash_in' ? '+' : '-'}{formatCurrency(Number(m.amount))}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <ul className="divide-y divide-border md:hidden">
                    {movements.map((m) => {
                      const v = validationLabel(m)
                      return (
                        <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-3">
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-sm font-medium text-foreground">{categoryLabels[m.category] || m.category}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {formatDateTime(m.created_at)}{m.created_by_name ? ` · ${m.created_by_name}` : ''}
                            </p>
                            {m.description && <p className="truncate text-xs text-muted-foreground">{m.description}</p>}
                            {v && <StatusBadge label={v.label} tone={v.tone} />}
                          </div>
                          <span className={`tabular shrink-0 text-sm font-semibold ${m.movement_type === 'cash_in' ? 'text-success' : 'text-destructive'}`}>
                            {m.movement_type === 'cash_in' ? '+' : '-'}{formatCurrency(Number(m.amount))}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </Panel>
          </>
        )}

        {/* Historique des sessions clôturées */}
        {closedSessions.length > 0 && (
          <Panel title="Historique des sessions" description="Sessions clôturées et rapports PDF">
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Date</TableHead>
                    <TableHead className="text-right">Ouverture</TableHead>
                    <TableHead className="text-right">Clôture</TableHead>
                    <TableHead className="text-right">Ventes</TableHead>
                    <TableHead className="text-right">Dépenses</TableHead>
                    <TableHead className="text-right">Écart</TableHead>
                    <TableHead className="pr-5"><span className="sr-only">Rapport</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedSessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-5 text-sm">{formatDateShort(s.opened_at)}</TableCell>
                      <TableCell className="tabular text-right text-sm">{formatCurrency(Number(s.opening_amount))}</TableCell>
                      <TableCell className="tabular text-right text-sm">{s.closing_amount != null ? formatCurrency(Number(s.closing_amount)) : '—'}</TableCell>
                      <TableCell className="tabular text-right text-sm">{formatCurrency(Number(s.total_sales))}</TableCell>
                      <TableCell className="tabular text-right text-sm">{formatCurrency(Number(s.total_expenses))}</TableCell>
                      <TableCell className={`tabular text-right text-sm font-medium ${varianceTone(s.variance)}`}>
                        {s.variance != null ? (Number(s.variance) === 0 ? 'Aucun' : formatSignedMoney(s.variance)) : '—'}
                      </TableCell>
                      <TableCell className="pr-5 text-right">
                        <Button size="sm" variant="ghost" aria-label={`Télécharger le rapport PDF du ${formatDateShort(s.opened_at)}`} onClick={() => window.open(`/api/export/pdf?type=cash_report&id=${s.id}`, '_blank')}>
                          <Download className="h-3.5 w-3.5" aria-hidden="true" /> PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="divide-y divide-border md:hidden">
              {closedSessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{formatDateShort(s.opened_at)}</p>
                    <p className="tabular truncate text-xs text-muted-foreground">
                      Ventes {formatCurrency(Number(s.total_sales))} · Clôture {s.closing_amount != null ? formatCurrency(Number(s.closing_amount)) : '—'}
                    </p>
                    <p className={`tabular text-xs font-medium ${varianceTone(s.variance)}`}>
                      Écart : {s.variance != null ? (Number(s.variance) === 0 ? 'aucun' : formatSignedMoney(s.variance)) : '—'}
                    </p>
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label={`Télécharger le rapport PDF du ${formatDateShort(s.opened_at)}`} onClick={() => window.open(`/api/export/pdf?type=cash_report&id=${s.id}`, '_blank')}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </PageShell>
    </div>
  )
}
