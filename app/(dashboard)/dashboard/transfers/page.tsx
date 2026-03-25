'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeftRight, Loader2, CheckCircle2, Truck, Plus } from 'lucide-react'
import Link from 'next/link'

interface Transfer {
  id: string; transfer_number: string; source_depot_name: string; destination_depot_name: string
  status: string; items_count: number; created_by_name: string | null; received_by_name: string | null
  created_at: string; received_at: string | null
}

const statusBadge: Record<string, { label: string; cls: string }> = {
  pending: { label: 'En attente', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_transit: { label: 'En transit', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  received: { label: 'Réceptionné', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  partial: { label: 'Partiel', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  cancelled: { label: 'Annulé', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
}

export default function TransfersPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/transfers')
      const json = await res.json()
      setTransfers(json.data || [])
    } catch (e) { console.error(e) }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleReceive(id: string) {
    await fetch(`/api/transfers/${id}/receive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    })
    fetchData()
  }

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Transferts" />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Transferts inter-dépôts" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        <div className="flex items-center justify-between">
          <div className="text-sm text-zinc-500">{transfers.length} transfert(s)</div>
          <Link href="/dashboard/transfers/new">
            <Button size="sm"><Plus className="h-4 w-4 mr-2" /> Nouveau transfert</Button>
          </Link>
        </div>

        <Card>
          <CardContent className="p-0">
            {transfers.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">Aucun transfert</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N°</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead></TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead className="text-center">Articles</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Créé par</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((t) => {
                    const st = statusBadge[t.status] || statusBadge.pending
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium text-sm">{t.transfer_number}</TableCell>
                        <TableCell className="text-sm">{t.source_depot_name}</TableCell>
                        <TableCell><ArrowLeftRight className="h-4 w-4 text-zinc-400" /></TableCell>
                        <TableCell className="text-sm">{t.destination_depot_name}</TableCell>
                        <TableCell className="text-center text-sm">{t.items_count}</TableCell>
                        <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                        <TableCell className="text-sm text-zinc-500">{t.created_by_name || '-'}</TableCell>
                        <TableCell className="text-sm text-zinc-500">{new Date(t.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</TableCell>
                        <TableCell>
                          {(t.status === 'pending' || t.status === 'in_transit') && (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleReceive(t.id)}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Réceptionner
                            </Button>
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
