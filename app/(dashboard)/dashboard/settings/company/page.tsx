'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { Building2, Save, Loader2 } from 'lucide-react'

// Mêmes libellés que la page Paramètres et l'inscription
const SECTOR_OPTIONS: Record<string, string> = {
    distributor: 'Distributeur officiel',
    wholesaler: 'Grossiste',
    semi_wholesaler: 'Demi-grossiste',
    depot: 'Dépôt de quartier',
}

type CompanyForm = { name: string; address: string; phone: string; email: string; sector: string }

const EMPTY_FORM: CompanyForm = { name: '', address: '', phone: '', email: '', sector: '' }

export default function CompanySettingsPage() {
    const { data: session } = useSession()
    // Seul le propriétaire peut modifier (PATCH /api/company est réservé à l'owner)
    const canEdit = session?.user?.role === 'owner'

    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [form, setForm] = useState<CompanyForm>(EMPTY_FORM)

    const fetchCompany = useCallback(async () => {
        setIsLoading(true)
        setLoadError(null)
        try {
            const { data } = await apiFetch<{ data: Record<string, string | null> }>('/api/company')
            setForm({
                name: data.name || '',
                address: data.address || '',
                phone: data.phone || '',
                email: data.email || '',
                sector: data.sector || '',
            })
        } catch (e) {
            setLoadError(errorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => { fetchCompany() }, [fetchCompany])

    async function handleSave(e: React.FormEvent) {
        e.preventDefault()
        if (saving) return
        setFormError(null)
        if (form.name.trim().length < 2) {
            setFormError("Le nom de l'entreprise doit contenir au moins 2 caractères.")
            return
        }
        setSaving(true)
        try {
            await apiFetch('/api/company', { method: 'PATCH', body: form })
            toast.success('Informations enregistrées')
        } catch (err) {
            setFormError(errorMessage(err))
        } finally {
            setSaving(false)
        }
    }

    const sectorIsCustom = form.sector !== '' && !(form.sector in SECTOR_OPTIONS)

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Informations de l'entreprise"
                description="Gérez les informations de votre société"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <Card className="rounded-lg border-slate-200/60 shadow-sm max-w-2xl">
                    <CardHeader className="px-8 py-8 border-b border-slate-100">
                        <CardTitle className="text-xl font-semibold text-slate-950 flex items-center gap-3">
                            <Building2 className="h-5 w-5 text-blue-600" aria-hidden="true" /> Entreprise
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-8 py-8">
                        {isLoading ? (
                            <div className="space-y-6" aria-busy="true" aria-label="Chargement">
                                {Array.from({ length: 4 }, (_, i) => (
                                    <div key={i} className="space-y-2">
                                        <Skeleton className="h-3 w-32" />
                                        <Skeleton className="h-12 w-full rounded-xl" />
                                    </div>
                                ))}
                            </div>
                        ) : loadError ? (
                            <ErrorState description={loadError} onRetry={fetchCompany} />
                        ) : (
                            <form onSubmit={handleSave} className="space-y-6">
                                {!canEdit && (
                                    <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                        Seul le propriétaire du compte peut modifier ces informations.
                                    </p>
                                )}
                                <fieldset disabled={!canEdit || saving} className="space-y-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="company-name" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nom de l&apos;entreprise</Label>
                                        <Input
                                            id="company-name"
                                            className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white"
                                            value={form.name}
                                            maxLength={255}
                                            required
                                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="company-sector" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Secteur</Label>
                                        <Select value={form.sector || undefined} onValueChange={(sector) => setForm({ ...form, sector })}>
                                            <SelectTrigger id="company-sector" className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white">
                                                <SelectValue placeholder="Choisir un secteur" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(SECTOR_OPTIONS).map(([value, label]) => (
                                                    <SelectItem key={value} value={value}>{label}</SelectItem>
                                                ))}
                                                {sectorIsCustom && <SelectItem value={form.sector}>{form.sector}</SelectItem>}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="grid sm:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <Label htmlFor="company-phone" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Téléphone</Label>
                                            <Input
                                                id="company-phone"
                                                type="tel"
                                                maxLength={20}
                                                className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white"
                                                value={form.phone}
                                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="company-email" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Email</Label>
                                            <Input
                                                id="company-email"
                                                type="email"
                                                maxLength={255}
                                                className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white"
                                                value={form.email}
                                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="company-address" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Adresse</Label>
                                        <Input
                                            id="company-address"
                                            maxLength={500}
                                            className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white"
                                            value={form.address}
                                            onChange={(e) => setForm({ ...form, address: e.target.value })}
                                        />
                                    </div>
                                </fieldset>
                                {formError && (
                                    <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</p>
                                )}
                                {canEdit && (
                                    <div className="flex items-center gap-4 pt-4">
                                        <Button
                                            type="submit"
                                            className="rounded-md h-12 px-8 bg-blue-600 hover:bg-blue-700 font-bold"
                                            disabled={saving}
                                        >
                                            {saving ? (
                                                <><Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> Enregistrement…</>
                                            ) : (
                                                <><Save className="h-4 w-4 mr-2" aria-hidden="true" /> Sauvegarder</>
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </form>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
