'use client'

import { useCallback, useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
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
import { ArrowLeft, Loader2, Save, ShieldCheck, KeyRound, Copy, Check, AlertTriangle } from 'lucide-react'
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
    const [tempPassword, setTempPassword] = useState<string | null>(null)
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
            const data = await apiFetch<{ tempPassword: string }>(`/api/users/${id}/reset-password`, { method: 'POST' })
            setConfirmReset(false)
            setTempPassword(data.tempPassword)
            setCopied(false)
        } catch (error) {
            setConfirmReset(false)
            toastError(error, 'Réinitialisation impossible')
        } finally {
            setIsResetting(false)
        }
    }

    const copyTempPassword = async () => {
        if (!tempPassword) return
        try {
            await navigator.clipboard.writeText(tempPassword)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.error('Copie impossible', { description: 'Sélectionnez le mot de passe et copiez-le manuellement.' })
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

    if (isLoading) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Modifier l'utilisateur" />
                <main className="flex-1 p-4 lg:p-6">
                    <div className="max-w-4xl grid gap-8 md:grid-cols-3" aria-busy="true" aria-label="Chargement">
                        <Skeleton className="h-72 rounded-lg" />
                        <Skeleton className="h-72 rounded-lg md:col-span-2" />
                    </div>
                </main>
            </div>
        )
    }

    if (loadError || !user) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Modifier l'utilisateur" />
                <main className="flex-1 p-4 lg:p-6 max-w-2xl space-y-4">
                    <ErrorState description={loadError ?? undefined} onRetry={fetchUser} />
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/settings/users">
                            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                            Retour à la liste
                        </Link>
                    </Button>
                </main>
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

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title={`Modifier l'utilisateur : ${user.full_name}`}
                description="Gérez le rôle et l'accès de cet utilisateur"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/settings/users">
                            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                            Retour à la liste
                        </Link>
                    </Button>
                </div>

                <div className="max-w-4xl space-y-8">
                    {lockedReason && (
                        <p className="rounded-md bg-warning-soft px-4 py-3 text-sm text-warning-foreground">{lockedReason}</p>
                    )}
                    <div className="grid gap-8 md:grid-cols-3">
                        <Card className="md:col-span-1 rounded-lg border-border shadow-sm overflow-hidden h-fit">
                            <CardHeader className="px-8 py-8 border-b border-border">
                                <CardTitle className="text-lg font-semibold text-foreground">Infos utilisateur</CardTitle>
                            </CardHeader>
                            <CardContent className="p-8 space-y-4">
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Email</p>
                                    <p className="font-bold text-foreground break-all">{user.email}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Dernière connexion</p>
                                    <p className="text-sm text-foreground/80">{user.last_login_at ? formatDateTime(user.last_login_at) : 'Jamais'}</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="user-role" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Rôle</Label>
                                    {canEditAccess ? (
                                        <Select value={role} onValueChange={(value) => setRole(value as AssignableRole)} disabled={isSaving}>
                                            <SelectTrigger id="user-role">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {roleOptions.map((r) => (
                                                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <p id="user-role" className="font-bold text-foreground">{ROLE_LABELS[user.role] ?? user.role}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground">Le rôle détermine les pages et actions réellement autorisées.</p>
                                </div>
                                {canEditAccess && (
                                    <div className="flex items-center justify-between gap-3 pt-2">
                                        <div>
                                            <Label htmlFor="user-active" className="text-sm font-semibold text-foreground">Compte actif</Label>
                                            <p className="text-xs text-muted-foreground">Un compte désactivé ne peut plus se connecter.</p>
                                        </div>
                                        <Switch id="user-active" checked={isActive} onCheckedChange={setIsActive} disabled={isSaving} />
                                    </div>
                                )}
                                {canResetPassword && (
                                    <div className="pt-4 border-t border-border">
                                        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Sécurité</p>
                                        <Button
                                            variant="outline"
                                            className="w-full mt-2 rounded-md"
                                            onClick={() => setConfirmReset(true)}
                                            disabled={isResetting}
                                        >
                                            {isResetting ? (
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                                            ) : (
                                                <KeyRound className="h-4 w-4 mr-2" aria-hidden="true" />
                                            )}
                                            Réinitialiser le mot de passe
                                        </Button>
                                        <p className="text-xs text-muted-foreground mt-2">
                                            Un mot de passe temporaire sera généré et affiché une seule fois.
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card className="md:col-span-2 rounded-lg border-border shadow-sm overflow-hidden">
                            <CardHeader className="px-8 py-8 border-b border-border">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <CardTitle className="text-xl font-semibold text-foreground flex items-center gap-2">
                                            <ShieldCheck className="h-5 w-5 text-brand-strong" aria-hidden="true" />
                                            Rubriques du menu
                                        </CardTitle>
                                        <CardDescription className="mt-1">
                                            Les accès réels dépendent du rôle. {MODULES_HELP_TEXT}
                                        </CardDescription>
                                    </div>
                                    {canEditModules && (
                                        <div className="flex gap-2 shrink-0">
                                            <Button variant="outline" size="sm" onClick={selectAll} disabled={isSaving} className="text-[10px] font-semibold uppercase tracking-wider h-8 px-3 rounded-lg">Tout</Button>
                                            <Button variant="outline" size="sm" onClick={selectNone} disabled={isSaving} className="text-[10px] font-semibold uppercase tracking-wider h-8 px-3 rounded-lg">Aucun</Button>
                                        </div>
                                    )}
                                </div>
                            </CardHeader>
                            {isOwnerAccount ? (
                                <CardContent className="p-8 text-sm text-muted-foreground">
                                    Le propriétaire voit toutes les rubriques.
                                </CardContent>
                            ) : (
                                <CardContent className="p-8 grid gap-4 grid-cols-1 sm:grid-cols-2">
                                    {MODULE_OPTIONS.map((module) => {
                                        const checked = permissions.includes(module.id)
                                        return (
                                            <label
                                                key={module.id}
                                                htmlFor={`module-${module.id}`}
                                                className={`flex items-center space-x-3 p-4 rounded-md border transition-colors ${canEditModules ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'} ${checked
                                                    ? 'bg-brand-soft border-brand/40'
                                                    : 'bg-muted/50 border-border hover:border-border'
                                                    }`}
                                            >
                                                <Checkbox
                                                    id={`module-${module.id}`}
                                                    checked={checked}
                                                    disabled={!canEditModules || isSaving}
                                                    onCheckedChange={() => togglePermission(module.id)}
                                                    className="h-5 w-5 rounded-lg data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                                                />
                                                <span className="font-bold text-foreground/80 flex-1 text-sm">
                                                    {module.label}
                                                </span>
                                            </label>
                                        )
                                    })}
                                </CardContent>
                            )}
                            {(canEditModules || canEditAccess) && (
                                <CardFooter className="px-8 py-6 border-t border-border bg-muted/30 flex flex-wrap items-center justify-between gap-3">
                                    <p className="text-xs text-muted-foreground">
                                        Après un changement de rôle ou de rubriques, l&apos;utilisateur est déconnecté.
                                    </p>
                                    <Button
                                        onClick={onSave}
                                        className="rounded-md h-12 px-8 bg-primary hover:bg-primary font-semibold shadow-lg shadow-blue-500/20"
                                        disabled={isSaving}
                                    >
                                        {isSaving ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                                        ) : (
                                            <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                                        )}
                                        Enregistrer
                                    </Button>
                                </CardFooter>
                            )}
                        </Card>
                    </div>
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
                                className="bg-destructive hover:bg-destructive"
                                onClick={(e) => { e.preventDefault(); save() }}
                            >
                                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
                                Désactiver
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Confirmation : réinitialisation du mot de passe */}
                <AlertDialog open={confirmReset} onOpenChange={(o) => { if (!isResetting) setConfirmReset(o) }}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Réinitialiser le mot de passe ?</AlertDialogTitle>
                            <AlertDialogDescription>
                                L&apos;ancien mot de passe de {user.full_name} ne fonctionnera plus et ses sessions
                                ouvertes seront fermées. Un mot de passe temporaire vous sera affiché une seule fois.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={isResetting}>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                                disabled={isResetting}
                                onClick={(e) => { e.preventDefault(); onResetPassword() }}
                            >
                                {isResetting && <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
                                Réinitialiser
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Mot de passe temporaire : affiché une seule fois */}
                <Dialog open={!!tempPassword} onOpenChange={(o) => { if (!o) setTempPassword(null) }}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Mot de passe réinitialisé</DialogTitle>
                            <DialogDescription>
                                Communiquez ce mot de passe temporaire à {user.full_name} ({user.email}).
                                L&apos;utilisateur pourra se connecter avec, puis le changer dans « Sécurité ».
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
                            <code className="flex-1 font-mono text-sm break-all select-all">{tempPassword}</code>
                            <Button
                                variant="outline"
                                size="icon"
                                className="shrink-0"
                                onClick={copyTempPassword}
                                aria-label={copied ? 'Mot de passe copié' : 'Copier le mot de passe'}
                            >
                                {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                            </Button>
                        </div>
                        <p className="flex items-start gap-2 rounded-md bg-warning-soft p-3 text-sm text-warning-foreground">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                            Ce mot de passe n&apos;est affiché qu&apos;une seule fois. Notez-le ou copiez-le avant de fermer.
                        </p>
                        <DialogFooter>
                            <Button onClick={() => setTempPassword(null)}>J&apos;ai noté le mot de passe</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </main>
        </div>
    )
}
