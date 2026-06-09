'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Check, Settings as SettingsIcon, ShieldCheck, Wrench, UserPlus } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

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
  const { data, isLoading, mutate } = useSWR<{ data: Settings }>('/api/admin/settings', fetcher)
  const [form, setForm] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (data?.data) setForm(data.data)
  }, [data])

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
    setSaved(false)
  }

  async function save() {
    if (!form) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, trial_days: Number(form.trial_days) }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Erreur')
        return
      }
      mutate()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">Paramètres</h1>
          <p className="text-sm text-zinc-500">Configuration globale de la plateforme</p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : saved ? (
            <Check className="h-4 w-4 mr-1.5" />
          ) : null}
          {saved ? 'Enregistré' : 'Enregistrer'}
        </Button>
      </header>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {/* Général */}
      <Card className="p-6 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon className="h-4 w-4 text-zinc-500" />
          <h2 className="font-semibold text-zinc-900">Général</h2>
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
          <UserPlus className="h-4 w-4 text-zinc-500" />
          <h2 className="font-semibold text-zinc-900">Inscriptions & essai</h2>
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
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Inscriptions ouvertes</p>
              <p className="text-xs text-zinc-500">Autoriser la création de nouveaux comptes</p>
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
          <ShieldCheck className="h-4 w-4 text-zinc-500" />
          <h2 className="font-semibold text-zinc-900">Fonctionnalités</h2>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Connexion Google (OAuth)</p>
            <p className="text-xs text-zinc-500">Activer l&apos;inscription/connexion via Google</p>
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
          <Wrench className="h-4 w-4 text-zinc-500" />
          <h2 className="font-semibold text-zinc-900">Maintenance</h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Mode maintenance</p>
              <p className="text-xs text-zinc-500">
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
    </div>
  )
}
