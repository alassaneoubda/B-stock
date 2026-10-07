'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Loader2, Save, Trash2, Plus, Newspaper } from 'lucide-react'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { EmptyState, ErrorState } from '@/components/states'

type Section = {
  section_key: string
  title: string | null
  subtitle: string | null
  body: string | null
  cta_primary_label: string | null
  image_url: string | null
  is_published: boolean
}

type Faq = {
  id: string
  question: string
  answer: string
  is_published: boolean
  sort_order: number
}

type Testimonial = {
  id: string
  author_name: string
  author_role: string | null
  company_name: string | null
  quote: string
  rating: number
  is_published: boolean
}

type Feature = {
  id: string
  slug: string
  title: string
  description: string | null
  highlight: string | null
  is_published: boolean
}

type Tab = 'sections' | 'features' | 'faq' | 'testimonials'

/** Suppression en attente de confirmation (payload envoyé tel quel à PATCH /api/admin/cms). */
type PendingDelete = { kind: string; label: string; body: Record<string, unknown> }

export default function AdminCmsPage() {
  const [tab, setTab] = useState<Tab>('sections')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const [sections, setSections] = useState<Section[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [faq, setFaq] = useState<Faq[]>([])
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])

  /** `silent` : rechargement après enregistrement, sans remplacer la page par le squelette. */
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const json = await apiFetch<{
        data: { sections?: Section[]; features?: Feature[]; faq?: Faq[]; testimonials?: Testimonial[] }
      }>('/api/admin/cms')
      setSections(json.data.sections || [])
      setFeatures(json.data.features || [])
      setFaq(json.data.faq || [])
      setTestimonials(json.data.testimonials || [])
      setLoadError(null)
    } catch (e) {
      if (silent) toastError(e, 'Rechargement impossible')
      else setLoadError(errorMessage(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  /** Retourne true si l'enregistrement a réussi. */
  async function patch(body: Record<string, unknown>, success = 'Modifications enregistrées'): Promise<boolean> {
    if (saving) return false
    setSaving(true)
    try {
      await apiFetch('/api/admin/cms', { method: 'PATCH', body })
      toast.success(success)
      await load(true)
      return true
    } catch (e) {
      toastError(e, 'Enregistrement impossible')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    await patch(pendingDelete.body, `${pendingDelete.kind} supprimé(e)`)
    setPendingDelete(null)
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'sections', label: 'Sections' },
    { id: 'features', label: 'Fonctionnalités' },
    { id: 'faq', label: 'FAQ' },
    { id: 'testimonials', label: 'Témoignages' },
  ]

  if (loading) {
    return (
      <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6" aria-busy="true" aria-label="Chargement du CMS">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-80" />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        <ErrorState description={loadError} onRetry={() => load()} />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">CMS Landing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Modifiez les textes, FAQ et témoignages affichés sur la page d’accueil — sans toucher au code.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-primary text-white'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sections' && (
        <div className="space-y-4">
          {sections.length === 0 && <EmptyState icon={Newspaper} title="Aucune section configurée" />}
          {sections.map((s) => (
            <form
              key={s.section_key}
              className="rounded-xl border border-border bg-card p-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                patch({
                  type: 'section',
                  section_key: s.section_key,
                  title: String(fd.get('title') || '') || null,
                  subtitle: String(fd.get('subtitle') || '') || null,
                  body: String(fd.get('body') || '') || null,
                  cta_primary_label: String(fd.get('cta_primary_label') || '') || null,
                  image_url: String(fd.get('image_url') || '') || null,
                  is_published: fd.get('is_published') === 'on',
                })
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-foreground">{s.section_key}</h2>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    name="is_published"
                    defaultChecked={s.is_published}
                  />
                  Publié
                </label>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Titre</Label>
                  <Input name="title" defaultValue={s.title || ''} />
                </div>
                <div>
                  <Label>CTA primaire</Label>
                  <Input name="cta_primary_label" defaultValue={s.cta_primary_label || ''} />
                </div>
              </div>
              <div>
                <Label>Sous-titre</Label>
                <Input name="subtitle" defaultValue={s.subtitle || ''} />
              </div>
              <div>
                <Label>Corps</Label>
                <textarea
                  name="body"
                  defaultValue={s.body || ''}
                  className="w-full min-h-[80px] rounded-md border border-border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <Label>Image URL</Label>
                <Input name="image_url" defaultValue={s.image_url || ''} />
              </div>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Enregistrer
              </Button>
            </form>
          ))}
        </div>
      )}

      {tab === 'features' && (
        <div className="space-y-4">
          {features.length === 0 && <EmptyState icon={Newspaper} title="Aucune fonctionnalité configurée" />}
          {features.map((f) => (
            <form
              key={f.id}
              className="rounded-xl border border-border bg-card p-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                patch({
                  type: 'feature',
                  id: f.id,
                  title: String(fd.get('title')),
                  description: String(fd.get('description') || '') || null,
                  highlight: String(fd.get('highlight') || '') || null,
                  is_published: fd.get('is_published') === 'on',
                })
              }}
            >
              <div className="flex justify-between">
                <span className="text-xs font-mono text-muted-foreground/70">{f.slug}</span>
                <button
                  type="button"
                  className="text-destructive text-xs flex items-center gap-1 disabled:opacity-50"
                  disabled={saving}
                  onClick={() =>
                    setPendingDelete({
                      kind: 'Fonctionnalité',
                      label: f.title,
                      body: { type: 'feature', id: f.id, title: f.title, delete: true },
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </button>
              </div>
              <Input name="title" defaultValue={f.title} required />
              <textarea
                name="description"
                defaultValue={f.description || ''}
                className="w-full min-h-[60px] rounded-md border border-border px-3 py-2 text-sm"
              />
              <Input name="highlight" defaultValue={f.highlight || ''} placeholder="Highlight" />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="is_published" defaultChecked={f.is_published} />
                Publié
              </label>
              <Button type="submit" disabled={saving} size="sm">
                Enregistrer
              </Button>
            </form>
          ))}
        </div>
      )}

      {tab === 'faq' && (
        <div className="space-y-4">
          {faq.map((item) => (
            <form
              key={item.id}
              className="rounded-xl border border-border bg-card p-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                patch({
                  type: 'faq',
                  id: item.id,
                  question: String(fd.get('question')),
                  answer: String(fd.get('answer')),
                  is_published: fd.get('is_published') === 'on',
                })
              }}
            >
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-destructive text-xs flex items-center gap-1 disabled:opacity-50"
                  disabled={saving}
                  onClick={() =>
                    setPendingDelete({
                      kind: 'Question',
                      label: item.question,
                      body: {
                        type: 'faq',
                        id: item.id,
                        question: item.question,
                        answer: item.answer,
                        delete: true,
                      },
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </button>
              </div>
              <Input name="question" defaultValue={item.question} required />
              <textarea
                name="answer"
                defaultValue={item.answer}
                required
                className="w-full min-h-[80px] rounded-md border border-border px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="is_published" defaultChecked={item.is_published} />
                Publié
              </label>
              <Button type="submit" disabled={saving} size="sm">
                Enregistrer
              </Button>
            </form>
          ))}

          <form
            className="rounded-xl border border-dashed border-border bg-muted/50 p-5 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              const formEl = e.currentTarget
              const fd = new FormData(formEl)
              const ok = await patch(
                {
                  type: 'faq',
                  question: String(fd.get('question')),
                  answer: String(fd.get('answer')),
                },
                'Question ajoutée'
              )
              if (ok) formEl.reset()
            }}
          >
            <p className="text-sm font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nouvelle FAQ
            </p>
            <Input name="question" placeholder="Question" required />
            <textarea
              name="answer"
              placeholder="Réponse"
              required
              className="w-full min-h-[60px] rounded-md border border-border px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={saving} size="sm">
              Ajouter
            </Button>
          </form>
        </div>
      )}

      {tab === 'testimonials' && (
        <div className="space-y-4">
          {testimonials.map((t) => (
            <form
              key={t.id}
              className="rounded-xl border border-border bg-card p-5 space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                patch({
                  type: 'testimonial',
                  id: t.id,
                  author_name: String(fd.get('author_name')),
                  author_role: String(fd.get('author_role') || '') || null,
                  company_name: String(fd.get('company_name') || '') || null,
                  quote: String(fd.get('quote')),
                  rating: Number(fd.get('rating') || 5),
                  is_published: fd.get('is_published') === 'on',
                })
              }}
            >
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-destructive text-xs flex items-center gap-1 disabled:opacity-50"
                  disabled={saving}
                  onClick={() =>
                    setPendingDelete({
                      kind: 'Témoignage',
                      label: t.author_name,
                      body: {
                        type: 'testimonial',
                        id: t.id,
                        author_name: t.author_name,
                        quote: t.quote,
                        delete: true,
                      },
                    })
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <Input name="author_name" defaultValue={t.author_name} required />
                <Input name="author_role" defaultValue={t.author_role || ''} placeholder="Rôle" />
                <Input
                  name="company_name"
                  defaultValue={t.company_name || ''}
                  placeholder="Entreprise"
                />
              </div>
              <textarea
                name="quote"
                defaultValue={t.quote}
                required
                className="w-full min-h-[80px] rounded-md border border-border px-3 py-2 text-sm"
              />
              <Input name="rating" type="number" min={1} max={5} defaultValue={t.rating} />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="is_published" defaultChecked={t.is_published} />
                Publié
              </label>
              <Button type="submit" disabled={saving} size="sm">
                Enregistrer
              </Button>
            </form>
          ))}

          <form
            className="rounded-xl border border-dashed border-border bg-muted/50 p-5 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              const formEl = e.currentTarget
              const fd = new FormData(formEl)
              const ok = await patch(
                {
                  type: 'testimonial',
                  author_name: String(fd.get('author_name')),
                  author_role: String(fd.get('author_role') || '') || null,
                  company_name: String(fd.get('company_name') || '') || null,
                  quote: String(fd.get('quote')),
                },
                'Témoignage ajouté'
              )
              if (ok) formEl.reset()
            }}
          >
            <p className="text-sm font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nouveau témoignage
            </p>
            <Input name="author_name" placeholder="Nom" required />
            <Input name="author_role" placeholder="Rôle" />
            <Input name="company_name" placeholder="Entreprise" />
            <textarea
              name="quote"
              placeholder="Citation"
              required
              className="w-full min-h-[60px] rounded-md border border-border px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={saving} size="sm">
              Ajouter
            </Button>
          </form>
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && !saving && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer {pendingDelete?.kind.toLowerCase()} « {pendingDelete?.label} » ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              L’élément sera retiré immédiatement de la page d’accueil publique. Cette action est irréversible :
              pour le masquer temporairement, décochez plutôt « Publié ».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              className="bg-destructive hover:bg-destructive"
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
