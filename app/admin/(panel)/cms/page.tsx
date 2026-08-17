'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, Trash2, Plus } from 'lucide-react'

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

export default function AdminCmsPage() {
  const [tab, setTab] = useState<Tab>('sections')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [sections, setSections] = useState<Section[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [faq, setFaq] = useState<Faq[]>([])
  const [testimonials, setTestimonials] = useState<Testimonial[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/cms')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur de chargement')
      setSections(json.data.sections || [])
      setFeatures(json.data.features || [])
      setFaq(json.data.faq || [])
      setTestimonials(json.data.testimonials || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function patch(body: Record<string, unknown>) {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/cms', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Échec')
      setMessage('Enregistré')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSaving(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'sections', label: 'Sections' },
    { id: 'features', label: 'Fonctionnalités' },
    { id: 'faq', label: 'FAQ' },
    { id: 'testimonials', label: 'Témoignages' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-500 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Chargement du CMS…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-950">CMS Landing</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Modifiez les textes, FAQ et témoignages affichés sur la page d’accueil — sans toucher au code.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-zinc-950 text-white'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sections' && (
        <div className="space-y-4">
          {sections.map((s) => (
            <form
              key={s.section_key}
              className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3"
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
                <h2 className="font-semibold text-zinc-900">{s.section_key}</h2>
                <label className="flex items-center gap-2 text-xs text-zinc-500">
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
                  className="w-full min-h-[80px] rounded-md border border-zinc-200 px-3 py-2 text-sm"
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
          {features.map((f) => (
            <form
              key={f.id}
              className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3"
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
                <span className="text-xs font-mono text-zinc-400">{f.slug}</span>
                <button
                  type="button"
                  className="text-red-600 text-xs flex items-center gap-1"
                  onClick={() => patch({ type: 'feature', id: f.id, title: f.title, delete: true })}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </button>
              </div>
              <Input name="title" defaultValue={f.title} required />
              <textarea
                name="description"
                defaultValue={f.description || ''}
                className="w-full min-h-[60px] rounded-md border border-zinc-200 px-3 py-2 text-sm"
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
              className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3"
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
                  className="text-red-600 text-xs flex items-center gap-1"
                  onClick={() =>
                    patch({
                      type: 'faq',
                      id: item.id,
                      question: item.question,
                      answer: item.answer,
                      delete: true,
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
                className="w-full min-h-[80px] rounded-md border border-zinc-200 px-3 py-2 text-sm"
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
            className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              patch({
                type: 'faq',
                question: String(fd.get('question')),
                answer: String(fd.get('answer')),
              })
              e.currentTarget.reset()
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
              className="w-full min-h-[60px] rounded-md border border-zinc-200 px-3 py-2 text-sm"
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
              className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3"
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
                  className="text-red-600 text-xs flex items-center gap-1"
                  onClick={() =>
                    patch({
                      type: 'testimonial',
                      id: t.id,
                      author_name: t.author_name,
                      quote: t.quote,
                      delete: true,
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
                className="w-full min-h-[80px] rounded-md border border-zinc-200 px-3 py-2 text-sm"
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
            className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              patch({
                type: 'testimonial',
                author_name: String(fd.get('author_name')),
                author_role: String(fd.get('author_role') || '') || null,
                company_name: String(fd.get('company_name') || '') || null,
                quote: String(fd.get('quote')),
              })
              e.currentTarget.reset()
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
              className="w-full min-h-[60px] rounded-md border border-zinc-200 px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={saving} size="sm">
              Ajouter
            </Button>
          </form>
        </div>
      )}
    </div>
  )
}
