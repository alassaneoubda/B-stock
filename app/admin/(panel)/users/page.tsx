'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { toast } from 'sonner'
import { Loader2, Search, KeyRound, ChevronLeft, ChevronRight, Copy, Users } from 'lucide-react'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatNumber } from '@/lib/format'
import { ROLES, ROLE_LABELS } from '@/lib/permissions'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'

const fetcher = (url: string) => apiFetch(url)

const roleLabel = (r: string) => (ROLE_LABELS as Record<string, string>)[r] || r

type User = {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  auth_provider: string | null
  last_login_at: string | null
  company_id: string
  company_name: string
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [resetInfo, setResetInfo] = useState<{ email: string; password: string } | null>(null)
  const [toReset, setToReset] = useState<User | null>(null)

  const qs = new URLSearchParams({ search, role, page: String(page) }).toString()
  const { data, error, isLoading, mutate } = useSWR<{
    data: User[]
    pagination: { page: number; pages: number; total: number }
  }>(`/api/admin/users?${qs}`, fetcher)

  const users = data?.data || []
  const pagination = data?.pagination

  async function patch(userId: string, body: { role?: string; isActive?: boolean }, key: string, success: string) {
    if (busy) return
    setBusy(key)
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: 'PATCH', body })
      toast.success(success)
      await mutate()
    } catch (e) {
      toastError(e, 'Modification impossible')
    } finally {
      setBusy(null)
    }
  }

  async function resetPassword(u: User) {
    if (busy) return
    setBusy('reset-' + u.id)
    try {
      const json = await apiFetch<{ email: string; tempPassword: string }>(
        `/api/admin/users/${u.id}/reset-password`,
        { method: 'POST' }
      )
      setResetInfo({ email: json.email, password: json.tempPassword })
      toast.success('Mot de passe réinitialisé')
      setToReset(null)
    } catch (e) {
      setToReset(null)
      toastError(e, 'Réinitialisation impossible')
    } finally {
      setBusy(null)
    }
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      toast.success('Mot de passe copié')
    } catch {
      toast.error('Copie impossible', { description: 'Sélectionnez le mot de passe et copiez-le manuellement.' })
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Utilisateurs</h1>
        <p className="text-sm text-muted-foreground">
          {pagination ? `${formatNumber(pagination.total)} utilisateur(s) — tous tenants` : 'Tous les tenants'}
        </p>
      </header>

      {resetInfo && (
        <Card className="p-4 mb-4 border-brand/40 bg-brand-soft">
          <p className="text-sm text-brand-strong mb-2 font-medium">
            Mot de passe temporaire pour {resetInfo.email}
          </p>
          <div className="flex items-center gap-2">
            <code className="px-3 py-1.5 bg-card rounded border border-brand/40 text-sm font-mono">
              {resetInfo.password}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyPassword(resetInfo.password)}
            >
              <Copy className="h-4 w-4 mr-1.5" /> Copier
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResetInfo(null)}>
              Fermer
            </Button>
          </div>
          <p className="text-xs text-brand-strong mt-2">
            Communiquez-le à l&apos;utilisateur. Il ne sera plus affiché.
          </p>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Rechercher (email, nom, entreprise)…"
            className="pl-9 h-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value)
            setPage(1)
          }}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
          aria-label="Filtrer par rôle"
        >
          <option value="">Tous les rôles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton columns={5} />
          </div>
        ) : error ? (
          <ErrorState className="m-5" description={errorMessage(error)} onRetry={() => mutate()} />
        ) : users.length === 0 ? (
          <EmptyState
            className="m-5"
            icon={Users}
            title="Aucun utilisateur"
            description={search || role ? 'Aucun utilisateur ne correspond à ces filtres.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Utilisateur</th>
                  <th className="px-5 py-3 font-medium">Entreprise</th>
                  <th className="px-5 py-3 font-medium">Rôle</th>
                  <th className="px-5 py-3 font-medium">Actif</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border hover:bg-muted/50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-foreground">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground/70">
                        {u.email}
                        {u.auth_provider === 'google' && ' · Google'}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/admin/companies/${u.company_id}`} className="text-foreground/80 hover:underline">
                        {u.company_name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={u.role}
                        disabled={!!busy}
                        aria-label={`Rôle de ${u.email}`}
                        onChange={(e) =>
                          patch(
                            u.id,
                            { role: e.target.value },
                            'role-' + u.id,
                            `Rôle de ${u.email} : ${roleLabel(e.target.value)}`
                          )
                        }
                        className="rounded-md border border-border bg-card px-2 py-1 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() =>
                          patch(
                            u.id,
                            { isActive: !u.is_active },
                            'active-' + u.id,
                            u.is_active ? `${u.email} désactivé` : `${u.email} réactivé`
                          )
                        }
                        disabled={!!busy}
                        role="switch"
                        aria-checked={u.is_active}
                        aria-label={u.is_active ? `Désactiver ${u.email}` : `Activer ${u.email}`}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          u.is_active ? 'bg-success' : 'bg-muted-foreground/20'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-card transition-transform ${
                            u.is_active ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setToReset(u)}
                        disabled={!!busy}
                        aria-label={`Réinitialiser le mot de passe de ${u.email}`}
                      >
                        {busy === 'reset-' + u.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        MDP
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} / {pagination.pages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Page précédente"
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted/50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Page suivante"
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted/50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <AlertDialog open={!!toReset} onOpenChange={(o) => !o && !busy && setToReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser le mot de passe de {toReset?.email} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Son mot de passe actuel cessera immédiatement de fonctionner et un mot de passe temporaire sera
              affiché une seule fois, à lui transmettre.
              {toReset?.auth_provider === 'google' &&
                ' Ce compte utilise la connexion Google : il passera en connexion par email et mot de passe.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busy}
              onClick={(e) => {
                e.preventDefault()
                if (toReset) resetPassword(toReset)
              }}
            >
              {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Réinitialiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
