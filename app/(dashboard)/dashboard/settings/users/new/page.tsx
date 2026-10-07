'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
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
import { apiFetch, errorMessage } from '@/lib/api-client'
import { ASSIGNABLE_ROLES, ROLE_LABELS, passwordPolicyError } from '@/lib/permissions'
import { MODULE_OPTIONS, MODULES_HELP_TEXT } from '@/components/dashboard/module-labels'

const userSchema = z.object({
    fullName: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    email: z.string().email('Email invalide'),
    // Même politique que le serveur (lib/permissions)
    password: z.string().superRefine((value, ctx) => {
        const policyError = passwordPolicyError(value)
        if (policyError) ctx.addIssue({ code: z.ZodIssueCode.custom, message: policyError })
    }),
    role: z.enum(ASSIGNABLE_ROLES),
    phone: z.string().max(20, '20 caractères maximum').optional(),
    permissions: z.array(z.string()),
})

type UserForm = z.infer<typeof userSchema>


export default function NewUserPage() {
    const router = useRouter()
    const { data: session } = useSession()
    // Seul le propriétaire peut créer un gérant (refusé par l'API sinon)
    const roles = ASSIGNABLE_ROLES
        .filter((role) => role !== 'manager' || session?.user?.role === 'owner')
        .map((role) => ({ value: role, label: ROLE_LABELS[role] }))
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
            permissions: [],
        }
    })

    const selectedRole = watch('role')

    async function onSubmit(data: UserForm) {
        if (isLoading) return
        setIsLoading(true)
        setError(null)

        try {
            await apiFetch('/api/users', { method: 'POST', body: data })
            toast.success('Utilisateur créé', {
                description: `Communiquez à ${data.fullName} son email et son mot de passe temporaire.`,
            })
            router.push('/dashboard/settings/users')
            router.refresh()
        } catch (e) {
            setError(errorMessage(e))
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
                            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                            Retour
                        </Link>
                    </Button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
                    {error && (
                        <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card className="rounded-lg border-border shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-8 border-b border-border">
                            <CardTitle className="text-xl font-semibold text-foreground">Nouvel utilisateur</CardTitle>
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
                                        autoComplete="new-password"
                                        {...register('password')}
                                        disabled={isLoading}
                                    />
                                    {errors.password ? (
                                        <p className="text-sm text-destructive">{errors.password.message}</p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">8 caractères minimum, avec au moins une lettre et un chiffre.</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Téléphone</Label>
                                    <Input
                                        id="phone"
                                        placeholder="Optionnel"
                                        type="tel"
                                        {...register('phone')}
                                        disabled={isLoading}
                                    />
                                    {errors.phone && (
                                        <p className="text-sm text-destructive">{errors.phone.message}</p>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="role">Rôle assigné *</Label>
                                <Select
                                    onValueChange={(value) => setValue('role', value as any)}
                                    value={selectedRole}
                                    disabled={isLoading}
                                >
                                    <SelectTrigger id="role">
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

                            <div className="space-y-4 pt-4 border-t border-border">
                                <div className="flex items-center gap-2 text-foreground font-bold mb-2">
                                    <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
                                    <span>Rubriques affichées dans le menu</span>
                                </div>
                                <p className="text-xs text-muted-foreground -mt-2">
                                    {MODULES_HELP_TEXT}
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {MODULE_OPTIONS.map((m) => (
                                        <div key={m.id} className="flex items-center space-x-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors">
                                            <Checkbox
                                                id={`module-${m.id}`}
                                                disabled={isLoading}
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
                                                htmlFor={`module-${m.id}`}
                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer w-full"
                                            >
                                                {m.label}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <Button type="submit" className="w-full h-12 rounded-xl font-bold text-base mt-4" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                                {isLoading ? 'Création…' : "Créer l'utilisateur"}
                            </Button>
                        </CardContent>
                    </Card>
                </form>
            </main>
        </div>
    )
}
