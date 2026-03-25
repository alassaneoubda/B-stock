'use client'

import { useState, useEffect } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Shield, CheckCircle2, XCircle, AlertTriangle, Eye, Loader2 } from 'lucide-react'

interface CashMovement {
  id: string; movement_type: string; category: string; amount: number
  description: string | null; reference_type: string | null; reference_id: string | null
  created_by_name: string; created_at: string; requires_validation: boolean
  validated_by_name: string | null; validated_at: string | null; validation_notes: string | null
}

function fmt(n: number) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' FCFA' }

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

  useEffect(() => {
    fetch('/api/cash/movements?requires_validation=true')
      .then(res => res.json())
      .then(json => setMovements(json.data || []))
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [])

  async function handleValidate(movement: CashMovement, approved: boolean) {
    setValidating(movement.id)
    try {
      await fetch(`/api/cash/movements/${movement.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved,
          notes: validationNotes || undefined,
        }),
      })
      setMovements(movements.filter(m => m.id !== movement.id))
      setShowValidationDialog(false)
      setValidationNotes('')
    } finally {
      setValidating(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Validation Caisse" />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Validation des Mouvements de Caisse" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Mouvements en attente de validation ({movements.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {movements.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                Aucun mouvement en attente de validation
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Par</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                    <TableHead>Référence</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="text-sm text-zinc-500">
                        {new Date(movement.created_at).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          movement.movement_type === 'cash_in' ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-700'
                        }>
                          {movement.movement_type === 'cash_in' ? 'Entrée' : 'Sortie'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{categoryLabels[movement.category] || movement.category}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate" title={movement.description || ''}>
                        {movement.description || '-'}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500">{movement.created_by_name}</TableCell>
                      <TableCell className={`text-right text-sm font-medium ${
                        movement.movement_type === 'cash_in' ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {movement.movement_type === 'cash_in' ? '+' : '-'}{fmt(Number(movement.amount))}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500">
                        {movement.reference_type && movement.reference_id
                          ? `${movement.reference_type} #${movement.reference_id.slice(0, 8)}`
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                          setSelectedMovement(movement)
                          setShowValidationDialog(true)
                        }}>
                          <Eye className="h-3 w-3 mr-1" /> Valider
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Validation Dialog */}
        <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Validation du mouvement de caisse</DialogTitle>
            </DialogHeader>
            {selectedMovement && (
              <div className="space-y-4 py-4">
                <div className="bg-zinc-50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Type</span>
                    <span className={selectedMovement.movement_type === 'cash_in' ? 'text-emerald-600' : 'text-red-600'}>
                      {selectedMovement.movement_type === 'cash_in' ? 'Entrée' : 'Sortie'} de {fmt(Number(selectedMovement.amount))}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Catégorie</span>
                    <span>{categoryLabels[selectedMovement.category] || selectedMovement.category}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Par</span>
                    <span>{selectedMovement.created_by_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Date</span>
                    <span>{new Date(selectedMovement.created_at).toLocaleString('fr-FR')}</span>
                  </div>
                  {selectedMovement.description && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Description</span>
                      <span>{selectedMovement.description}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Notes de validation (optionnel)</label>
                  <Textarea
                    value={validationNotes}
                    onChange={(e) => setValidationNotes(e.target.value)}
                    placeholder="Commentaires sur cette validation..."
                    className="mt-1"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowValidationDialog(false)}>Annuler</Button>
              <Button
                variant="destructive"
                onClick={() => selectedMovement && handleValidate(selectedMovement, false)}
                disabled={validating === selectedMovement?.id}
              >
                {validating === selectedMovement?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
                Rejeter
              </Button>
              <Button
                onClick={() => selectedMovement && handleValidate(selectedMovement, true)}
                disabled={validating === selectedMovement?.id}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {validating === selectedMovement?.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Approuver
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
