'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CreditCard, Loader2, Receipt, Search, User } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateShort, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

type SearchResults = {
  companies: { id: string; name: string; slug: string; email: string | null; phone: string | null }[]
  users: { id: string; email: string; full_name: string | null; phone: string | null; company_id: string; company_name: string }[]
  sales: { id: string; order_number: string; total_amount: string; created_at: string; company_id: string; company_name: string }[]
  payments: {
    id: string
    reference: string | null
    receipt_number: string | null
    amount: string
    plan_name: string | null
    company_id: string
    company_name: string
  }[]
}

const EMPTY: SearchResults = { companies: [], users: [], sales: [], payments: [] }
const DEBOUNCE_MS = 250

/**
 * Recherche globale du back-office (entreprises, utilisateurs, ventes, paiements).
 * Ouverture : clic sur le champ ou ⌘K / Ctrl+K. Navigation clavier (↑ ↓ Entrée).
 * Chaque résultat mène à la fiche de l'entreprise concernée.
 */
export function AdminGlobalSearch({ className }: { className?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMac, setIsMac] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent))
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Recherche différée (250 ms) ; la requête précédente est annulée
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      abortRef.current?.abort()
      setResults(EMPTY)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const json = await apiFetch<{ data: SearchResults }>(`/api/admin/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        })
        setResults(json.data ?? EMPTY)
        setError(null)
        setLoading(false)
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return
        setError(errorMessage(e))
        setResults(EMPTY)
        setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  function go(companyId: string) {
    setOpen(false)
    setQuery('')
    router.push(`/admin/companies/${companyId}`)
  }

  const total = results.companies.length + results.users.length + results.sales.length + results.payments.length
  const tooShort = query.trim().length < 2

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
        aria-label="Rechercher dans le back-office"
        aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-left">Rechercher…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium sm:inline">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setQuery('')
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Recherche globale</DialogTitle>
          <DialogDescription className="sr-only">
            Entreprises, utilisateurs, numéros de vente et références de paiement.
          </DialogDescription>
          <Command shouldFilter={false} loop className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Entreprise, email, téléphone, n° de vente, référence…"
              className="h-12"
              aria-label="Rechercher"
            />
            <CommandList className="max-h-[420px]">
              {tooShort ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">Saisissez au moins 2 caractères.</p>
              ) : loading && total === 0 ? (
                <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground" aria-live="polite">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Recherche…
                </div>
              ) : error ? (
                <p role="alert" className="px-4 py-8 text-center text-sm text-destructive">
                  {error}
                </p>
              ) : (
                <>
                  <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
                    Aucun résultat pour « {query.trim()} ».
                  </CommandEmpty>

                  {results.companies.length > 0 && (
                    <CommandGroup heading="Entreprises">
                      {results.companies.map((c) => (
                        <CommandItem key={c.id} value={`company-${c.id}`} onSelect={() => go(c.id)}>
                          <Building2 aria-hidden="true" />
                          <ResultText title={c.name} meta={[c.email, c.phone].filter(Boolean).join(' · ') || c.slug} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results.users.length > 0 && (
                    <CommandGroup heading="Utilisateurs">
                      {results.users.map((u) => (
                        <CommandItem key={u.id} value={`user-${u.id}`} onSelect={() => go(u.company_id)}>
                          <User aria-hidden="true" />
                          <ResultText
                            title={u.full_name || u.email}
                            meta={[u.email, u.phone, u.company_name].filter(Boolean).join(' · ')}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results.sales.length > 0 && (
                    <CommandGroup heading="Ventes">
                      {results.sales.map((s) => (
                        <CommandItem key={s.id} value={`sale-${s.id}`} onSelect={() => go(s.company_id)}>
                          <Receipt aria-hidden="true" />
                          <ResultText
                            title={s.order_number}
                            meta={`${s.company_name} · ${formatDateShort(s.created_at)}`}
                            amount={formatMoney(s.total_amount)}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results.payments.length > 0 && (
                    <CommandGroup heading="Paiements d’abonnement">
                      {results.payments.map((p) => (
                        <CommandItem key={p.id} value={`payment-${p.id}`} onSelect={() => go(p.company_id)}>
                          <CreditCard aria-hidden="true" />
                          <ResultText
                            title={p.receipt_number || p.reference || 'Paiement'}
                            meta={[p.company_name, p.plan_name].filter(Boolean).join(' · ')}
                            amount={formatMoney(p.amount)}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ResultText({ title, meta, amount }: { title: string; meta?: string; amount?: string }) {
  return (
    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{title}</span>
        {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
      </span>
      {amount && <span className="tabular shrink-0 text-xs font-medium text-foreground">{amount}</span>}
    </span>
  )
}
