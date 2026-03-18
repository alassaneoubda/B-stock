'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Save, Loader2 } from 'lucide-react'

export default function CompanySettingsPage() {
    const { data: session } = useSession()
    const [loading, setLoading] = useState(false)
    const [saved, setSaved] = useState(false)
    const [form, setForm] = useState({
        name: '',
        address: '',
        phone: '',
        email: '',
        sector: '',
    })

    useEffect(() => {
        async function fetchCompany() {
            try {
                const res = await fetch('/api/company')
                const data = await res.json()
                if (data.success) {
                    setForm({
                        name: data.data.name || '',
                        address: data.data.address || '',
                        phone: data.data.phone || '',
                        email: data.data.email || '',
                        sector: data.data.sector || '',
                    })
                }
            } catch (e) {
                console.error(e)
            }
        }
        fetchCompany()
    }, [])

    async function handleSave() {
        setLoading(true)
        setSaved(false)
        try {
            const res = await fetch('/api/company', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            if (res.ok) setSaved(true)
        } catch (e) {
            console.error(e)
        }
        setLoading(false)
    }

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
                            <Building2 className="h-5 w-5 text-blue-600" /> Entreprise
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-8 py-8 space-y-6">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Nom de l&apos;entreprise</Label>
                            <Input
                                className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Secteur</Label>
                            <Input
                                className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white"
                                value={form.sector}
                                onChange={(e) => setForm({ ...form, sector: e.target.value })}
                                placeholder="Distributeur, Grossiste..."
                            />
                        </div>
                        <div className="grid sm:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Téléphone</Label>
                                <Input
                                    className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white"
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Email</Label>
                                <Input
                                    className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Adresse</Label>
                            <Input
                                className="h-12 rounded-xl bg-slate-50 border-transparent focus:bg-white"
                                value={form.address}
                                onChange={(e) => setForm({ ...form, address: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center gap-4 pt-4">
                            <Button
                                className="rounded-md h-12 px-8 bg-blue-600 hover:bg-blue-700 font-bold"
                                onClick={handleSave}
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Sauvegarder</>}
                            </Button>
                            {saved && <span className="text-emerald-600 font-bold text-sm">✓ Sauvegardé</span>}
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
