'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Banknote, Smartphone, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, errorMessage, toastWarnings } from '@/lib/api-client'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

interface CollectDebtDialogProps {
    clientId: string
    clientName: string
    productDebt: number
    packagingDebt: number
}

const formatCurrency = formatMoney

export function CollectDebtDialog({ clientId, clientName, productDebt, packagingDebt }: CollectDebtDialogProps) {
    const [open, setOpen] = useState(false)
    const [amount, setAmount] = useState(0)
    const [paymentMethod, setPaymentMethod] = useState<string>('cash')
    const [reference, setReference] = useState('')
    const [notes, setNotes] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const totalDebt = productDebt + packagingDebt

    // Preview allocation
    const previewProducts = Math.min(productDebt, amount)
    const previewPackaging = Math.min(packagingDebt, Math.max(0, amount - productDebt))

    async function handleSubmit() {
        if (loading || amount <= 0 || amount > totalDebt) return
        setLoading(true)
        setError(null)

        try {
            const data = await apiFetch(`/api/clients/${clientId}/payments`, {
                method: 'POST',
                body: {
                    amount,
                    paymentMethod,
                    reference: reference.trim() || undefined,
                    notes: notes.trim() || undefined,
                },
            })
            toast.success(data.message || `Paiement de ${formatCurrency(amount)} enregistré`)
            toastWarnings(data.warnings)
            setOpen(false)
            window.location.reload()
        } catch (e) {
            // Erreur affichée dans le formulaire (ex. 409 montant supérieur à la dette)
            setError(errorMessage(e))
            setLoading(false)
        }
    }

    const methods = [
        { value: 'cash', label: 'Espèces', icon: Banknote },
        { value: 'mobile_money', label: 'Mobile Money', icon: Smartphone },
        { value: 'orange_money', label: 'Orange Money', icon: Smartphone },
        { value: 'wave', label: 'Wave', icon: Smartphone },
    ]

    return (
        <Dialog open={open} onOpenChange={(v) => { if (loading) return; setOpen(v); if (v) { setAmount(0); setError(null) } }}>
            <DialogTrigger asChild>
                <Button variant="brand">
                    <Banknote className="h-4 w-4" aria-hidden="true" />
                    Encaisser la créance
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Encaisser la créance</DialogTitle>
                    <DialogDescription>
                        Enregistrer un paiement pour {clientName}.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    {/* Dettes en cours */}
                    <dl className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-muted/40">
                        <div className="px-3 py-2.5">
                            <dt className="text-xs text-muted-foreground">Produits</dt>
                            <dd className="tabular text-sm font-semibold text-destructive">{formatCurrency(productDebt)}</dd>
                        </div>
                        <div className="px-3 py-2.5">
                            <dt className="text-xs text-muted-foreground">Emballages</dt>
                            <dd className="tabular text-sm font-semibold text-warning-foreground">{formatCurrency(packagingDebt)}</dd>
                        </div>
                        <div className="px-3 py-2.5">
                            <dt className="text-xs text-muted-foreground">Total dû</dt>
                            <dd className="tabular text-sm font-semibold text-foreground">{formatCurrency(totalDebt)}</dd>
                        </div>
                    </dl>

                    {/* Mode de paiement */}
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium text-foreground">Mode de paiement</legend>
                        <div className="grid grid-cols-2 gap-2">
                            {methods.map(({ value, label, icon: Icon }) => {
                                const selected = paymentMethod === value
                                return (
                                    <button
                                        key={value}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => setPaymentMethod(value)}
                                        className={cn(
                                            'flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            selected
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border bg-card text-foreground hover:bg-muted'
                                        )}
                                    >
                                        <Icon className="h-4 w-4" aria-hidden="true" />
                                        {label}
                                    </button>
                                )
                            })}
                        </div>
                    </fieldset>

                    {/* Montant */}
                    <div className="space-y-2">
                        <Label htmlFor="collect-amount">Montant (FCFA)</Label>
                        <Input
                            id="collect-amount"
                            type="number"
                            min={0}
                            max={totalDebt}
                            value={amount || ''}
                            onChange={e => setAmount(Number(e.target.value))}
                            placeholder="0"
                            className="tabular h-11 text-lg font-semibold"
                        />
                        <div className="flex flex-wrap gap-2">
                            {productDebt > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setAmount(productDebt)}
                                    className="tabular rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    Solder les produits ({formatCurrency(productDebt)})
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setAmount(totalDebt)}
                                className="tabular rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                Tout solder ({formatCurrency(totalDebt)})
                            </button>
                        </div>
                        {amount > totalDebt && (
                            <p className="text-xs text-destructive">
                                Le montant dépasse la dette totale ({formatCurrency(totalDebt)}).
                            </p>
                        )}
                    </div>

                    {/* Répartition */}
                    {amount > 0 && (
                        <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
                            <p className="text-xs font-medium text-muted-foreground">Répartition du paiement</p>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Produits</span>
                                <span className="tabular font-medium text-foreground">{formatCurrency(previewProducts)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Emballages</span>
                                <span className="tabular font-medium text-foreground">{formatCurrency(previewPackaging)}</span>
                            </div>
                        </div>
                    )}

                    {/* Référence */}
                    {paymentMethod !== 'cash' && (
                        <div className="space-y-2">
                            <Label htmlFor="collect-reference">Référence de transaction</Label>
                            <Input
                                id="collect-reference"
                                value={reference}
                                onChange={e => setReference(e.target.value)}
                                placeholder="Numéro de transaction…"
                            />
                        </div>
                    )}

                    {/* Notes */}
                    <div className="space-y-2">
                        <Label htmlFor="collect-notes">Notes (facultatif)</Label>
                        <Textarea
                            id="collect-notes"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            placeholder="Remarques…"
                        />
                    </div>

                    {error && (
                        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                        Annuler
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={loading || amount <= 0 || amount > totalDebt}
                    >
                        {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                            <Banknote className="h-4 w-4" aria-hidden="true" />
                        )}
                        Enregistrer <span className="tabular">{formatCurrency(amount)}</span>
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
