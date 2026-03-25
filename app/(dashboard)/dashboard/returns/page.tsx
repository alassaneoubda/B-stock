'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RotateCcw, Loader2, CheckCircle2, XCircle, Package, Eye } from 'lucide-react'
import Link from 'next/link'

interface ReturnRecord {
  id: string; return_number: string; return_type: string; client_name: string | null
  supplier_name: string | null; order_number: string | null; depot_name: string | null
  status: string; total_amount: number; reason: string | null; items_count: number
  created_by_name: string | null; created_at: string
}

function fmt(n: number) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' FCFA' }

const statusBadge: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approuvé', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  processed: { label: 'Traité', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejeté', cls: 'bg-red-50 text-red-700 border-red-200' },
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [tab, setTab] = useState('all')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/returns')
      const json = await res.json()
      setReturns(json.data || [])
    } catch (e) { console.error(e) }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleProcess(id: string, action: string) {
    setProcessing(id)
    try {
      await fetch(`/api/returns/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      fetchData()
    } finally { setProcessing(null) }
  }

  const filtered = tab === 'all' ? returns : returns.filter(r => r.return_type === tab)

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Retours" />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Gestion des Retours" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        <div className="flex items-center justify-between">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="all">Tous ({returns.length})</TabsTrigger>
              <TabsTrigger value="client">Clients ({returns.filter(r => r.return_type === 'client').length})</TabsTrigger>
              <TabsTrigger value="supplier">Fournisseurs ({returns.filter(r => r.return_type === 'supplier').length})</TabsTrigger>
            </TabsList>
          </Tabs>
          <Link href="/dashboard/returns/new">
            <Button size="sm"><RotateCcw className="h-4 w-4 mr-2" /> Nouveau retour</Button>
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">Aucun retour enregistré</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Client / Fournisseur</TableHead>
                    <TableHead>Commande</TableHead>
                    <TableHead className="text-center">Articles</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const st = statusBadge[r.status] || statusBadge.pending
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium text-sm">{r.return_number}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={r.return_type === 'client' ? 'border-blue-200 text-blue-700' : 'border-purple-200 text-purple-700'}>
                            {r.return_type === 'client' ? 'Client' : 'Fournisseur'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{r.client_name || r.supplier_name || '-'}</TableCell>
                        <TableCell className="text-sm text-zinc-500">{r.order_number || '-'}</TableCell>
                        <TableCell className="text-center text-sm">{r.items_count}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{fmt(Number(r.total_amount))}</TableCell>
                        <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                        <TableCell className="text-sm text-zinc-500">{new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</TableCell>
                        <TableCell>
                          {r.status === 'pending' && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600" onClick={() => handleProcess(r.id, 'approve')} disabled={processing === r.id}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Traiter
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => handleProcess(r.id, 'reject')} disabled={processing === r.id}>
                                <XCircle className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
