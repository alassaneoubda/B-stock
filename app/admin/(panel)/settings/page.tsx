'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell, PageIntro } from '@/components/app/blocks'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button, buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
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
import { Loader2, Check, Settings as SettingsIcon, ShieldCheck, Wrench, UserPlus } from 'lucide-react'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { ErrorState } from '@/components/states'

const fetcher = (url: string) => apiFetch(url)

type Settings = {
  platform_name: string
  support_email: string
  support_phone: string
  default_currency: string
  default_timezone: string
  trial_days: number
  registrations_open: boolean
  google_oauth_enabled: boolean
  maintenance_mode: boolean
  maintenance_message: string
}

export default function AdminSettingsPage() {
  const { data, error: loadError, isLoading, mutate } = useSWR<{ data: Settings }>('/api/admin/settings', fetcher, {
    // Ne pas écraser une saisie en cours au retour sur l'onglet
    revalidateOnFocus: false,
  })
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [confirmMaintenance, setConfirmMaintenance] = useState(false)

  useEffect(() => {
    if (data?.data) setForm(data.data)
  }, [data])

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
    setSaved(false)
  }

  /** Activer la maintenance coupe l'accès de toutes les entreprises : confirmation explicite. */
  function requestSave() {
    if (!form || saving) return
    if (form.maintenance_mode && !data?.data?.maintenance_mode) {
      setConfirmMaintenance(true)
      return
    }
    save()
  }

  async function save() {
    if (!form || saving) return
    setSaving(true)
    setError('')
    try {
      await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: { ...form, trial_days: Number(form.trial_days) },
      })
      toast.success('Paramètres enregistrés')
      setConfirmMaintenance(false)
      mutate()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setConfirmMaintenance(false)
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <PageShell className="max-w-3xl">
        <div className="space-y-5" aria-busy="true" aria-label="Chargement">
          <Skeleton className="h-8 w-48" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </PageShell>
    )
  }

  if (loadError || !form) {
    return (
      <PageShell className="max-w-3xl">
        <ErrorState
          description={loadError ? errorMessage(loadError) : 'Les paramètres sont indisponibles.'}
          onRetry={() => mutate()}
        />
      </PageShell>
    )
  }

  return (
    <PageShell className="max-w-3xl">
      <PageIntro
        title="Paramètres"
        description="Configuration globale de la plateforme"
        actions={
          <Button variant="brand" onClick={requestSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : saved ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : null}
            {saved ? 'Enregistré' : 'Enregistrer'}
          </Button>
        }
      />

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Général */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Général
          </CardTitle>
          <CardDescription>Identité de la plateforme et coordonnées du support.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="platform_name">Nom de la plateforme</Label>
            <Input id="platform_name" value={form.platform_name} onChange={(e) => set('platform_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="support_email">E-mail de support</Label>
            <Input
              id="support_email"
              type="email"
              value={form.support_email}
              onChange={(e) => set('support_email', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="support_phone">Téléphone de support</Label>
            <Input id="support_phone" value={form.support_phone} onChange={(e) => set('support_phone', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default_currency">Devise par défaut</Label>
            <Input
              id="default_currency"
              value={form.default_currency}
              onChange={(e) => set('default_currency', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="default_timezone">Fuseau horaire</Label>
            <Input
              id="default_timezone"
              value={form.default_timezone}
              onChange={(e) => set('default_timezone', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Inscriptions & essai */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Inscriptions et essai
          </CardTitle>
          <CardDescription>Ouverture des inscriptions et durée de la période d’essai.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-[200px] space-y-1.5">
            <Label htmlFor="trial_days">Durée d’essai (jours)</Label>
            <Input
              id="trial_days"
              type="number"
              min={0}
              max={365}
              className="tabular"
              value={form.trial_days}
              onChange={(e) => set('trial_days', Number(e.target.value))}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
            <div>
              <p id="registrations_open_label" className="text-sm font-medium text-foreground">Inscriptions ouvertes</p>
              <p className="text-xs text-muted-foreground">Autoriser la création de nouveaux comptes</p>
            </div>
            <Switch
              aria-labelledby="registrations_open_label"
              checked={form.registrations_open}
              onCheckedChange={(v) => set('registrations_open', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Fonctionnalités */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Fonctionnalités
          </CardTitle>
          <CardDescription>Méthodes de connexion proposées aux utilisateurs.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
            <div>
              <p id="google_oauth_label" className="text-sm font-medium text-foreground">Connexion Google (OAuth)</p>
              <p className="text-xs text-muted-foreground">Activer l’inscription et la connexion via Google</p>
            </div>
            <Switch
              aria-labelledby="google_oauth_label"
              checked={form.google_oauth_enabled}
              onCheckedChange={(v) => set('google_oauth_enabled', v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Maintenance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Maintenance
          </CardTitle>
          <CardDescription>Suspendre temporairement l’accès des entreprises.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors ${
              form.maintenance_mode ? 'border-destructive/30 bg-destructive/5' : 'border-border'
            }`}
          >
            <div>
              <p id="maintenance_mode_label" className="text-sm font-medium text-foreground">Mode maintenance</p>
              <p className="text-xs text-muted-foreground">
                Bloque l’accès des entreprises (les admins restent connectés)
              </p>
            </div>
            <Switch
              aria-labelledby="maintenance_mode_label"
              checked={form.maintenance_mode}
              onCheckedChange={(v) => set('maintenance_mode', v)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maintenance_message">Message de maintenance</Label>
            <Textarea
              id="maintenance_message"
              rows={2}
              value={form.maintenance_message}
              onChange={(e) => set('maintenance_message', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmMaintenance} onOpenChange={(o) => !saving && setConfirmMaintenance(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activer le mode maintenance ?</AlertDialogTitle>
            <AlertDialogDescription>
              Toutes les entreprises perdront immédiatement l’accès à l’application et verront le message de
              maintenance, jusqu’à ce que vous le désactiviez. Les administrateurs restent connectés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              className={buttonVariants({ variant: 'destructive' })}
              onClick={(e) => {
                e.preventDefault()
                save()
              }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Activer et enregistrer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
