'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Loader2,
  Plus,
  Megaphone,
  Trash2,
  Pencil,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
} from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Announcement = {
  id: string
  title: string
  body: string
  level: 'info' | 'success' | 'warning' | 'critical'
  audience: 'all' | 'company' | 'status'
  target_company_id: string | null
  company_name: string | null
  target_status: string | null
  dismissible: boolean
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  dismissals: number
  created_at: string
}

type Company = { id: string; name: string }

const levelMeta: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  info: { label: 'Info', cls: 'bg-blue-100 text-blue-700', icon: Info },
  success: { label: 'Succès', cls: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  warning: { label: 'Avertissement', cls: 'bg-amber-100 text-amber-800', icon: AlertTriangle },
  critical: { label: 'Critique', cls: 'bg-red-100 text-red-700', icon: AlertOctagon },
}

const audienceLabel = (a: Announcement) => {
  if (a.audience === 'all') return 'Toutes les entreprises'
  if (a.audience === 'company') return a.company_name ? `Entreprise : ${a.company_name}` : 'Entreprise ciblée'
  if (a.audience === 'status') return `Statut : ${a.target_status}`
  return a.audience
}

const emptyForm = {
  title: '',
  body: '',
  level: 'info' as Announcement['level'],
  audience: 'all' as Announcement['audience'],
  target_company_id: '',
  target_status: 'trialing',
  dismissible: true,
  is_active: true,
  starts_at: '',
  ends_at: '',
}

export default function AdminAnnouncementsPage() {
  const { data, isLoading, mutate } = useSWR<{ data: Announcement[] }>(
    '/api/admin/announcements',
    fetcher
  )
  const items = data?.data || []

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [companySearch, setCompanySearch] = useState('')

  const { data: companiesData } = useSWR<{ data: Company[] }>(
    open && form.audience === 'company'
      ? `/api/admin/companies?search=${encodeURIComponent(companySearch)}`
      : null,
    fetcher
  )
  const companies = companiesData?.data || []

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError('')
    setOpen(true)
  }

  function openEdit(a: Announcement) {
    setEditing(a)
    setForm({
      title: a.title,
      body: a.body,
      level: a.level,
      audience: a.audience,
      target_company_id: a.target_company_id || '',
      target_status: a.target_status || 'trialing',
      dismissible: a.dismissible,
      is_active: a.is_active,
      starts_at: a.starts_at ? a.starts_at.slice(0, 16) : '',
      ends_at: a.ends_at ? a.ends_at.slice(0, 16) : '',
    })
    setError('')
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const payload = {
        title: form.title,
        body: form.body,
        level: form.level,
        dismissible: form.dismissible,
        is_active: form.is_active,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        ...(editing
          ? {}
          : {
              audience: form.audience,
              target_company_id: form.audience === 'company' ? form.target_company_id : null,
              target_status: form.audience === 'status' ? form.target_status : null,
            }),
      }
      const url = editing ? `/api/admin/announcements/${editing.id}` : '/api/admin/announcements'
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Erreur')
        return
      }
      setOpen(false)
      mutate()
    } catch {
      setError('Erreur réseau')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(a: Announcement) {
    await fetch(`/api/admin/announcements/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !a.is_active }),
    })
    mutate()
  }

  async function remove(a: Announcement) {
    if (!confirm(`Supprimer l'annonce « ${a.title} » ?`)) return
    await fetch(`/api/admin/announcements/${a.id}`, { method: 'DELETE' })
    mutate()
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">Annonces</h1>
          <p className="text-sm text-zinc-500">
            Bannières in-app diffusées aux entreprises ({items.length})
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nouvelle annonce
        </Button>
      </header>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center">
            <Megaphone className="h-10 w-10 mx-auto text-zinc-300 mb-3" />
            <p className="text-sm text-zinc-400">Aucune annonce pour le moment</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Annonce</th>
                  <th className="px-5 py-3 font-medium">Niveau</th>
                  <th className="px-5 py-3 font-medium">Audience</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 font-medium">Fermetures</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const meta = levelMeta[a.level] || levelMeta.info
                  const Icon = meta.icon
                  return (
                    <tr key={a.id} className="border-b border-zinc-50 hover:bg-zinc-50 align-top">
                      <td className="px-5 py-3 max-w-md">
                        <p className="font-medium text-zinc-900">{a.title}</p>
                        <p className="text-zinc-500 text-xs line-clamp-2">{a.body}</p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge className={`${meta.cls} hover:${meta.cls} gap-1`}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-zinc-600">{audienceLabel(a)}</td>
                      <td className="px-5 py-3">
                        <button onClick={() => toggleActive(a)}>
                          <Badge
                            className={
                              a.is_active
                                ? 'bg-green-100 text-green-700 hover:bg-green-100'
                                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-100'
                            }
                          >
                            {a.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </button>
                      </td>
                      <td className="px-5 py-3 text-zinc-500">{a.dismissals}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(a)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-zinc-100 text-zinc-500"
                            title="Modifier"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => remove(a)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-500"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier l\u2019annonce' : 'Nouvelle annonce'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Titre</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Maintenance planifiée"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Le service sera indisponible dimanche de 2h à 4h."
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Niveau</Label>
              <select
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value as Announcement['level'] })}
                className="w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
              >
                <option value="info">Info</option>
                <option value="success">Succès</option>
                <option value="warning">Avertissement</option>
                <option value="critical">Critique</option>
              </select>
            </div>

            {!editing && (
              <div className="space-y-1.5">
                <Label>Audience</Label>
                <select
                  value={form.audience}
                  onChange={(e) =>
                    setForm({ ...form, audience: e.target.value as Announcement['audience'] })
                  }
                  className="w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                >
                  <option value="all">Toutes les entreprises</option>
                  <option value="company">Une entreprise spécifique</option>
                  <option value="status">Par statut d&apos;abonnement</option>
                </select>
              </div>
            )}

            {!editing && form.audience === 'company' && (
              <div className="space-y-1.5">
                <Label>Entreprise</Label>
                <Input
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="Rechercher une entreprise…"
                  className="mb-1.5"
                />
                <select
                  value={form.target_company_id}
                  onChange={(e) => setForm({ ...form, target_company_id: e.target.value })}
                  className="w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                >
                  <option value="">— Sélectionner —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!editing && form.audience === 'status' && (
              <div className="space-y-1.5">
                <Label>Statut d&apos;abonnement</Label>
                <select
                  value={form.target_status}
                  onChange={(e) => setForm({ ...form, target_status: e.target.value })}
                  className="w-full h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm"
                >
                  <option value="trialing">Période d&apos;essai</option>
                  <option value="active">Actif</option>
                  <option value="past_due">Impayé</option>
                  <option value="canceled">Résilié</option>
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Début (optionnel)</Label>
                <Input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fin (optionnel)</Label>
                <Input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Fermable par l&apos;utilisateur</p>
                <p className="text-xs text-zinc-500">L&apos;utilisateur peut masquer l&apos;annonce</p>
              </div>
              <Switch
                checked={form.dismissible}
                onCheckedChange={(v) => setForm({ ...form, dismissible: v })}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-zinc-500">Diffusée immédiatement aux entreprises</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving || !form.title || !form.body}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
