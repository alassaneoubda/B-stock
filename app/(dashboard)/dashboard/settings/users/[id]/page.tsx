'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Save, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

const MODULES = [
    { id: 'dashboard', label: 'Tableau de bord' },
    { id: 'sales', label: 'Ventes & Facturation' },
    { id: 'inventory', label: 'Stock & Inventaire' },
    { id: 'procurement', label: 'Approvisionnement' },
    { id: 'clients', label: 'Gestion Clients' },
    { id: 'suppliers', label: 'Fournisseurs' },
    { id: 'deliveries', label: 'Livraisons' },
    { id: 'vehicles', label: 'Véhicules' },
    { id: 'reports', label: 'Rapports & Stats' },
    { id: 'settings', label: 'Paramètres' },
]

export default function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [user, setUser] = useState<any>(null)
    const [permissions, setPermissions] = useState<string[]>([])

    useEffect(() => {
        async function fetchUser() {
            setIsLoading(true)
            try {
                const res = await fetch(`/api/users/${id}`)
                const data = await res.json()
                if (data.success) {
                    setUser(data.data)
                    setPermissions(data.data.permissions || [])
                } else {
                    toast.error("Erreur", { description: data.error })
                    router.push('/dashboard/settings/users')
                }
            } catch (error) {
                toast.error("Erreur lors du chargement de l'utilisateur")
            } finally {
                setIsLoading(false)
            }
        }
        fetchUser()
    }, [id, router])

    const togglePermission = (moduleId: string) => {
        setPermissions(prev =>
            prev.includes(moduleId)
                ? prev.filter(p => p !== moduleId)
                : [...prev, moduleId]
        )
    }

    const selectAll = () => setPermissions(MODULES.map(m => m.id))
    const selectNone = () => setPermissions([])

    const onSave = async () => {
        setIsSaving(true)
        try {
            const res = await fetch(`/api/users/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    permissions,
                    role: user.role,
                    fullName: user.full_name,
                    isActive: user.is_active
                })
            })
            const data = await res.json()
            if (data.success) {
                toast.success("Succès", { description: "Permissions mises à jour" })
                router.refresh()
            } else {
                toast.error("Erreur", { description: data.error })
            }
        } catch (error) {
            toast.error("Erreur lors de la sauvegarde")
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        )
    }

    if (!user) return null

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title={`Modifier l'utilisateur : ${user.full_name}`}
                description="Gérez les accès et les permissions de cet utilisateur"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/settings/users">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour à la liste
                        </Link>
                    </Button>
                </div>

                <div className="max-w-4xl space-y-8">
                    <div className="grid gap-8 md:grid-cols-3">
                        <Card className="md:col-span-1 rounded-lg border-slate-200/60 shadow-sm overflow-hidden h-fit">
                            <CardHeader className="px-8 py-8 border-b border-slate-100">
                                <CardTitle className="text-lg font-semibold text-slate-950">Infos utilisateur</CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 space-y-4">
                                <div>
                                    <Label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Email</Label>
                                    <p className="font-bold text-slate-950">{user.email}</p>
                                </div>
                                <div>
                                    <Label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Rôle actuel</Label>
                                    <p className="capitalize font-bold text-slate-950">{user.role}</p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="md:col-span-2 rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                            <CardHeader className="px-8 py-8 border-b border-slate-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-xl font-semibold text-slate-950">Permissions par module</CardTitle>
                                        <CardDescription>Cochez les modules auxquels cet utilisateur a accès.</CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={selectAll} className="text-[10px] font-semibold uppercase tracking-wider h-8 px-3 rounded-lg">Tout</Button>
                                        <Button variant="outline" size="sm" onClick={selectNone} className="text-[10px] font-semibold uppercase tracking-wider h-8 px-3 rounded-lg">Aucun</Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-8 grid gap-4 grid-cols-1 sm:grid-cols-2">
                                {MODULES.map((module) => (
                                    <div
                                        key={module.id}
                                        className={`flex items-center space-x-3 p-4 rounded-md border transition-all cursor-pointer ${permissions.includes(module.id)
                                            ? 'bg-blue-50 border-blue-200'
                                            : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                                            }`}
                                        onClick={() => togglePermission(module.id)}
                                    >
                                        <Checkbox
                                            id={module.id}
                                            checked={permissions.includes(module.id)}
                                            onCheckedChange={() => togglePermission(module.id)}
                                            className="h-5 w-5 rounded-lg data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                        />
                                        <Label htmlFor={module.id} className="font-bold text-slate-700 cursor-pointer flex-1">
                                            {module.label}
                                        </Label>
                                    </div>
                                ))}
                            </CardContent>
                            <CardFooter className="px-8 py-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                                <Button
                                    onClick={onSave}
                                    className="rounded-md h-12 px-8 bg-blue-600 hover:bg-blue-700 font-semibold shadow-lg shadow-blue-500/20"
                                    disabled={isSaving}
                                >
                                    {isSaving ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <Save className="h-4 w-4 mr-2" />
                                    )}
                                    Enregistrer les accès
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    )
}
