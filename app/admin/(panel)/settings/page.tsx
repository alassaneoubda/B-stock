'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
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
      <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-5" aria-busy="true" aria-label="Chargement">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    )
  }

  if (loadError || !form) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl mx-auto">
        <ErrorState
          description={loadError ? errorMessage(loadError) : 'Les paramètres sont indisponibles.'}
          onRetry={() => mutate()}
        />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
          <p className="text-sm text-muted-foreground">Configuration globale de la plateforme</p>
        </div>
        <Button onClick={requestSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4 mr-1.5" />
          ) : null}
          {saved ? 'Enregistré' : 'Enregistrer'}
        </Button>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Général */}
      <Card className="p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Général</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nom de la plateforme</Label>
            <Input value={form.platform_name} onChange={(e) => set('platform_name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail de support</Label>
            <Input
              type="email"
              value={form.support_email}
              onChange={(e) => set('support_email', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Téléphone de support</Label>
            <Input value={form.support_phone} onChange={(e) => set('support_phone', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Devise par défaut</Label>
            <Input
              value={form.default_currency}
              onChange={(e) => set('default_currency', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Fuseau horaire</Label>
            <Input
              value={form.default_timezone}
              onChange={(e) => set('default_timezone', e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Inscriptions & essai */}
      <Card className="p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Inscriptions & essai</h2>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5 max-w-[200px]">
            <Label>Durée d&apos;essai (jours)</Label>
            <Input
              type="number"
              min={0}
              max={365}
              value={form.trial_days}
              onChange={(e) => set('trial_days', Number(e.target.value))}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Inscriptions ouvertes</p>
              <p className="text-xs text-muted-foreground">Autoriser la création de nouveaux comptes</p>
            </div>
            <Switch
              checked={form.registrations_open}
              onCheckedChange={(v) => set('registrations_open', v)}
            />
          </div>
        </div>
      </Card>

      {/* Fonctionnalités */}
      <Card className="p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Fonctionnalités</h2>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">Connexion Google (OAuth)</p>
            <p className="text-xs text-muted-foreground">Activer l&apos;inscription/connexion via Google</p>
          </div>
          <Switch
            checked={form.google_oauth_enabled}
            onCheckedChange={(v) => set('google_oauth_enabled', v)}
          />
        </div>
      </Card>

      {/* Maintenance */}
      <Card className="p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Maintenance</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Mode maintenance</p>
              <p className="text-xs text-muted-foreground">
                Bloque l&apos;accès des entreprises (les admins restent connectés)
              </p>
            </div>
            <Switch
              checked={form.maintenance_mode}
              onCheckedChange={(v) => set('maintenance_mode', v)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Message de maintenance</Label>
            <Textarea
              rows={2}
              value={form.maintenance_message}
              onChange={(e) => set('maintenance_message', e.target.value)}
            />
          </div>
        </div>
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
              className="bg-destructive hover:bg-destructive"
              onClick={(e) => {
                e.preventDefault()
                save()
              }}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Activer et enregistrer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
