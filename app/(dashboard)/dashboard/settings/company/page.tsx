'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { ArrowLeft, Lock, Save, Loader2 } from 'lucide-react'

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
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Informations de l'entreprise"
                description="Gérez les informations de votre société"
            />
            <PageShell>
                <div>
                    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
                        <Link href="/dashboard/settings">
                            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Paramètres
                        </Link>
                    </Button>
                </div>

                <div className="max-w-3xl">
                    {isLoading ? (
                        <Card aria-busy="true" aria-label="Chargement">
                            <CardHeader>
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-3 w-64" />
                            </CardHeader>
                            <CardContent className="grid gap-4 md:grid-cols-2">
                                {Array.from({ length: 4 }, (_, i) => (
                                    <div key={i} className="space-y-2">
                                        <Skeleton className="h-3 w-28" />
                                        <Skeleton className="h-10 w-full rounded-lg" />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    ) : loadError ? (
                        <ErrorState description={loadError} onRetry={fetchCompany} />
                    ) : (
                        <form onSubmit={handleSave} className="space-y-6">
                            {!canEdit && (
                                <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
                                    <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    <p>Seul le propriétaire du compte peut modifier ces informations.</p>
                                </div>
                            )}
                            <Card>
                                <CardHeader className="border-b border-border">
                                    <CardTitle className="text-[15px]">Entreprise</CardTitle>
                                    <CardDescription>Ces informations figurent sur vos factures et bons de livraison.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <fieldset disabled={!canEdit || saving} className="grid gap-4 md:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="company-name">Nom de l&apos;entreprise</Label>
                                            <Input
                                                id="company-name"
                                                className="h-10"
                                                value={form.name}
                                                maxLength={255}
                                                required
                                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="company-sector">Secteur</Label>
                                            <Select value={form.sector || undefined} onValueChange={(sector) => setForm({ ...form, sector })}>
                                                <SelectTrigger id="company-sector" className="h-10 w-full">
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
                                        <div className="space-y-2">
                                            <Label htmlFor="company-phone">Téléphone</Label>
                                            <Input
                                                id="company-phone"
                                                type="tel"
                                                maxLength={20}
                                                className="h-10"
                                                value={form.phone}
                                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="company-email">E-mail</Label>
                                            <Input
                                                id="company-email"
                                                type="email"
                                                maxLength={255}
                                                className="h-10"
                                                value={form.email}
                                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-2 md:col-span-2">
                                            <Label htmlFor="company-address">Adresse</Label>
                                            <Input
                                                id="company-address"
                                                maxLength={500}
                                                className="h-10"
                                                value={form.address}
                                                onChange={(e) => setForm({ ...form, address: e.target.value })}
                                            />
                                            <p className="text-xs text-muted-foreground">Quartier, ville — telle qu&apos;elle doit apparaître sur vos documents.</p>
                                        </div>
                                    </fieldset>
                                </CardContent>
                                {(formError || canEdit) && (
                                    <CardFooter className="flex-col items-stretch gap-3 border-t border-border">
                                        {formError && (
                                            <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{formError}</p>
                                        )}
                                        {canEdit && (
                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                <Button type="button" variant="outline" asChild>
                                                    <Link href="/dashboard/settings">Annuler</Link>
                                                </Button>
                                                <Button type="submit" disabled={saving}>
                                                    {saving ? (
                                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Enregistrement…</>
                                                    ) : (
                                                        <><Save className="mr-2 h-4 w-4" aria-hidden="true" /> Enregistrer</>
                                                    )}
                                                </Button>
                                            </div>
                                        )}
                                    </CardFooter>
                                )}
                            </Card>
                        </form>
                    )}
                </div>
            </PageShell>
        </div>
    )
}
