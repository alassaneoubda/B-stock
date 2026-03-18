'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Loader2, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

const userSchema = z.object({
    fullName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    email: z.string().email('Email invalide'),
    password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
    role: z.enum(['manager', 'cashier', 'warehouse_keeper']),
    phone: z.string().optional(),
    permissions: z.array(z.string()).default([]),
})

type UserForm = z.infer<typeof userSchema>

const roles = [
    { value: 'manager', label: 'Gérant' },
    { value: 'cashier', label: 'Caissier' },
    { value: 'warehouse_keeper', label: 'Magasinier' },
]

const modules = [
    { id: 'sales', label: 'Ventes & Clients' },
    { id: 'deliveries', label: 'Livraisons' },
    { id: 'products', label: 'Stock & Produits' },
    { id: 'procurement', label: 'Approvisionnement' },
    { id: 'reports', label: 'Rapports & Alertes' },
    { id: 'vehicles', label: 'Véhicules' },
    { id: 'settings', label: 'Configuration' },
]

export default function NewUserPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm<UserForm>({
        resolver: zodResolver(userSchema),
        defaultValues: {
            role: 'cashier',
        }
    })

    const selectedRole = watch('role')

    async function onSubmit(data: UserForm) {
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })

            const result = await response.json()

            if (!response.ok) {
                setError(result.error || 'Une erreur est survenue')
                return
            }

            router.push('/dashboard/settings/users')
            router.refresh()
        } catch {
            setError('Une erreur est survenue. Veuillez réessayer.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Ajouter un utilisateur"
                description="Créer un nouveau profil pour votre équipe"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/settings/users">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour
                        </Link>
                    </Button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
                    {error && (
                        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-8 border-b border-slate-100">
                            <CardTitle className="text-xl font-semibold text-slate-950">Nouvel utilisateur</CardTitle>
                            <CardDescription>Remplissez les informations ci-dessous.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-6">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Nom complet *</Label>
                                    <Input
                                        id="fullName"
                                        placeholder="Ex: Jean Dupont"
                                        {...register('fullName')}
                                        disabled={isLoading}
                                    />
                                    {errors.fullName && (
                                        <p className="text-sm text-destructive">{errors.fullName.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="email">Adresse email *</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="Ex: jean@bstock.com"
                                        {...register('email')}
                                        disabled={isLoading}
                                    />
                                    {errors.email && (
                                        <p className="text-sm text-destructive">{errors.email.message}</p>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="password">Mot de passe temporaire *</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        {...register('password')}
                                        disabled={isLoading}
                                    />
                                    {errors.password && (
                                        <p className="text-sm text-destructive">{errors.password.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Téléphone</Label>
                                    <Input
                                        id="phone"
                                        placeholder="Optionnel"
                                        {...register('phone')}
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="role">Rôle assigné *</Label>
                                <Select
                                    onValueChange={(value) => setValue('role', value as any)}
                                    value={selectedRole}
                                    disabled={isLoading}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Sélectionner un rôle" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {roles.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                                {type.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {errors.role && (
                                    <p className="text-sm text-destructive">{errors.role.message}</p>
                                )}
                            </div>

                            <div className="space-y-4 pt-4 border-t border-slate-100">
                                <div className="flex items-center gap-2 text-slate-900 font-bold mb-2">
                                    <ShieldCheck className="h-5 w-5 text-primary" />
                                    <span>Permissions & Accès aux modules</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {modules.map((m) => (
                                        <div key={m.id} className="flex items-center space-x-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                                            <Checkbox
                                                id={m.id}
                                                checked={watch('permissions')?.includes(m.id)}
                                                onCheckedChange={(checked) => {
                                                    const current = watch('permissions') || []
                                                    if (checked) {
                                                        setValue('permissions', [...current, m.id])
                                                    } else {
                                                        setValue('permissions', current.filter(id => id !== m.id))
                                                    }
                                                }}
                                            />
                                            <Label
                                                htmlFor={m.id}
                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer w-full"
                                            >
                                                {m.label}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <Button type="submit" className="w-full h-12 rounded-xl font-bold text-base mt-4" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Créer l'utilisateur
                            </Button>
                        </CardContent>
                    </Card>
                </form>
            </main>
        </div>
    )
}
