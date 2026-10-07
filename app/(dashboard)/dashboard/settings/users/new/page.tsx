'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
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
import { ArrowLeft, Loader2 } from 'lucide-react'
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
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Ajouter un utilisateur"
                description="Créer un nouveau profil pour votre équipe"
            />
            <PageShell>
                <div>
                    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
                        <Link href="/dashboard/settings/users">
                            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Utilisateurs
                        </Link>
                    </Button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
                    {error && (
                        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card>
                        <CardHeader className="border-b border-border">
                            <CardTitle className="text-[15px]">Identité et connexion</CardTitle>
                            <CardDescription>Les identifiants que la personne utilisera pour se connecter.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="fullName">Nom complet *</Label>
                                <Input
                                    id="fullName"
                                    className="h-10"
                                    placeholder="Ex. : Jean Dupont"
                                    aria-invalid={!!errors.fullName}
                                    {...register('fullName')}
                                    disabled={isLoading}
                                />
                                {errors.fullName && (
                                    <p className="text-xs text-destructive">{errors.fullName.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">Adresse e-mail *</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    className="h-10"
                                    placeholder="Ex. : jean@bstock.com"
                                    aria-invalid={!!errors.email}
                                    {...register('email')}
                                    disabled={isLoading}
                                />
                                {errors.email && (
                                    <p className="text-xs text-destructive">{errors.email.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Mot de passe temporaire *</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    className="h-10"
                                    autoComplete="new-password"
                                    aria-invalid={!!errors.password}
                                    {...register('password')}
                                    disabled={isLoading}
                                />
                                {errors.password ? (
                                    <p className="text-xs text-destructive">{errors.password.message}</p>
                                ) : (
                                    <p className="text-xs text-muted-foreground">8 caractères minimum, avec au moins une lettre et un chiffre.</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone">Téléphone</Label>
                                <Input
                                    id="phone"
                                    className="h-10"
                                    placeholder="Optionnel"
                                    type="tel"
                                    aria-invalid={!!errors.phone}
                                    {...register('phone')}
                                    disabled={isLoading}
                                />
                                {errors.phone && (
                                    <p className="text-xs text-destructive">{errors.phone.message}</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="border-b border-border">
                            <CardTitle className="text-[15px]">Rôle et accès</CardTitle>
                            <CardDescription>{MODULES_HELP_TEXT}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="role">Rôle assigné *</Label>
                                    <Select
                                        onValueChange={(value) => setValue('role', value as any)}
                                        value={selectedRole}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger id="role" className="h-10 w-full">
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
                                        <p className="text-xs text-destructive">{errors.role.message}</p>
                                    )}
                                </div>
                            </div>

                            <fieldset>
                                <legend className="mb-3 text-sm font-medium text-foreground">Rubriques affichées dans le menu</legend>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {MODULE_OPTIONS.map((m) => (
                                        <div key={m.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/50">
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
                                                className="w-full cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                            >
                                                {m.label}
                                            </Label>
                                        </div>
                                    ))}
                                </div>
                            </fieldset>
                        </CardContent>
                    </Card>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button type="button" variant="outline" asChild>
                            <Link href="/dashboard/settings/users">Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                            {isLoading ? 'Création…' : "Créer l'utilisateur"}
                        </Button>
                    </div>
                </form>
            </PageShell>
        </div>
    )
}
