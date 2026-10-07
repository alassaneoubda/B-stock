'use client'

import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { AlertTriangle, Check, Copy, Loader2, LogOut, Plus, ShieldCheck, ShieldOff, UserCog } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageShell, PageIntro, StatusBadge } from '@/components/app/blocks'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { useAdmin } from '@/components/admin/admin-role'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import type { AdminRole } from '@/lib/admin-auth'

type Admin = {
  id: string
  email: string
  full_name: string
  role: AdminRole
  is_active: boolean
  totp_enabled: boolean
  last_login_at: string | null
  created_at: string | null
}

type Confirm =
  | { kind: 'deactivate' | 'activate' | 'reset_2fa' | 'force_logout'; admin: Admin }
  | { kind: 'role'; admin: Admin; role: AdminRole }

const ROLES: AdminRole[] = ['super_admin', 'support', 'finance']

const ROLE_HELP: Record<AdminRole, string> = {
  super_admin: 'Tout : paramètres, plans, contenu, administrateurs, suppressions.',
  support: 'Suivi des clients, assistance (connexion en tant que client), liens de réinitialisation, annonces.',
  finance: 'Paiements, abonnements, plans en lecture, rapports, webhooks.',
}

const selectClass =
  'h-9 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export function AdminsClient({ roleLabels }: { roleLabels: Record<AdminRole, string> }) {
  const { can, adminId } = useAdmin()
  const allowed = can('admins.manage')
  const { data, error, isLoading, mutate } = useSWR<{ data: Admin[] }>(
    allowed ? '/api/admin/admins' : null,
    (url: string) => apiFetch(url)
  )
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)

  const admins = data?.data ?? []
  const activeSupers = admins.filter((a) => a.is_active && a.role === 'super_admin').length

  if (!allowed) {
    return (
      <PageShell>
        <PageIntro title="Administrateurs" description="Comptes d’accès au back-office" />
        <div role="status" className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">
          La gestion des administrateurs est réservée aux super-administrateurs.
        </div>
      </PageShell>
    )
  }

  async function apply(c: Confirm) {
    if (busy) return
    setBusy(true)
    const body =
      c.kind === 'role'
        ? { role: c.role }
        : c.kind === 'deactivate'
          ? { is_active: false }
          : c.kind === 'activate'
            ? { is_active: true }
            : c.kind === 'reset_2fa'
              ? { reset_2fa: true }
              : { force_logout: true }
    const messages: Record<Confirm['kind'], string> = {
      role: `Rôle de ${c.admin.email} modifié`,
      deactivate: `${c.admin.email} désactivé`,
      activate: `${c.admin.email} réactivé`,
      reset_2fa: `Double authentification de ${c.admin.email} réinitialisée`,
      force_logout: `${c.admin.email} déconnecté de toutes ses sessions`,
    }
    try {
      await apiFetch(`/api/admin/admins/${c.admin.id}`, { method: 'PATCH', body })
      toast.success(messages[c.kind])
      setConfirm(null)
      await mutate()
    } catch (e) {
      toastError(e, 'Modification impossible')
      setConfirm(null)
    } finally {
      setBusy(false)
    }
  }

  /** Garde-fous affichés côté interface (l'API reste l'autorité). */
  function lockReason(a: Admin): string | null {
    if (a.id === adminId) return 'Votre propre compte : gérez-le depuis « Mon compte ».'
    if (a.role === 'super_admin' && a.is_active && activeSupers <= 1) return 'Dernier super-administrateur actif.'
    return null
  }

  return (
    <PageShell>
      <PageIntro
        title="Administrateurs"
        description="Comptes d’accès au back-office, rôles et double authentification"
        actions={
          <Button variant="brand" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nouvel administrateur
          </Button>
        }
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton columns={5} />
          </div>
        ) : error ? (
          <ErrorState className="m-5" description={errorMessage(error)} onRetry={() => mutate()} />
        ) : admins.length === 0 ? (
          <EmptyState className="m-5" icon={UserCog} title="Aucun administrateur" />
        ) : (
          <ul className="divide-y divide-border">
            {admins.map((a) => {
              const isSelf = a.id === adminId
              const lock = lockReason(a)
              return (
                <li key={a.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                      {a.full_name}
                      {isSelf && <span className="text-xs font-normal text-muted-foreground">(vous)</span>}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">{a.email}</p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <StatusBadge label={a.is_active ? 'Actif' : 'Désactivé'} tone={a.is_active ? 'success' : 'default'} />
                      <StatusBadge
                        label={a.totp_enabled ? '2FA activée' : '2FA désactivée'}
                        tone={a.totp_enabled ? 'success' : a.role === 'super_admin' ? 'danger' : 'warning'}
                      />
                      <span className="text-xs text-muted-foreground">
                        Dernière connexion :{' '}
                        <span className="tabular">{a.last_login_at ? formatDateTime(a.last_login_at) : 'jamais'}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={a.role}
                      aria-label={`Rôle de ${a.email}`}
                      title={lock ?? ROLE_HELP[a.role]}
                      disabled={busy || isSelf || (a.role === 'super_admin' && !!lock)}
                      onChange={(e) => setConfirm({ kind: 'role', admin: a, role: e.target.value as AdminRole })}
                      className={selectClass}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabels[r]}
                        </option>
                      ))}
                    </select>
                    {a.totp_enabled && !isSelf && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setConfirm({ kind: 'reset_2fa', admin: a })}
                        aria-label={`Réinitialiser la double authentification de ${a.email}`}
                      >
                        <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" /> Réinit. 2FA
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !a.is_active}
                      onClick={() => setConfirm({ kind: 'force_logout', admin: a })}
                      aria-label={`Déconnecter ${a.email} de toutes ses sessions`}
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Déconnecter
                    </Button>
                    {a.is_active ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy || !!lock}
                        title={lock ?? undefined}
                        onClick={() => setConfirm({ kind: 'deactivate', admin: a })}
                      >
                        Désactiver
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm({ kind: 'activate', admin: a })}>
                        Réactiver
                      </Button>
                    )}
                  </div>
                  {lock && <p className="sr-only">{lock}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Chaque changement de rôle, désactivation ou réinitialisation ferme les sessions de l’administrateur concerné et
        est consigné dans le journal d’audit.
      </p>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent>
          {confirm && (
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm.kind === 'role' && `Passer ${confirm.admin.email} en « ${roleLabels[confirm.role]} » ?`}
                {confirm.kind === 'deactivate' && `Désactiver ${confirm.admin.email} ?`}
                {confirm.kind === 'activate' && `Réactiver ${confirm.admin.email} ?`}
                {confirm.kind === 'reset_2fa' && `Réinitialiser la double authentification de ${confirm.admin.email} ?`}
                {confirm.kind === 'force_logout' && `Déconnecter ${confirm.admin.email} ?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm.kind === 'role' && `${ROLE_HELP[confirm.role]} Ses sessions en cours seront fermées.`}
                {confirm.kind === 'deactivate' &&
                  'Il ne pourra plus se connecter au back-office et ses sessions en cours sont fermées immédiatement.'}
                {confirm.kind === 'activate' && 'Il pourra de nouveau se connecter avec son mot de passe actuel.'}
                {confirm.kind === 'reset_2fa' &&
                  'À utiliser si le téléphone a été perdu. Il se connectera avec son seul mot de passe et devra reconfigurer la double authentification depuis « Mon compte ».'}
                {confirm.kind === 'force_logout' &&
                  'Toutes ses sessions ouvertes sont fermées ; il devra se reconnecter (mot de passe et code).'}
              </AlertDialogDescription>
            </AlertDialogHeader>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className={
                confirm?.kind === 'deactivate' || confirm?.kind === 'reset_2fa'
                  ? buttonVariants({ variant: 'destructive' })
                  : undefined
              }
              onClick={(e) => {
                e.preventDefault()
                if (confirm) apply(confirm)
              }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateAdminDialog
        open={creating}
        roleLabels={roleLabels}
        onClose={() => setCreating(false)}
        onCreated={(email, password) => {
          setCreating(false)
          setCreated({ email, password })
          mutate()
        }}
      />

      <TempPasswordDialog value={created} onClose={() => setCreated(null)} />
    </PageShell>
  )
}

/* -------------------------------------------------------------------------- */

function CreateAdminDialog({
  open,
  roleLabels,
  onClose,
  onCreated,
}: {
  open: boolean
  roleLabels: Record<AdminRole, string>
  onClose: () => void
  onCreated: (email: string, password: string) => void
}) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<AdminRole>('support')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setEmail('')
    setFullName('')
    setRole('support')
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)
    if (fullName.trim().length < 2) return setError('Nom requis')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Adresse email invalide')
    setSaving(true)
    try {
      const json = await apiFetch<{ data: Admin; tempPassword: string }>('/api/admin/admins', {
        method: 'POST',
        body: { email: email.trim(), full_name: fullName.trim(), role },
      })
      reset()
      onCreated(json.data.email, json.tempPassword)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !saving) {
          reset()
          onClose()
        }
      }}
    >
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Nouvel administrateur</DialogTitle>
            <DialogDescription>
              Un mot de passe temporaire sera généré et affiché une seule fois. Demandez-lui de le changer et d’activer
              la double authentification dès sa première connexion.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="admin-name">Nom complet</Label>
            <Input id="admin-name" value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={saving} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-role">Rôle</Label>
            <select
              id="admin-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              disabled={saving}
              className={`${selectClass} h-10 w-full`}
              aria-describedby="admin-role-help"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
            <p id="admin-role-help" className="text-xs text-muted-foreground">
              {ROLE_HELP[role]}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset()
                onClose()
              }}
              disabled={saving}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Créer le compte
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TempPasswordDialog({
  value,
  onClose,
}: {
  value: { email: string; password: string } | null
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value.password)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copie impossible', { description: 'Sélectionnez le mot de passe et copiez-le manuellement.' })
    }
  }

  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Compte créé</DialogTitle>
          <DialogDescription>Mot de passe temporaire de {value?.email} :</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
          <code className="flex-1 select-all break-all font-mono text-sm text-foreground">{value?.password}</code>
          <Button variant="outline" size="icon" className="shrink-0" onClick={copy} aria-label={copied ? 'Mot de passe copié' : 'Copier le mot de passe'}>
            {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Affiché une seule fois. Transmettez-le par un canal sûr, séparément de l’adresse de connexion.
        </p>
        <DialogFooter>
          <Button onClick={onClose}>J’ai noté le mot de passe</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
