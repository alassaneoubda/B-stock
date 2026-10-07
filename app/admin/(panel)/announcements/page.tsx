'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatNumber } from '@/lib/format'
import { PageShell, PageIntro, StatusBadge } from '@/components/app/blocks'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

const fetcher = (url: string) => apiFetch(url)

const STATUS_LABELS: Record<string, string> = {
  trialing: 'Période d\u2019essai',
  active: 'Actif',
  past_due: 'Impayé',
  canceled: 'Résilié',
}

/** ISO (UTC) → valeur d'un <input type="datetime-local"> en heure locale. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Valeur datetime-local (heure locale) → ISO avec fuseau, pour le serveur. */
function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

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

const levelMeta: Record<
  string,
  { label: string; variant: 'info' | 'success' | 'warning' | 'danger'; icon: React.ElementType }
> = {
  info: { label: 'Info', variant: 'info', icon: Info },
  success: { label: 'Succès', variant: 'success', icon: CheckCircle2 },
  warning: { label: 'Avertissement', variant: 'warning', icon: AlertTriangle },
  critical: { label: 'Critique', variant: 'danger', icon: AlertOctagon },
}

const audienceLabel = (a: Announcement) => {
  if (a.audience === 'all') return 'Toutes les entreprises'
  if (a.audience === 'company') return a.company_name ? `Entreprise : ${a.company_name}` : 'Entreprise ciblée'
  if (a.audience === 'status') return `Statut : ${STATUS_LABELS[a.target_status || ''] || a.target_status}`
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
  const { data, error: loadError, isLoading, mutate } = useSWR<{ data: Announcement[] }>(
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
  const [toDelete, setToDelete] = useState<Announcement | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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
      starts_at: toLocalInput(a.starts_at),
      ends_at: toLocalInput(a.ends_at),
    })
    setError('')
    setOpen(true)
  }

  async function save() {
    if (saving) return
    setError('')
    if (!editing && form.audience === 'company' && !form.target_company_id) {
      setError('Sélectionnez l\u2019entreprise ciblée.')
      return
    }
    if (form.starts_at && form.ends_at && new Date(form.ends_at) <= new Date(form.starts_at)) {
      setError('La date de fin doit être postérieure à la date de début.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        body: form.body,
        level: form.level,
        dismissible: form.dismissible,
        is_active: form.is_active,
        starts_at: fromLocalInput(form.starts_at),
        ends_at: fromLocalInput(form.ends_at),
        ...(editing
          ? {}
          : {
              audience: form.audience,
              target_company_id: form.audience === 'company' ? form.target_company_id : null,
              target_status: form.audience === 'status' ? form.target_status : null,
            }),
      }
      const url = editing ? `/api/admin/announcements/${editing.id}` : '/api/admin/announcements'
      await apiFetch(url, { method: editing ? 'PATCH' : 'POST', body: payload })
      toast.success(editing ? 'Annonce mise à jour' : 'Annonce créée')
      setOpen(false)
      mutate()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(a: Announcement) {
    if (busyId) return
    setBusyId(a.id)
    try {
      await apiFetch(`/api/admin/announcements/${a.id}`, {
        method: 'PATCH',
        body: { is_active: !a.is_active },
      })
      toast.success(a.is_active ? 'Annonce désactivée' : 'Annonce activée')
      await mutate()
    } catch (e) {
      toastError(e, 'Modification impossible')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(a: Announcement) {
    if (busyId) return
    setBusyId(a.id)
    try {
      await apiFetch(`/api/admin/announcements/${a.id}`, { method: 'DELETE' })
      toast.success('Annonce supprimée')
      setToDelete(null)
      await mutate()
    } catch (e) {
      setToDelete(null)
      toastError(e, 'Suppression impossible')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <PageShell>
      <PageIntro
        title="Annonces"
        description={`Bannières in-app diffusées aux entreprises (${items.length})`}
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouvelle annonce
          </Button>
        }
      />

      <Card className="gap-0 overflow-hidden py-0">
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton columns={6} />
          </div>
        ) : loadError ? (
          <ErrorState className="m-5" description={errorMessage(loadError)} onRetry={() => mutate()} />
        ) : items.length === 0 ? (
          <EmptyState
            className="m-5"
            icon={Megaphone}
            title="Aucune annonce pour le moment"
            action={{ label: 'Nouvelle annonce', onClick: openCreate }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Annonce</th>
                  <th className="px-5 py-3 font-medium">Niveau</th>
                  <th className="px-5 py-3 font-medium">Audience</th>
                  <th className="px-5 py-3 font-medium">Statut</th>
                  <th className="px-5 py-3 text-right font-medium">Fermetures</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((a) => {
                  const meta = levelMeta[a.level] || levelMeta.info
                  const Icon = meta.icon
                  return (
                    <tr key={a.id} className="border-b border-border align-top transition-colors last:border-0 hover:bg-muted/50">
                      <td className="px-5 py-3 max-w-md">
                        <p className="font-medium text-foreground">{a.title}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={meta.variant} className="gap-1">
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{audienceLabel(a)}</td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => toggleActive(a)}
                          disabled={!!busyId}
                          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                          aria-label={a.is_active ? `Désactiver l\u2019annonce « ${a.title} »` : `Activer l\u2019annonce « ${a.title} »`}
                        >
                          <StatusBadge label={a.is_active ? 'Active' : 'Inactive'} tone={a.is_active ? 'success' : 'default'} />
                        </button>
                      </td>
                      <td className="tabular px-5 py-3 text-right text-muted-foreground">{formatNumber(a.dismissals)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(a)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title="Modifier"
                            aria-label={`Modifier l\u2019annonce « ${a.title} »`}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => setToDelete(a)}
                            disabled={!!busyId}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                            title="Supprimer"
                            aria-label={`Supprimer l\u2019annonce « ${a.title} »`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
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

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier l\u2019annonce' : 'Nouvelle annonce'}</DialogTitle>
            <DialogDescription>Bannière affichée en haut de l’application des entreprises ciblées.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ann-title">Titre</Label>
              <Input
                id="ann-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Maintenance planifiée"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ann-body">Message</Label>
              <Textarea
                id="ann-body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Le service sera indisponible dimanche de 2h à 4h."
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ann-level">Niveau</Label>
              <select
                id="ann-level"
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value as Announcement['level'] })}
                className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="info">Info</option>
                <option value="success">Succès</option>
                <option value="warning">Avertissement</option>
                <option value="critical">Critique</option>
              </select>
            </div>

            {!editing && (
              <div className="space-y-1.5">
                <Label htmlFor="ann-audience">Audience</Label>
                <select
                  id="ann-audience"
                  value={form.audience}
                  onChange={(e) =>
                    setForm({ ...form, audience: e.target.value as Announcement['audience'] })
                  }
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">Toutes les entreprises</option>
                  <option value="company">Une entreprise spécifique</option>
                  <option value="status">Par statut d&apos;abonnement</option>
                </select>
              </div>
            )}

            {!editing && form.audience === 'company' && (
              <div className="space-y-1.5">
                <Label htmlFor="ann-company">Entreprise</Label>
                <Input
                  id="ann-company"
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="Rechercher une entreprise…"
                  className="mb-1.5"
                />
                <select
                  aria-label="Entreprise ciblée"
                  value={form.target_company_id}
                  onChange={(e) => setForm({ ...form, target_company_id: e.target.value })}
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                <Label htmlFor="ann-status">Statut d’abonnement</Label>
                <select
                  id="ann-status"
                  value={form.target_status}
                  onChange={(e) => setForm({ ...form, target_status: e.target.value })}
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="trialing">Période d&apos;essai</option>
                  <option value="active">Actif</option>
                  <option value="past_due">Impayé</option>
                  <option value="canceled">Résilié</option>
                </select>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ann-start">Début (optionnel)</Label>
                <Input
                  id="ann-start"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-end">Fin (optionnel)</Label>
                <Input
                  id="ann-end"
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
              <div>
                <p id="ann-dismissible" className="text-sm font-medium text-foreground">Fermable par l’utilisateur</p>
                <p className="text-xs text-muted-foreground">L&apos;utilisateur peut masquer l&apos;annonce</p>
              </div>
              <Switch
                aria-labelledby="ann-dismissible"
                checked={form.dismissible}
                onCheckedChange={(v) => setForm({ ...form, dismissible: v })}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
              <div>
                <p id="ann-active" className="text-sm font-medium text-foreground">Active</p>
                <p className="text-xs text-muted-foreground">Diffusée immédiatement aux entreprises</p>
              </div>
              <Switch
                aria-labelledby="ann-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={save} disabled={saving || !form.title || !form.body}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {editing ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && !busyId && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l&apos;annonce « {toDelete?.title} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              La bannière disparaîtra immédiatement pour toutes les entreprises ciblées, et son historique de
              fermetures sera perdu. Cette action est irréversible : pour la masquer temporairement,
              désactivez-la plutôt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busyId}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!busyId}
              className={buttonVariants({ variant: 'destructive' })}
              onClick={(e) => {
                e.preventDefault()
                if (toDelete) remove(toDelete)
              }}
            >
              {busyId && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
