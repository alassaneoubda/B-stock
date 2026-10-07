'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
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
  Wallet, Plus, Minus, Lock, Unlock, ArrowDownCircle, ArrowUpCircle,
  Clock, FileText, Loader2, TrendingUp, TrendingDown, AlertTriangle,
  Receipt, Download,
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

  const validationLabel = (m: CashMovement) =>
    m.validation_status === 'rejected'
      ? { label: 'Rejeté', cls: 'border-destructive/30 text-destructive bg-destructive/10' }
      : m.requires_validation && !m.validation_status
        ? { label: 'En attente', cls: 'border-warning/30 text-warning-foreground bg-warning-soft' }
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

  if (isLoading) {
    return <PageSkeleton />
  }

  if (loadError && !currentSession && sessions.length === 0) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30">
        <DashboardHeader title="Gestion de Caisse" />
        <main className="flex-1 p-4 lg:p-6">
          <ErrorState title="Impossible de charger la caisse" onRetry={() => { setIsLoading(true); fetchData() }} />
        </main>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <DashboardHeader title="Gestion de Caisse" />

      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">
        {/* Status bar */}
        {!currentSession ? (
          <Card className="border-warning/30 bg-warning-soft">
            <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-warning-soft flex items-center justify-center">
                  <Lock className="h-5 w-5 text-warning-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Caisse fermée</p>
                  <p className="text-sm text-muted-foreground">Ouvrez la caisse pour commencer la journée</p>
                </div>
              </div>
              <Dialog open={openDialog === 'open'} onOpenChange={(o) => setOpenDialog(o ? 'open' : '')}>
                <DialogTrigger asChild>
                  <Button className="bg-success hover:bg-success">
                    <Unlock className="h-4 w-4 mr-2" /> Ouvrir la caisse
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Ouverture de caisse</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Fonds de caisse initial (FCFA)</Label>
                      <Input type="number" min={0} value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} placeholder="0" className="mt-1" />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                    <Button onClick={handleOpenSession} disabled={submitting} className="bg-success hover:bg-success">
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlock className="h-4 w-4 mr-2" />} Ouvrir
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Open session header */}
            <Card className="border-success/30 bg-success-soft">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-success-soft flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-success" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Caisse ouverte</p>
                      <p className="text-xs text-muted-foreground">
                        Depuis {formatDateTime(currentSession.opened_at)}
                        {currentSession.opened_by_name && ` par ${currentSession.opened_by_name}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Dialog open={openDialog === 'movement'} onOpenChange={(o) => setOpenDialog(o ? 'movement' : '')}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Mouvement</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Nouveau mouvement</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div>
                            <Label>Type</Label>
                            <Select value={movementType} onValueChange={(v) => { setMovementType(v); setMovementCategory(v === 'cash_in' ? 'sale' : 'expense') }}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cash_in">Entrée d'argent</SelectItem>
                                <SelectItem value="cash_out">Sortie d'argent</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Catégorie</Label>
                            <Select value={movementCategory} onValueChange={setMovementCategory}>
                              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
                          <div>
                            <Label>Montant (FCFA)</Label>
                            <Input type="number" min={1} value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} placeholder="0" className="mt-1" />
                          </div>
                          <div>
                            <Label>Description</Label>
                            <Textarea value={movementDesc} onChange={(e) => setMovementDesc(e.target.value)} placeholder="Détails..." className="mt-1" />
                          </div>
                        </div>
                        <DialogFooter>
                          <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                          <Button onClick={handleAddMovement} disabled={submitting || !movementAmount || Number(movementAmount) <= 0}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Enregistrer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={openDialog === 'close'} onOpenChange={(o) => { setOpenDialog(o ? 'close' : ''); if (o) fetchData() }}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="destructive"><Lock className="h-4 w-4 mr-1" /> Clôturer</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Clôture de caisse</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Fonds initial</span><span className="font-medium">{formatCurrency(Number(currentSession.opening_amount))}</span></div>
                            <div className="flex justify-between text-success"><span>Total entrées</span><span className="font-medium">+{formatCurrency(totalIn)}</span></div>
                            <div className="flex justify-between text-destructive"><span>Total sorties</span><span className="font-medium">-{formatCurrency(totalOut)}</span></div>
                            <div className="flex justify-between font-semibold border-t pt-2"><span>Montant attendu</span><span>{formatCurrency(expectedAmount)}</span></div>
                            {pendingCount > 0 && (
                              <p className="text-xs text-warning-foreground flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                {pendingCount} mouvement(s) en attente de validation ne sont pas comptés.
                              </p>
                            )}
                          </div>
                          <div>
                            <Label>Montant compté en caisse (FCFA)</Label>
                            <Input type="number" min={0} value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} placeholder="Comptez l'argent..." className="mt-1" />
                          </div>
                          <div>
                            <Label>Notes</Label>
                            <Textarea value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} placeholder="Observations..." className="mt-1" />
                          </div>
                        </div>
                        <DialogFooter>
                          <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                          <Button onClick={() => setConfirmClose(true)} disabled={submitting || closingAmount === ''} variant="destructive">
                            <Lock className="h-4 w-4 mr-2" /> Clôturer
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
                        <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                          <div className="flex justify-between"><span className="text-muted-foreground">Montant attendu</span><span className="font-medium">{formatCurrency(expectedAmount)}</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Montant compté</span><span className="font-medium">{formatCurrency(countedAmount)}</span></div>
                          <div className={`flex justify-between font-semibold border-t pt-2 ${closeVariance < 0 ? 'text-destructive' : closeVariance > 0 ? 'text-success' : 'text-foreground/80'}`}>
                            <span>Écart</span>
                            <span>
                              {closeVariance === 0 ? 'Aucun écart' : `${formatSignedMoney(closeVariance)} (${closeVariance < 0 ? 'manquant' : 'excédent'})`}
                            </span>
                          </div>
                          {pendingCount > 0 && (
                            <p className="text-xs text-warning-foreground">
                              {pendingCount} mouvement(s) en attente de validation ne seront pas comptés.
                            </p>
                          )}
                        </div>
                        <AlertDialogFooter>
                          <AlertDialogCancel disabled={submitting}>Revenir</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); handleCloseSession() }}
                            disabled={submitting}
                            className="bg-destructive text-white hover:bg-destructive/90"
                          >
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                            Confirmer la clôture
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-card rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground mb-1">Fonds initial</div>
                    <div className="text-lg font-bold text-foreground">{formatCurrency(Number(currentSession.opening_amount))}</div>
                  </div>
                  <div className="bg-card rounded-lg border p-3">
                    <div className="flex items-center gap-1 text-xs text-success mb-1"><ArrowDownCircle className="h-3 w-3" /> Entrées</div>
                    <div className="text-lg font-bold text-success">{formatCurrency(totalIn)}</div>
                  </div>
                  <div className="bg-card rounded-lg border p-3">
                    <div className="flex items-center gap-1 text-xs text-destructive mb-1"><ArrowUpCircle className="h-3 w-3" /> Sorties</div>
                    <div className="text-lg font-bold text-destructive">{formatCurrency(totalOut)}</div>
                  </div>
                  <div className="bg-card rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground mb-1">Solde attendu</div>
                    <div className="text-lg font-bold text-foreground">{formatCurrency(expectedAmount)}</div>
                    {pendingCount > 0 && (
                      <div className="text-[11px] text-warning-foreground mt-0.5">{pendingCount} en attente de validation</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Movements table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Mouvements de la journée</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {movements.length === 0 ? (
                  <EmptyState
                    icon={Receipt}
                    className="m-4"
                    title="Aucun mouvement enregistré"
                    description="Les ventes en espèces et les mouvements manuels apparaîtront ici."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[130px]">Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Catégorie</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Par</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(m.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={m.movement_type === 'cash_in' ? 'border-success/30 text-success bg-success-soft' : 'border-destructive/30 text-destructive bg-destructive/10'}>
                              {m.movement_type === 'cash_in' ? 'Entrée' : 'Sortie'}
                            </Badge>
                            {validationLabel(m) && (
                              <Badge variant="outline" className={`ml-1 ${validationLabel(m)!.cls}`}>
                                {validationLabel(m)!.label}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{categoryLabels[m.category] || m.category}</TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{m.description || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{m.created_by_name || '-'}</TableCell>
                          <TableCell className={`text-right font-medium ${m.movement_type === 'cash_in' ? 'text-success' : 'text-destructive'}`}>
                            {m.movement_type === 'cash_in' ? '+' : '-'}{formatCurrency(Number(m.amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Recent sessions history */}
        {sessions.filter(s => s.status === 'closed').length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Historique des sessions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Ouverture</TableHead>
                    <TableHead>Clôture</TableHead>
                    <TableHead>Ventes</TableHead>
                    <TableHead>Dépenses</TableHead>
                    <TableHead className="text-right">Écart</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.filter(s => s.status === 'closed').map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">{formatDateShort(s.opened_at)}</TableCell>
                      <TableCell className="text-sm">{formatCurrency(Number(s.opening_amount))}</TableCell>
                      <TableCell className="text-sm">{s.closing_amount != null ? formatCurrency(Number(s.closing_amount)) : '-'}</TableCell>
                      <TableCell className="text-sm text-success">{formatCurrency(Number(s.total_sales))}</TableCell>
                      <TableCell className="text-sm text-destructive">{formatCurrency(Number(s.total_expenses))}</TableCell>
                      <TableCell className={`text-right text-sm font-medium ${Number(s.variance) < 0 ? 'text-destructive' : Number(s.variance) > 0 ? 'text-success' : 'text-muted-foreground'}`}>
                        {s.variance != null ? formatSignedMoney(s.variance) : '-'}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-9 text-xs" aria-label={`Télécharger le rapport PDF du ${formatDateShort(s.opened_at)}`} onClick={() => window.open(`/api/export/pdf?type=cash_report&id=${s.id}`, '_blank')}>
                          <Download className="h-3 w-3 mr-1" /> PDF
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
