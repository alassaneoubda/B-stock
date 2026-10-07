'use client'

import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { Loader2, Pin, PinOff, StickyNote, Trash2 } from 'lucide-react'
import { Panel } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { useAdmin } from '@/components/admin/admin-role'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { timelineKey } from './company-timeline-panel'

type Note = { id: string; body: string; pinned: boolean; admin_id: string | null; admin_email: string | null; created_at: string }

const fetcher = (url: string) => apiFetch(url)
const MAX_LENGTH = 5000

/** Notes internes de l'équipe sur l'entreprise (jamais visibles du client). Épinglées en premier. */
export function CompanyNotesPanel({ companyId }: { companyId: string }) {
  const { can, adminId, role } = useAdmin()
  const { mutate: globalMutate } = useSWRConfig()
  const key = `/api/admin/companies/${companyId}/notes`
  const { data, error, isLoading, mutate } = useSWR<{ data: Note[] }>(can('companies.notes') ? key : null, fetcher)
  const notes = data?.data ?? []
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  if (!can('companies.notes')) return null

  async function run(label: string, fn: () => Promise<unknown>, success: string) {
    if (busy) return false
    setBusy(label)
    try {
      await fn()
      toast.success(success)
      await Promise.all([mutate(), globalMutate(timelineKey(companyId))])
      return true
    } catch (e) {
      toastError(e)
      return false
    } finally {
      setBusy(null)
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return
    const ok = await run('create', () => apiFetch(key, { method: 'POST', body: { body: text } }), 'Note ajoutée')
    if (ok) setBody('')
  }

  return (
    <Panel title="Notes internes" description="Visibles uniquement par l’équipe B-Stock">
      <form onSubmit={add} className="space-y-2 border-b border-border p-5">
        <label htmlFor="company-note" className="sr-only">
          Nouvelle note
        </label>
        <Textarea
          id="company-note"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_LENGTH}
          rows={3}
          placeholder="Ex. appelé le 07/10, souhaite une démo du point de vente la semaine prochaine…"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(e)
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">Ctrl + Entrée pour enregistrer</p>
          <Button type="submit" size="sm" disabled={!body.trim() || !!busy}>
            {busy === 'create' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Ajouter la note
          </Button>
        </div>
      </form>

      {isLoading ? (
        <div className="p-5">
          <TableSkeleton rows={3} columns={1} />
        </div>
      ) : error ? (
        <ErrorState className="m-5 py-8" description={errorMessage(error)} onRetry={() => mutate()} />
      ) : notes.length === 0 ? (
        <EmptyState className="m-5 py-8" icon={StickyNote} title="Aucune note" description="Consignez ici les échanges avec le client." />
      ) : (
        <ul className="max-h-[480px] divide-y divide-border overflow-y-auto">
          {notes.map((n) => {
            const canDelete = n.admin_id === adminId || role === 'super_admin'
            return (
              <li key={n.id} className={cn('space-y-1.5 px-5 py-3.5', n.pinned && 'bg-brand-soft/40')}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {n.pinned && <span className="mr-1.5 font-medium text-brand-strong">Épinglée ·</span>}
                    {n.admin_email || 'Administrateur supprimé'} · <span className="tabular">{formatDateTime(n.created_at)}</span>
                  </p>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={!!busy}
                      aria-label={n.pinned ? 'Désépingler la note' : 'Épingler la note'}
                      title={n.pinned ? 'Désépingler' : 'Épingler'}
                      onClick={() =>
                        run(
                          `pin-${n.id}`,
                          () => apiFetch(key, { method: 'PATCH', body: { noteId: n.id, pinned: !n.pinned } }),
                          n.pinned ? 'Note désépinglée' : 'Note épinglée'
                        )
                      }
                    >
                      {n.pinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
                    </Button>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        disabled={!!busy}
                        aria-label="Supprimer la note"
                        title="Supprimer"
                        onClick={() => {
                          if (!window.confirm('Supprimer cette note ?')) return
                          run(
                            `del-${n.id}`,
                            () => apiFetch(`${key}?noteId=${encodeURIComponent(n.id)}`, { method: 'DELETE' }),
                            'Note supprimée'
                          )
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-foreground">{n.body}</p>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
