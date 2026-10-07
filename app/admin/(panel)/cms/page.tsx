'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { Loader2, Save, Trash2, Plus, Newspaper, Eye, Send, EyeOff } from 'lucide-react'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { EmptyState, ErrorState } from '@/components/states'
import { PageShell, PageIntro, StatusBadge } from '@/components/app/blocks'

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
type Entity = 'section' | 'feature' | 'faq' | 'testimonial'

/** Le formulaire a-t-il été soumis par le bouton « … et publier » ? */
function wantsPublish(e: React.FormEvent<HTMLFormElement>): boolean {
  const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
  return submitter?.value === 'publish'
}

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

  async function togglePublish(entity: Entity, id: string, published: boolean) {
    await patch({ type: 'publish', entity, id, published }, published ? 'Élément publié' : 'Élément dépublié (brouillon)')
  }

  async function publishAll() {
    await patch({ type: 'publish_all' }, 'Tous les brouillons sont publiés')
  }

  const draftCount =
    sections.filter((x) => !x.is_published).length +
    features.filter((x) => !x.is_published).length +
    faq.filter((x) => !x.is_published).length +
    testimonials.filter((x) => !x.is_published).length

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
      <PageShell className="max-w-5xl">
        <div className="space-y-6" aria-busy="true" aria-label="Chargement du CMS">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-80" />
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </PageShell>
    )
  }

  if (loadError) {
    return (
      <PageShell className="max-w-5xl">
        <ErrorState description={loadError} onRetry={() => load()} />
      </PageShell>
    )
  }

  return (
    <PageShell className="max-w-5xl">
      <PageIntro
        title="CMS landing"
        description="Modifiez les textes, FAQ et témoignages de la page d’accueil. Les modifications sont enregistrées en brouillon : elles ne sont visibles du public qu’une fois publiées."
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/preview/landing" target="_blank" rel="noopener noreferrer">
                <Eye className="h-4 w-4" aria-hidden="true" />
                Aperçu
                <span className="sr-only"> (s’ouvre dans un nouvel onglet)</span>
              </a>
            </Button>
            <Button variant="brand" onClick={publishAll} disabled={saving || draftCount === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              Tout publier{draftCount > 0 ? ` (${draftCount})` : ''}
            </Button>
          </>
        }
      />

      {draftCount > 0 && (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-2.5 text-sm text-warning-foreground">
          {draftCount === 1 ? '1 élément en brouillon, non visible' : `${draftCount} éléments en brouillon, non visibles`} sur la page
          publique. Vérifiez l’aperçu puis publiez.
        </p>
      )}

      <div
        role="tablist"
        aria-label="Contenus de la landing"
        className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/60 p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              tab === t.id
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
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
              className={CARD}
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
                  publish: wantsPublish(e),
                })
              }}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <h2 className="font-mono text-sm font-semibold text-foreground">{s.section_key}</h2>
                <PublishControl published={s.is_published} disabled={saving} label={s.section_key} onToggle={() => togglePublish('section', s.section_key, !s.is_published)} />
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${s.section_key}-title`}>Titre</Label>
                  <Input id={`${s.section_key}-title`} name="title" defaultValue={s.title || ''} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${s.section_key}-cta`}>Bouton principal</Label>
                  <Input id={`${s.section_key}-cta`} name="cta_primary_label" defaultValue={s.cta_primary_label || ''} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor={`${s.section_key}-subtitle`}>Sous-titre</Label>
                  <Input id={`${s.section_key}-subtitle`} name="subtitle" defaultValue={s.subtitle || ''} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor={`${s.section_key}-body`}>Corps</Label>
                  <textarea
                    id={`${s.section_key}-body`}
                    name="body"
                    defaultValue={s.body || ''}
                    className={`${TEXTAREA} min-h-[80px]`}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor={`${s.section_key}-image`}>URL de l’image</Label>
                  <Input id={`${s.section_key}-image`} name="image_url" defaultValue={s.image_url || ''} />
                </div>
              </div>
              <div className="flex justify-end border-t border-border px-5 py-3">
                <SaveButtons saving={saving} />
              </div>
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
              className={CARD}
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                patch({
                  type: 'feature',
                  id: f.id,
                  title: String(fd.get('title')),
                  description: String(fd.get('description') || '') || null,
                  highlight: String(fd.get('highlight') || '') || null,
                  publish: wantsPublish(e),
                })
              }}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <span className="font-mono text-xs text-muted-foreground">{f.slug}</span>
                <PublishControl published={f.is_published} disabled={saving} label={f.title} onToggle={() => togglePublish('feature', f.id, !f.is_published)} />
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`feature-${f.id}-title`}>Titre</Label>
                  <Input id={`feature-${f.id}-title`} name="title" defaultValue={f.title} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`feature-${f.id}-highlight`}>Mise en avant</Label>
                  <Input id={`feature-${f.id}-highlight`} name="highlight" defaultValue={f.highlight || ''} placeholder="Highlight" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor={`feature-${f.id}-description`}>Description</Label>
                  <textarea
                    id={`feature-${f.id}-description`}
                    name="description"
                    defaultValue={f.description || ''}
                    className={`${TEXTAREA} min-h-[60px]`}
                  />
                </div>
              </div>
              <ItemFooter
                saving={saving}
                onDelete={() =>
                  setPendingDelete({
                    kind: 'Fonctionnalité',
                    label: f.title,
                    body: { type: 'feature', id: f.id, title: f.title, delete: true },
                  })
                }
                deleteLabel={`Supprimer la fonctionnalité « ${f.title} »`}
              />
            </form>
          ))}
        </div>
      )}

      {tab === 'faq' && (
        <div className="space-y-4">
          {faq.map((item) => (
            <form
              key={item.id}
              className={CARD}
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                patch({
                  type: 'faq',
                  id: item.id,
                  question: String(fd.get('question')),
                  answer: String(fd.get('answer')),
                  publish: wantsPublish(e),
                })
              }}
            >
              <div className="space-y-4 p-5">
                <div className="flex items-end justify-between gap-3">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={`faq-${item.id}-question`}>Question</Label>
                    <Input id={`faq-${item.id}-question`} name="question" defaultValue={item.question} required />
                  </div>
                  <div className="pb-2">
                    <PublishControl published={item.is_published} disabled={saving} label={item.question} onToggle={() => togglePublish('faq', item.id, !item.is_published)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`faq-${item.id}-answer`}>Réponse</Label>
                  <textarea
                    id={`faq-${item.id}-answer`}
                    name="answer"
                    defaultValue={item.answer}
                    required
                    className={`${TEXTAREA} min-h-[80px]`}
                  />
                </div>
              </div>
              <ItemFooter
                saving={saving}
                onDelete={() =>
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
                deleteLabel={`Supprimer la question « ${item.question} »`}
              />
            </form>
          ))}

          <form
            className="space-y-4 rounded-xl border border-dashed border-border bg-muted/40 p-5"
            onSubmit={async (e) => {
              e.preventDefault()
              const formEl = e.currentTarget
              const fd = new FormData(formEl)
              const ok = await patch(
                {
                  type: 'faq',
                  question: String(fd.get('question')),
                  answer: String(fd.get('answer')),
                  publish: wantsPublish(e),
                },
                wantsPublish(e) ? 'Question ajoutée et publiée' : 'Question ajoutée en brouillon'
              )
              if (ok) formEl.reset()
            }}
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Plus className="h-4 w-4" aria-hidden="true" /> Nouvelle question
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="faq-new-question">Question</Label>
              <Input id="faq-new-question" name="question" placeholder="Question" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="faq-new-answer">Réponse</Label>
              <textarea
                id="faq-new-answer"
                name="answer"
                placeholder="Réponse"
                required
                className={`${TEXTAREA} min-h-[60px]`}
              />
            </div>
            <div className="flex justify-end">
              <SaveButtons saving={saving} draftLabel="Ajouter en brouillon" publishLabel="Ajouter et publier" />
            </div>
          </form>
        </div>
      )}

      {tab === 'testimonials' && (
        <div className="space-y-4">
          {testimonials.map((t) => (
            <form
              key={t.id}
              className={CARD}
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
                  publish: wantsPublish(e),
                })
              }}
            >
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <h2 className="text-sm font-semibold text-foreground">{t.author_name}</h2>
                <PublishControl published={t.is_published} disabled={saving} label={t.author_name} onToggle={() => togglePublish('testimonial', t.id, !t.is_published)} />
              </div>
              <div className="grid gap-4 p-5 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`t-${t.id}-name`}>Nom</Label>
                  <Input id={`t-${t.id}-name`} name="author_name" defaultValue={t.author_name} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`t-${t.id}-role`}>Rôle</Label>
                  <Input id={`t-${t.id}-role`} name="author_role" defaultValue={t.author_role || ''} placeholder="Rôle" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`t-${t.id}-company`}>Entreprise</Label>
                  <Input
                    id={`t-${t.id}-company`}
                    name="company_name"
                    defaultValue={t.company_name || ''}
                    placeholder="Entreprise"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-3">
                  <Label htmlFor={`t-${t.id}-quote`}>Citation</Label>
                  <textarea
                    id={`t-${t.id}-quote`}
                    name="quote"
                    defaultValue={t.quote}
                    required
                    className={`${TEXTAREA} min-h-[80px]`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`t-${t.id}-rating`}>Note (1 à 5)</Label>
                  <Input id={`t-${t.id}-rating`} name="rating" type="number" min={1} max={5} className="tabular" defaultValue={t.rating} />
                </div>
              </div>
              <ItemFooter
                saving={saving}
                onDelete={() =>
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
                deleteLabel={`Supprimer le témoignage de ${t.author_name}`}
              />
            </form>
          ))}

          <form
            className="space-y-4 rounded-xl border border-dashed border-border bg-muted/40 p-5"
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
                  publish: wantsPublish(e),
                },
                wantsPublish(e) ? 'Témoignage ajouté et publié' : 'Témoignage ajouté en brouillon'
              )
              if (ok) formEl.reset()
            }}
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Plus className="h-4 w-4" aria-hidden="true" /> Nouveau témoignage
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-new-name">Nom</Label>
                <Input id="t-new-name" name="author_name" placeholder="Nom" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-new-role">Rôle</Label>
                <Input id="t-new-role" name="author_role" placeholder="Rôle" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-new-company">Entreprise</Label>
                <Input id="t-new-company" name="company_name" placeholder="Entreprise" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-new-quote">Citation</Label>
              <textarea
                id="t-new-quote"
                name="quote"
                placeholder="Citation"
                required
                className={`${TEXTAREA} min-h-[60px]`}
              />
            </div>
            <div className="flex justify-end">
              <SaveButtons saving={saving} draftLabel="Ajouter en brouillon" publishLabel="Ajouter et publier" />
            </div>
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
              pour le masquer temporairement, utilisez plutôt « Dépublier ».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              className={buttonVariants({ variant: 'destructive' })}
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}

const CARD = 'overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]'
const TEXTAREA =
  'w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Statut « Brouillon » / « Publié » + action Publier / Dépublier. */
function PublishControl({
  published,
  disabled,
  label,
  onToggle,
}: {
  published: boolean
  disabled: boolean
  label: string
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <StatusBadge label={published ? 'Publié' : 'Brouillon'} tone={published ? 'success' : 'warning'} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={onToggle}
        aria-label={`${published ? 'Dépublier' : 'Publier'} « ${label} »`}
      >
        {published ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
        {published ? 'Dépublier' : 'Publier'}
      </Button>
    </div>
  )
}

/** « Enregistrer le brouillon » (par défaut) et « Enregistrer et publier ». */
function SaveButtons({
  saving,
  draftLabel = 'Enregistrer le brouillon',
  publishLabel = 'Enregistrer et publier',
}: {
  saving: boolean
  draftLabel?: string
  publishLabel?: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button type="submit" name="intent" value="draft" variant="outline" size="sm" disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
        {draftLabel}
      </Button>
      <Button type="submit" name="intent" value="publish" size="sm" disabled={saving}>
        <Send className="h-4 w-4" aria-hidden="true" />
        {publishLabel}
      </Button>
    </div>
  )
}

function ItemFooter({
  saving,
  onDelete,
  deleteLabel,
}: {
  saving: boolean
  onDelete: () => void
  deleteLabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={saving}
        onClick={onDelete}
        aria-label={deleteLabel}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Supprimer
      </Button>
      <SaveButtons saving={saving} />
    </div>
  )
}
