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
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Banknote, Smartphone, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, errorMessage, toastWarnings } from '@/lib/api-client'
import { formatMoney } from '@/lib/format'

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
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                    <Banknote className="h-4 w-4 mr-2" />
                    Encaisser une dette
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-xl font-black">Encaisser une dette</DialogTitle>
                    <DialogDescription>
                        Enregistrer un paiement pour {clientName}
                    </DialogDescription>
                </DialogHeader>

                    <div className="space-y-5 pt-2">
                        {/* Current debts summary */}
                        <div className="grid grid-cols-3 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Produits</p>
                                <p className="text-lg font-black text-rose-600">{formatCurrency(productDebt)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Emballages</p>
                                <p className="text-lg font-black text-amber-600">{formatCurrency(packagingDebt)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Total</p>
                                <p className="text-lg font-black text-slate-950">{formatCurrency(totalDebt)}</p>
                            </div>
                        </div>

                        {/* Payment method */}
                        <div className="space-y-2">
                            <Label className="text-sm font-bold">Mode de paiement</Label>
                            <div className="grid grid-cols-2 gap-2">
                                {methods.map(({ value, label, icon: Icon }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setPaymentMethod(value)}
                                        className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-all ${paymentMethod === value
                                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                            : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Amount */}
                        <div className="space-y-2">
                            <Label className="text-sm font-bold">Montant (FCFA)</Label>
                            <Input
                                type="number"
                                min={0}
                                max={totalDebt}
                                value={amount || ''}
                                onChange={e => setAmount(Number(e.target.value))}
                                placeholder="0"
                                className="text-lg font-bold"
                            />
                            <div className="flex gap-2">
                                {productDebt > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setAmount(productDebt)}
                                        className="text-xs px-3 py-1 rounded-full bg-rose-50 text-rose-600 font-bold hover:bg-rose-100 transition-colors"
                                    >
                                        Solder produits ({formatCurrency(productDebt)})
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setAmount(totalDebt)}
                                    className="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                                >
                                    Tout solder ({formatCurrency(totalDebt)})
                                </button>
                            </div>
                        </div>

                        {/* Allocation preview */}
                        {amount > 0 && (
                            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 space-y-2">
                                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Répartition du paiement</p>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-600">Produits</span>
                                    <span className="font-bold text-slate-950">{formatCurrency(previewProducts)}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-600">Emballages</span>
                                    <span className="font-bold text-slate-950">{formatCurrency(previewPackaging)}</span>
                                </div>
                            </div>
                        )}

                        {/* Reference */}
                        {paymentMethod !== 'cash' && (
                            <div className="space-y-2">
                                <Label className="text-sm font-bold">Référence transaction</Label>
                                <Input
                                    value={reference}
                                    onChange={e => setReference(e.target.value)}
                                    placeholder="Numéro de transaction..."
                                />
                            </div>
                        )}

                        {/* Notes */}
                        <div className="space-y-2">
                            <Label className="text-sm font-bold">Notes (optionnel)</Label>
                            <Textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                rows={2}
                                placeholder="Remarques..."
                            />
                        </div>

                        {amount > totalDebt && (
                            <p className="text-sm text-rose-600">
                                Le montant dépasse la dette totale ({formatCurrency(totalDebt)}).
                            </p>
                        )}

                        {error && (
                            <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Submit */}
                        <Button
                            onClick={handleSubmit}
                            disabled={loading || amount <= 0 || amount > totalDebt}
                            className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 font-bold text-base"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Banknote className="h-4 w-4 mr-2" />
                            )}
                            Enregistrer le paiement de {formatCurrency(amount)}
                        </Button>
                    </div>
            </DialogContent>
        </Dialog>
    )
}
