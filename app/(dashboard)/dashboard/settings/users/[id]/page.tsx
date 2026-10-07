'use client'

import { useCallback, useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
import { Card, CardAction, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ErrorState } from '@/components/states'
import { ArrowLeft, Loader2, Save, Lock, KeyRound, Copy, Check, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { ASSIGNABLE_ROLES, ROLE_LABELS, type AssignableRole } from '@/lib/permissions'
import type { UserRole } from '@/lib/types'
import { MODULE_OPTIONS, MODULES_HELP_TEXT } from '@/components/dashboard/module-labels'

interface ManagedUser {
    id: string
    email: string
    full_name: string
    role: UserRole
    permissions: string[] | null
    is_active: boolean
    last_login_at: string | null
}

export default function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const router = useRouter()
    const { data: session } = useSession()
    const actorRole = session?.user?.role
    const actorIsOwner = actorRole === 'owner'

    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [user, setUser] = useState<ManagedUser | null>(null)
    const [permissions, setPermissions] = useState<string[]>([])
    const [role, setRole] = useState<UserRole>('cashier')
    const [isActive, setIsActive] = useState(true)
    const [confirmDeactivate, setConfirmDeactivate] = useState(false)
    const [confirmReset, setConfirmReset] = useState(false)
    const [isResetting, setIsResetting] = useState(false)
    const [resetResult, setResetResult] = useState<{ emailed: boolean; email: string; link?: string; expiresAt: string } | null>(null)
    const [copied, setCopied] = useState(false)

    const applyUser = (data: ManagedUser) => {
        setUser(data)
        setPermissions(Array.isArray(data.permissions) ? data.permissions : [])
        setRole(data.role)
        setIsActive(data.is_active)
    }

    const fetchUser = useCallback(async () => {
        setIsLoading(true)
        setLoadError(null)
        try {
            const { data } = await apiFetch<{ data: ManagedUser }>(`/api/users/${id}`)
            applyUser(data)
        } catch (error) {
            setLoadError(errorMessage(error))
        } finally {
            setIsLoading(false)
        }
    }, [id])

    useEffect(() => { fetchUser() }, [fetchUser])

    // Règles miroir de PATCH /api/users/[id] : on masque ce que l'API refuserait
    const isSelf = !!user && user.id === session?.user?.id
    const isOwnerAccount = user?.role === 'owner'
    const managerLocked = !actorIsOwner && user?.role === 'manager'
    const canEditAccess = !!user && !isOwnerAccount && !isSelf && !managerLocked
    const canEditModules = !!user && !isOwnerAccount && !managerLocked
    const canResetPassword = !!user && !isOwnerAccount && !isSelf && !managerLocked
    const roleOptions = ASSIGNABLE_ROLES.filter((r) => r !== 'manager' || actorIsOwner)

    const togglePermission = (moduleId: string) => {
        setPermissions(prev =>
            prev.includes(moduleId)
                ? prev.filter(p => p !== moduleId)
                : [...prev, moduleId]
        )
    }

    const selectAll = () => setPermissions(MODULE_OPTIONS.map(m => m.id))
    const selectNone = () => setPermissions([])

    const onResetPassword = async () => {
        if (isResetting) return
        setIsResetting(true)
        try {
            const data = await apiFetch<{ emailed: boolean; email: string; link?: string; expiresAt: string }>(
                `/api/users/${id}/reset-password`,
                { method: 'POST' }
            )
            setConfirmReset(false)
            setResetResult(data)
            setCopied(false)
        } catch (error) {
            setConfirmReset(false)
            toastError(error, 'Réinitialisation impossible')
        } finally {
            setIsResetting(false)
        }
    }

    const copyResetLink = async () => {
        if (!resetResult?.link) return
        try {
            await navigator.clipboard.writeText(resetResult.link)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error('Copie impossible', { description: 'Sélectionnez le lien et copiez-le manuellement.' })
        }
    }

    const save = async () => {
        if (!user || isSaving) return
        setIsSaving(true)
        try {
            const body: Record<string, unknown> = {}
            if (canEditModules) body.permissions = permissions
            if (canEditAccess) {
                body.role = role
                body.isActive = isActive
            }
            const { data } = await apiFetch<{ data: ManagedUser }>(`/api/users/${id}`, { method: 'PATCH', body })
            applyUser({ ...user, ...data })
            toast.success('Modifications enregistrées', {
                description: isSelf
                    ? 'Votre session va être renouvelée : reconnectez-vous si nécessaire.'
                    : "L'utilisateur devra se reconnecter pour voir ses nouveaux accès.",
            })
            router.refresh()
        } catch (error) {
            toastError(error, 'Enregistrement impossible')
        } finally {
            setIsSaving(false)
            setConfirmDeactivate(false)
        }
    }

    const onSave = () => {
        // Désactiver un compte le déconnecte immédiatement : confirmation explicite
        if (canEditAccess && user?.is_active && !isActive) {
            setConfirmDeactivate(true)
            return
        }
        save()
    }

    const backLink = (
        <div>
            <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
                <Link href="/dashboard/settings/users">
                    <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Utilisateurs
                </Link>
            </Button>
        </div>
    )

    if (isLoading) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier l'utilisateur" />
                <PageShell>
                    {backLink}
                    <div className="grid gap-6 lg:grid-cols-3" aria-busy="true" aria-label="Chargement">
                        <div className="space-y-6 lg:col-span-2">
                            <Skeleton className="h-44 rounded-xl" />
                            <Skeleton className="h-72 rounded-xl" />
                        </div>
                        <Skeleton className="h-72 rounded-xl" />
                    </div>
                </PageShell>
            </div>
        )
    }

    if (loadError || !user) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier l'utilisateur" />
                <PageShell>
                    {backLink}
                    <div className="max-w-3xl">
                        <ErrorState description={loadError ?? undefined} onRetry={fetchUser} />
                    </div>
                </PageShell>
            </div>
        )
    }

    const lockedReason = isOwnerAccount
        ? 'Le propriétaire a accès à tout : son rôle et ses accès ne sont pas modifiables.'
        : managerLocked
            ? 'Seul le propriétaire peut modifier un gérant.'
            : isSelf
                ? 'Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte.'
                : null

    const initials = user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title={user.full_name}
                description="Gérez le rôle et l'accès de cet utilisateur"
            />
            <PageShell>
                {backLink}

                {lockedReason && (
                    <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
                        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <p>{lockedReason}</p>
                    </div>
                )}

                <div className="grid items-start gap-6 lg:grid-cols-3">
                    {/* Contenu principal (2/3) */}
                    <div className="space-y-6 lg:col-span-2">
                        <Card>
                            <CardHeader className="border-b border-border">
                                <CardTitle className="text-[15px]">Rôle et statut</CardTitle>
                                <CardDescription>Le rôle détermine les pages et actions réellement autorisées.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="user-role">Rôle</Label>
                                    {canEditAccess ? (
                                        <Select value={role} onValueChange={(value) => setRole(value as AssignableRole)} disabled={isSaving}>
                                            <SelectTrigger id="user-role" className="h-10 w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {roleOptions.map((r) => (
                                                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <p id="user-role" className="flex h-10 items-center rounded-lg bg-muted px-3 text-sm font-medium text-foreground">
                                            {ROLE_LABELS[user.role] ?? user.role}
                                        </p>
                                    )}
                                </div>
                                {canEditAccess && (
                                    <div className="space-y-2">
                                        <Label htmlFor="user-active">Compte actif</Label>
                                        <div className="flex h-10 items-center justify-between gap-3 rounded-lg border border-border px-3">
                                            <p className="text-xs text-muted-foreground">Un compte désactivé ne peut plus se connecter.</p>
                                            <Switch id="user-active" checked={isActive} onCheckedChange={setIsActive} disabled={isSaving} />
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="border-b border-border">
                                <CardTitle className="text-[15px]">Rubriques du menu</CardTitle>
                                <CardDescription>
                                    Les accès réels dépendent du rôle. {MODULES_HELP_TEXT}
                                </CardDescription>
                                {canEditModules && (
                                    <CardAction className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={selectAll} disabled={isSaving} className="h-8">Tout</Button>
                                        <Button variant="outline" size="sm" onClick={selectNone} disabled={isSaving} className="h-8">Aucun</Button>
                                    </CardAction>
                                )}
                            </CardHeader>
                            {isOwnerAccount ? (
                                <CardContent className="text-sm text-muted-foreground">
                                    Le propriétaire voit toutes les rubriques.
                                </CardContent>
                            ) : (
                                <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {MODULE_OPTIONS.map((module) => {
                                        const checked = permissions.includes(module.id)
                                        return (
                                            <label
                                                key={module.id}
                                                htmlFor={`module-${module.id}`}
                                                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${canEditModules ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} ${checked
                                                    ? 'border-brand/40 bg-brand-soft'
                                                    : 'border-border hover:bg-muted/50'
                                                    }`}
                                            >
                                                <Checkbox
                                                    id={`module-${module.id}`}
                                                    checked={checked}
                                                    disabled={!canEditModules || isSaving}
                                                    onCheckedChange={() => togglePermission(module.id)}
                                                />
                                                <span className="flex-1 text-sm font-medium text-foreground">
                                                    {module.label}
                                                </span>
                                            </label>
                                        )
                                    })}
                                </CardContent>
                            )}
                        </Card>

                        {(canEditModules || canEditAccess) && (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-muted-foreground">
                                    Après un changement de rôle ou de rubriques, l&apos;utilisateur est déconnecté.
                                </p>
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    <Button variant="outline" asChild>
                                        <Link href="/dashboard/settings/users">Annuler</Link>
                                    </Button>
                                    <Button onClick={onSave} disabled={isSaving}>
                                        {isSaving ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                        ) : (
                                            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                                        )}
                                        Enregistrer
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Résumé (1/3) */}
                    <Panel title="Résumé" className="lg:sticky lg:top-24">
                        <div className="flex items-center gap-3 px-5 py-4">
                            <span
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground"
                                aria-hidden="true"
                            >
                                {initials}
                            </span>
                            <div className="min-w-0 space-y-1">
                                <p className="truncate text-sm font-semibold text-foreground">{user.full_name}</p>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Badge variant="muted">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                                    <StatusBadge label={user.is_active ? 'Actif' : 'Inactif'} tone={user.is_active ? 'success' : 'default'} />
                                </div>
                            </div>
                        </div>
                        <dl className="divide-y divide-border border-t border-border">
                            <div className="space-y-0.5 px-5 py-3">
                                <dt className="text-xs text-muted-foreground">E-mail</dt>
                                <dd className="break-all text-sm font-medium text-foreground">{user.email}</dd>
                            </div>
                            <div className="space-y-0.5 px-5 py-3">
                                <dt className="text-xs text-muted-foreground">Dernière connexion</dt>
                                <dd className="tabular text-sm text-foreground">{user.last_login_at ? formatDateTime(user.last_login_at) : 'Jamais'}</dd>
                            </div>
                        </dl>
                        {canResetPassword && (
                            <div className="space-y-2 border-t border-border px-5 py-4">
                                <p className="text-sm font-medium text-foreground">Sécurité</p>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => setConfirmReset(true)}
                                    disabled={isResetting}
                                >
                                    {isResetting ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                    ) : (
                                        <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                                    )}
                                    Envoyer un lien de réinitialisation
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                    L&apos;employé reçoit par email un lien (60 min, usage unique) pour choisir son mot de passe.
                                </p>
                            </div>
                        )}
                    </Panel>
                </div>

                {/* Confirmation : désactivation du compte */}
                <AlertDialog open={confirmDeactivate} onOpenChange={(o) => { if (!isSaving) setConfirmDeactivate(o) }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Désactiver le compte de {user.full_name} ?</AlertDialogTitle>
                            <AlertDialogDescription>
                                L&apos;utilisateur sera déconnecté immédiatement et ne pourra plus se connecter tant que
                                vous n&apos;aurez pas réactivé son compte. Son historique (ventes, caisse) est conservé.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isSaving}>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                                disabled={isSaving}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={(e) => { e.preventDefault(); save() }}
                            >
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                                Désactiver
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Confirmation : réinitialisation du mot de passe */}
                <AlertDialog open={confirmReset} onOpenChange={(o) => { if (!isResetting) setConfirmReset(o) }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Envoyer un lien de réinitialisation ?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {user.full_name} recevra à l&apos;adresse {user.email} un lien valable 60 minutes, utilisable
                                une seule fois, pour choisir un nouveau mot de passe. Ses sessions ouvertes seront fermées
                                à ce moment-là. Si l&apos;email ne peut pas partir, le lien vous sera affiché.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isResetting}>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                                disabled={isResetting}
                                onClick={(e) => { e.preventDefault(); onResetPassword() }}
                            >
                                {isResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                                Envoyer le lien
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Résultat : lien envoyé, ou lien à transmettre si l'email n'a pas pu partir */}
                <Dialog open={!!resetResult} onOpenChange={(o) => { if (!o) setResetResult(null) }}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{resetResult?.emailed ? 'Lien envoyé' : 'Lien à transmettre'}</DialogTitle>
                            <DialogDescription>
                                {resetResult?.emailed
                                    ? `Un lien de réinitialisation a été envoyé à ${resetResult.email}. Il est valable jusqu’à ${resetResult ? formatDateTime(resetResult.expiresAt) : ''}.`
                                    : `L’email n’a pas pu être envoyé. Transmettez ce lien à ${user.full_name} (${user.email}) : il est valable jusqu’à ${resetResult ? formatDateTime(resetResult.expiresAt) : ''} et ne sert qu’une fois.`}
                            </DialogDescription>
                        </DialogHeader>
                        {resetResult && !resetResult.emailed && resetResult.link && (
                            <>
                                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
                                    <code className="flex-1 select-all break-all font-mono text-xs text-foreground">{resetResult.link}</code>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="shrink-0"
                                        onClick={copyResetLink}
                                        aria-label={copied ? 'Lien copié' : 'Copier le lien'}
                                    >
                                        {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                                    </Button>
                                </div>
                                <p className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-foreground">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    Ce lien n&apos;est affiché qu&apos;une seule fois. Ne le transmettez qu&apos;à l&apos;intéressé.
                                </p>
                            </>
                        )}
                        <DialogFooter>
                            <Button onClick={() => setResetResult(null)}>Fermer</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </PageShell>
        </div>
    )
}
