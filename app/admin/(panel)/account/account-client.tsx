'use client'

import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { signOut } from 'next-auth/react'
import { toast } from 'sonner'
import { Check, Copy, ExternalLink, KeyRound, Loader2, ShieldCheck, ShieldOff, UserRound } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { PageShell, PageIntro, StatusBadge } from '@/components/app/blocks'
import { ErrorState } from '@/components/states'
import { ADMIN_ACCOUNT_KEY } from '@/components/admin/two-factor-banner'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { passwordPolicyError } from '@/lib/permissions'
import type { AdminRole } from '@/lib/admin-auth'

type Account = {
  email: string
  full_name: string
  role: AdminRole
  totp_enabled: boolean
  last_login_at: string | null
  created_at: string | null
}

const fetcher = (url: string) => apiFetch<{ data: Account }>(url)

export function AdminAccountClient({ roleLabels }: { roleLabels: Record<AdminRole, string> }) {
  const { data, error, isLoading, mutate } = useSWR(ADMIN_ACCOUNT_KEY, fetcher)
  const account = data?.data

  if (isLoading) {
    return (
      <PageShell className="max-w-3xl">
        <div className="space-y-5" aria-busy="true" aria-label="Chargement">
          <Skeleton className="h-8 w-48" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </PageShell>
    )
  }

  if (error || !account) {
    return (
      <PageShell className="max-w-3xl">
        <ErrorState description={error ? errorMessage(error) : 'Compte indisponible.'} onRetry={() => mutate()} />
      </PageShell>
    )
  }

  return (
    <PageShell className="max-w-3xl">
      <PageIntro title="Mon compte" description="Vos informations, votre mot de passe et la double authentification" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Profil
          </CardTitle>
          <CardDescription>Pour modifier votre nom ou votre rôle, adressez-vous à un super-administrateur.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Nom</dt>
              <dd className="font-medium text-foreground">{account.full_name}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="break-all text-foreground">{account.email}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Rôle</dt>
              <dd className="text-foreground">{roleLabels[account.role] ?? account.role}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-xs text-muted-foreground">Dernière connexion</dt>
              <dd className="tabular text-foreground">
                {account.last_login_at ? formatDateTime(account.last_login_at) : '—'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <ChangePasswordCard />

      <TwoFactorCard enabled={account.totp_enabled} onChange={() => mutate()} />
    </PageShell>
  )
}

/* -------------------------------------------------------------------------- */

function ChangePasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)
    if (!current) return setError('Saisissez votre mot de passe actuel')
    const policy = passwordPolicyError(next)
    if (policy) return setError(policy)
    if (next !== confirm) return setError('Les deux mots de passe ne correspondent pas')

    setSaving(true)
    try {
      await apiFetch('/api/admin/account/password', {
        method: 'POST',
        body: { currentPassword: current, newPassword: next },
      })
      toast.success('Mot de passe modifié', { description: 'Reconnectez-vous avec votre nouveau mot de passe.' })
      // Toutes les sessions ont été invalidées côté serveur : on purge aussi le cookie local
      await signOut({ callbackUrl: '/admin/login' })
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Mot de passe
        </CardTitle>
        <CardDescription>
          Après le changement, toutes vos sessions sont fermées : vous devrez vous reconnecter.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="current-password">Mot de passe actuel</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                disabled={saving}
                className="md:max-w-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Nouveau mot de passe</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                disabled={saving}
                aria-describedby="new-password-help"
              />
              <p id="new-password-help" className="text-xs text-muted-foreground">
                8 caractères minimum, avec au moins une lettre et un chiffre.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirmer</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={saving}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Changer le mot de passe
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */

function TwoFactorCard({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  const [setup, setSetup] = useState<{ otpauthUri: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [disabling, setDisabling] = useState(false)
  const [busy, setBusy] = useState<'setup' | 'enable' | 'disable' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const cleanCode = code.replace(/\s/g, '')

  async function startSetup() {
    if (busy) return
    setBusy('setup')
    setError(null)
    try {
      const json = await apiFetch<{ otpauthUri: string; secret: string }>('/api/admin/account/2fa/setup', { method: 'POST' })
      setSetup(json)
      setCode('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function enable(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!/^\d{6}$/.test(cleanCode)) return setError('Le code doit comporter 6 chiffres')
    setBusy('enable')
    setError(null)
    try {
      await apiFetch('/api/admin/account/2fa/enable', { method: 'POST', body: { code: cleanCode } })
      toast.success('Double authentification activée', {
        description: 'Le code vous sera demandé à chaque connexion.',
      })
      setSetup(null)
      setCode('')
      onChange()
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
    } finally {
      setBusy(null)
    }
  }

  async function disable(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!password) return setError('Saisissez votre mot de passe')
    if (!/^\d{6}$/.test(cleanCode)) return setError('Le code doit comporter 6 chiffres')
    setBusy('disable')
    setError(null)
    try {
      await apiFetch('/api/admin/account/2fa/disable', { method: 'POST', body: { password, code: cleanCode } })
      toast.success('Double authentification désactivée')
      setDisabling(false)
      setPassword('')
      setCode('')
      onChange()
    } catch (err) {
      setError(errorMessage(err))
      setCode('')
    } finally {
      setBusy(null)
    }
  }

  async function copySecret() {
    if (!setup) return
    try {
      await navigator.clipboard.writeText(setup.secret.replace(/\s/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Copie impossible', { description: 'Recopiez la clé manuellement.' })
    }
  }

  const codeInput = (id: string) => (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="[0-9]*"
      maxLength={7}
      placeholder="123456"
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
      disabled={busy !== null}
      className="tabular h-10 w-40 text-center tracking-[0.3em]"
    />
  )

  return (
    <Card id="securite" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Double authentification
          <StatusBadge label={enabled ? 'Activée' : 'Désactivée'} tone={enabled ? 'success' : 'warning'} />
        </CardTitle>
        <CardDescription>
          En plus du mot de passe, un code à 6 chiffres généré par une application d’authentification (Google
          Authenticator, Microsoft Authenticator, Authy…) est demandé à chaque connexion.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        {enabled ? (
          disabling ? (
            <form onSubmit={disable} className="space-y-4" noValidate>
              <p className="text-sm text-muted-foreground">
                Pour désactiver la double authentification, confirmez avec votre mot de passe et un code actuel.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="disable-password">Mot de passe</Label>
                  <Input
                    id="disable-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy !== null}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disable-code">Code de vérification</Label>
                  {codeInput('disable-code')}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDisabling(false)
                    setError(null)
                    setCode('')
                    setPassword('')
                  }}
                  disabled={busy !== null}
                >
                  Annuler
                </Button>
                <Button type="submit" variant="destructive" disabled={busy !== null}>
                  {busy === 'disable' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Désactiver
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Votre compte est protégé par un code à usage unique.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setDisabling(true)
                  setError(null)
                  setCode('')
                }}
              >
                <ShieldOff className="h-4 w-4" aria-hidden="true" /> Désactiver
              </Button>
            </div>
          )
        ) : setup ? (
          <form onSubmit={enable} className="space-y-5" noValidate>
            <ol className="space-y-4 text-sm">
              <li className="space-y-2">
                <p className="font-medium text-foreground">1. Ajoutez le compte dans votre application</p>
                <p className="text-muted-foreground">
                  Sur votre téléphone, ouvrez le lien ci-dessous, ou choisissez « Saisir une clé » dans l’application et
                  recopiez la clé.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href={setup.otpauthUri}>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" /> Ouvrir dans l’application d’authentification
                  </a>
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                  <code
                    className="tabular select-all rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm tracking-wider text-foreground"
                    aria-label="Clé de configuration"
                  >
                    {setup.secret}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={copySecret}
                    aria-label={copied ? 'Clé copiée' : 'Copier la clé'}
                  >
                    {copied ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Type : basé sur le temps · 6 chiffres · 30 secondes. Ne partagez jamais cette clé.
                </p>
              </li>
              <li className="space-y-2">
                <Label htmlFor="enable-code" className="font-medium text-foreground">
                  2. Saisissez le code affiché par l’application
                </Label>
                {codeInput('enable-code')}
              </li>
            </ol>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSetup(null)
                  setError(null)
                  setCode('')
                }}
                disabled={busy !== null}
              >
                Annuler
              </Button>
              <Button type="submit" variant="brand" disabled={busy !== null}>
                {busy === 'enable' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Activer la double authentification
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Fortement recommandé ; indispensable pour un super-administrateur.
            </p>
            <Button variant="brand" onClick={startSetup} disabled={busy !== null}>
              {busy === 'setup' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              Activer
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
