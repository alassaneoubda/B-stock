'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  CreditCard, AlertTriangle, Clock, CheckCircle2, Loader2, Banknote,
  Phone, MessageSquare, Search, DollarSign,
} from 'lucide-react'

interface Credit {
  id: string; credit_number: string; client_name: string; client_phone: string
  total_amount: number; paid_amount: number; due_date: string | null
  status: string; is_overdue: boolean; days_overdue: number
  order_number: string | null; created_at: string
}
interface Stats {
  total_credits: number; total_outstanding: number; overdue_count: number; overdue_amount: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' FCFA'
}

const statusLabels: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  partial: { label: 'Partiel', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  paid: { label: 'Payé', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  overdue: { label: 'En retard', cls: 'bg-red-50 text-red-700 border-red-200' },
  written_off: { label: 'Abandonné', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
}

export default function CreditsPage() {
  const [credits, setCredits] = useState<Credit[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [payDialog, setPayDialog] = useState<Credit | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payNotes, setPayNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/credits')
      const json = await res.json()
      setCredits(json.data?.credits || [])
      setStats(json.data?.stats || null)
    } catch (e) { console.error(e) }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handlePay() {
    if (!payDialog || !payAmount) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/credits/${payDialog.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(payAmount), payment_method: payMethod, notes: payNotes || undefined }),
      })
      if (res.ok) {
        setPayDialog(null); setPayAmount(''); setPayNotes('')
        fetchData()
      }
    } finally { setSubmitting(false) }
  }

  async function handleRemind(credit: Credit, type: string) {
    await fetch(`/api/credits/${credit.id}/remind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reminder_type: type, message: `Relance pour créance ${credit.credit_number}` }),
    })
    fetchData()
  }

  const filtered = credits.filter(c =>
    c.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.credit_number?.toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Crédits" />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Gestion des Crédits" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">Créances totales</div>
            <div className="text-xl font-bold text-zinc-950">{stats?.total_credits || 0}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">Montant en cours</div>
            <div className="text-xl font-bold text-amber-600">{fmt(Number(stats?.total_outstanding || 0))}</div>
          </Card>
          <Card className="p-4 border-red-200 bg-red-50/30">
            <div className="flex items-center gap-1 text-xs text-red-600 mb-1"><AlertTriangle className="h-3 w-3" /> En retard</div>
            <div className="text-xl font-bold text-red-600">{stats?.overdue_count || 0}</div>
            <div className="text-xs text-red-500">{fmt(Number(stats?.overdue_amount || 0))}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-zinc-500 mb-1">Taux recouvrement</div>
            <div className="text-xl font-bold text-emerald-600">
              {credits.length > 0 ? Math.round((credits.filter(c => c.status === 'paid').length / credits.length) * 100) : 0}%
            </div>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input placeholder="Rechercher par client ou n° créance..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">Aucune créance</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead className="text-right">Payé</TableHead>
                    <TableHead className="text-right">Reste</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => {
                    const remaining = Number(c.total_amount) - Number(c.paid_amount)
                    const st = c.is_overdue ? statusLabels.overdue : statusLabels[c.status] || statusLabels.pending
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm font-medium">{c.credit_number}</TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">{c.client_name}</div>
                          {c.client_phone && <div className="text-xs text-zinc-400">{c.client_phone}</div>}
                        </TableCell>
                        <TableCell className="text-right text-sm">{fmt(Number(c.total_amount))}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-600">{fmt(Number(c.paid_amount))}</TableCell>
                        <TableCell className="text-right text-sm font-semibold text-red-600">{remaining > 0 ? fmt(remaining) : '-'}</TableCell>
                        <TableCell className="text-sm">
                          {c.due_date ? (
                            <span className={c.is_overdue ? 'text-red-600 font-medium' : ''}>
                              {new Date(c.due_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                              {c.is_overdue && ` (${c.days_overdue}j)`}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {c.status !== 'paid' && c.status !== 'written_off' && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPayDialog(c); setPayAmount(String(remaining)) }}>
                                  <Banknote className="h-3 w-3 mr-1" /> Encaisser
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleRemind(c, 'call')}>
                                  <Phone className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pay dialog */}
        <Dialog open={!!payDialog} onOpenChange={(o) => { if (!o) setPayDialog(null) }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Encaisser — {payDialog?.credit_number}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-zinc-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>Client</span><span className="font-medium">{payDialog?.client_name}</span></div>
                <div className="flex justify-between"><span>Total</span><span>{fmt(Number(payDialog?.total_amount || 0))}</span></div>
                <div className="flex justify-between"><span>Déjà payé</span><span className="text-emerald-600">{fmt(Number(payDialog?.paid_amount || 0))}</span></div>
                <div className="flex justify-between font-semibold"><span>Reste</span><span className="text-red-600">{fmt(Number(payDialog?.total_amount || 0) - Number(payDialog?.paid_amount || 0))}</span></div>
              </div>
              <div>
                <Label>Montant à encaisser (FCFA)</Label>
                <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Mode de paiement</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Espèces</SelectItem>
                    <SelectItem value="mobile_money">Mobile Money</SelectItem>
                    <SelectItem value="bank_transfer">Virement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Référence, détails..." className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
              <Button onClick={handlePay} disabled={submitting || !payAmount} className="bg-emerald-600 hover:bg-emerald-700">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Banknote className="h-4 w-4 mr-2" />} Encaisser
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
