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
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'decimal', minimumFractionDigits: 0 }).format(amount) + ' FCFA'
}

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

  const fetchData = useCallback(async () => {
    try {
      const [sessRes, movRes] = await Promise.all([
        fetch('/api/cash'),
        fetch('/api/cash/movements'),
      ])
      const sessJson = await sessRes.json()
      const movJson = await movRes.json()
      setCurrentSession(sessJson.data?.currentSession || null)
      setSessions(sessJson.data?.sessions || [])
      setMovements(movJson.data || [])
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleOpenSession() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_amount: Number(openingAmount) || 0 }),
      })
      if (res.ok) {
        setOpeningAmount('')
        setOpenDialog('')
        fetchData()
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCloseSession() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/cash/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closing_amount: Number(closingAmount) || 0, notes: closingNotes || undefined }),
      })
      if (res.ok) {
        setClosingAmount('')
        setClosingNotes('')
        setOpenDialog('')
        fetchData()
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddMovement() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/cash/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movement_type: movementType,
          category: movementCategory,
          amount: Number(movementAmount),
          description: movementDesc || undefined,
        }),
      })
      if (res.ok) {
        setMovementAmount('')
        setMovementDesc('')
        setOpenDialog('')
        fetchData()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const categoryLabels: Record<string, string> = {
    sale: 'Vente', credit_payment: 'Encaissement crédit', expense: 'Dépense',
    refund: 'Remboursement', deposit: 'Dépôt', withdrawal: 'Retrait', other: 'Autre',
  }

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Caisse" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Gestion de Caisse" />

      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">
        {/* Status bar */}
        {!currentSession ? (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-950">Caisse fermée</p>
                  <p className="text-sm text-zinc-500">Ouvrez la caisse pour commencer la journée</p>
                </div>
              </div>
              <Dialog open={openDialog === 'open'} onOpenChange={(o) => setOpenDialog(o ? 'open' : '')}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700">
                    <Unlock className="h-4 w-4 mr-2" /> Ouvrir la caisse
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Ouverture de caisse</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>Fonds de caisse initial (FCFA)</Label>
                      <Input type="number" value={openingAmount} onChange={(e) => setOpeningAmount(e.target.value)} placeholder="0" className="mt-1" />
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                    <Button onClick={handleOpenSession} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
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
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-950">Caisse ouverte</p>
                      <p className="text-xs text-zinc-500">
                        Depuis {new Date(currentSession.opened_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
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
                            <Select value={movementType} onValueChange={setMovementType}>
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
                            <Input type="number" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} placeholder="0" className="mt-1" />
                          </div>
                          <div>
                            <Label>Description</Label>
                            <Textarea value={movementDesc} onChange={(e) => setMovementDesc(e.target.value)} placeholder="Détails..." className="mt-1" />
                          </div>
                        </div>
                        <DialogFooter>
                          <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                          <Button onClick={handleAddMovement} disabled={submitting || !movementAmount}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Enregistrer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Dialog open={openDialog === 'close'} onOpenChange={(o) => setOpenDialog(o ? 'close' : '')}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="destructive"><Lock className="h-4 w-4 mr-1" /> Clôturer</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Clôture de caisse</DialogTitle></DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="bg-zinc-50 rounded-lg p-3 space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-zinc-500">Fonds initial</span><span className="font-medium">{formatCurrency(Number(currentSession.opening_amount))}</span></div>
                            <div className="flex justify-between text-emerald-600"><span>Total entrées</span><span className="font-medium">+{formatCurrency(Number(currentSession.total_cash_in) || movements.filter(m => m.movement_type === 'cash_in').reduce((s, m) => s + Number(m.amount), 0))}</span></div>
                            <div className="flex justify-between text-red-600"><span>Total sorties</span><span className="font-medium">-{formatCurrency(Number(currentSession.total_cash_out) || movements.filter(m => m.movement_type === 'cash_out').reduce((s, m) => s + Number(m.amount), 0))}</span></div>
                          </div>
                          <div>
                            <Label>Montant compté en caisse (FCFA)</Label>
                            <Input type="number" value={closingAmount} onChange={(e) => setClosingAmount(e.target.value)} placeholder="Comptez l'argent..." className="mt-1" />
                          </div>
                          <div>
                            <Label>Notes</Label>
                            <Textarea value={closingNotes} onChange={(e) => setClosingNotes(e.target.value)} placeholder="Observations..." className="mt-1" />
                          </div>
                        </div>
                        <DialogFooter>
                          <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
                          <Button onClick={handleCloseSession} disabled={submitting || !closingAmount} variant="destructive">
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />} Clôturer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>

                {/* KPI cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-white rounded-lg border p-3">
                    <div className="text-xs text-zinc-500 mb-1">Fonds initial</div>
                    <div className="text-lg font-bold text-zinc-950">{formatCurrency(Number(currentSession.opening_amount))}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-3">
                    <div className="flex items-center gap-1 text-xs text-emerald-600 mb-1"><ArrowDownCircle className="h-3 w-3" /> Entrées</div>
                    <div className="text-lg font-bold text-emerald-600">{formatCurrency(movements.filter(m => m.movement_type === 'cash_in').reduce((s, m) => s + Number(m.amount), 0))}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-3">
                    <div className="flex items-center gap-1 text-xs text-red-600 mb-1"><ArrowUpCircle className="h-3 w-3" /> Sorties</div>
                    <div className="text-lg font-bold text-red-600">{formatCurrency(movements.filter(m => m.movement_type === 'cash_out').reduce((s, m) => s + Number(m.amount), 0))}</div>
                  </div>
                  <div className="bg-white rounded-lg border p-3">
                    <div className="text-xs text-zinc-500 mb-1">Solde estimé</div>
                    <div className="text-lg font-bold text-zinc-950">
                      {formatCurrency(
                        Number(currentSession.opening_amount) +
                        movements.filter(m => m.movement_type === 'cash_in').reduce((s, m) => s + Number(m.amount), 0) -
                        movements.filter(m => m.movement_type === 'cash_out').reduce((s, m) => s + Number(m.amount), 0)
                      )}
                    </div>
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
                  <div className="p-8 text-center text-sm text-zinc-400">Aucun mouvement enregistré</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Heure</TableHead>
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
                          <TableCell className="text-xs text-zinc-500">
                            {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={m.movement_type === 'cash_in' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-red-200 text-red-700 bg-red-50'}>
                              {m.movement_type === 'cash_in' ? 'Entrée' : 'Sortie'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{categoryLabels[m.category] || m.category}</TableCell>
                          <TableCell className="text-sm text-zinc-600 max-w-[200px] truncate">{m.description || '-'}</TableCell>
                          <TableCell className="text-sm text-zinc-500">{m.created_by_name || '-'}</TableCell>
                          <TableCell className={`text-right font-medium ${m.movement_type === 'cash_in' ? 'text-emerald-600' : 'text-red-600'}`}>
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
                      <TableCell className="text-sm">{new Date(s.opened_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</TableCell>
                      <TableCell className="text-sm">{formatCurrency(Number(s.opening_amount))}</TableCell>
                      <TableCell className="text-sm">{s.closing_amount != null ? formatCurrency(Number(s.closing_amount)) : '-'}</TableCell>
                      <TableCell className="text-sm text-emerald-600">{formatCurrency(Number(s.total_sales))}</TableCell>
                      <TableCell className="text-sm text-red-600">{formatCurrency(Number(s.total_expenses))}</TableCell>
                      <TableCell className={`text-right text-sm font-medium ${Number(s.variance) < 0 ? 'text-red-600' : Number(s.variance) > 0 ? 'text-emerald-600' : 'text-zinc-500'}`}>
                        {s.variance != null ? (Number(s.variance) > 0 ? '+' : '') + formatCurrency(Number(s.variance)) : '-'}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => window.open(`/api/export/pdf?type=cash_report&id=${s.id}`, '_blank')}>
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
