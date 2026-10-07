'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { toast } from 'sonner'
import { CalendarPlus, Hourglass, Loader2, Mail, MessageCircle, Phone } from 'lucide-react'
import { PageShell, PageIntro } from '@/components/app/blocks'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { HealthBadge } from '@/components/admin/health-badge'
import { useAdmin } from '@/components/admin/admin-role'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDate, formatNumber, formatRelative } from '@/lib/format'
import { mailtoLink, telLink, trialEndingMessage, whatsAppLink } from '@/lib/admin/contact'
import type { HealthLevel } from '@/lib/admin/company-health'

type Trial = {
  id: string
  name: string
  planName: string | null
  trialEndsAt: string | null
  daysLeft: number
  isSuspended: boolean
  ownerName: string | null
  email: string | null
  phone: string | null
  health: { level: HealthLevel; reasons: string[]; lastActivityAt: string | null; sales30d: number; onboardingScore: number } | null
}

const WINDOWS = [
  { value: '3', label: '3 jours' },
  { value: '7', label: '7 jours' },
  { value: '14', label: '14 jours' },
  { value: 'expired', label: 'Expirés récemment' },
] as const

const fetcher = (url: string) => apiFetch(url)

function daysLeftLabel(days: number) {
  if (days < 0) return `Expiré depuis ${Math.abs(days)} j`
  if (days === 0) return 'Se termine aujourd’hui'
  return `Dans ${days} j`
}

export default function AdminTrialsPage() {
  const { can } = useAdmin()
  const [windowValue, setWindowValue] = useState<(typeof WINDOWS)[number]['value']>('7')
  const { data, error, isLoading, mutate } = useSWR<{ data: Trial[] }>(`/api/admin/trials?window=${windowValue}`, fetcher)
  const trials = data?.data ?? []

  const [extending, setExtending] = useState<Trial | null>(null)
  const [days, setDays] = useState('7')
  const [saving, setSaving] = useState(false)

  async function extend(e: React.FormEvent) {
    e.preventDefault()
    if (!extending) return
    const n = parseInt(days, 10)
    if (!n || n < 1 || n > 365) {
      toast.error('Indiquez un nombre de jours entre 1 et 365')
      return
    }
    setSaving(true)
    try {
      // Même action que la fiche entreprise (PATCH extend_trial)
      await apiFetch(`/api/admin/companies/${extending.id}`, { method: 'PATCH', body: { action: 'extend_trial', days: n } })
      toast.success(`Essai de ${extending.name} prolongé de ${n} jour(s)`)
      setExtending(null)
      await mutate()
    } catch (err) {
      toastError(err, 'Prolongation impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <PageIntro
        title="Essais à convertir"
        description="Entreprises en période d’essai qui se termine bientôt : prolongez, appelez ou écrivez au responsable avant l’échéance."
      />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Échéance de l’essai">
        {WINDOWS.map((w) => (
          <button
            key={w.value}
            type="button"
            aria-pressed={windowValue === w.value}
            onClick={() => setWindowValue(w.value)}
            className={`h-10 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              windowValue === w.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {isLoading ? (
          <div className="p-5">
            <TableSkeleton columns={5} />
          </div>
        ) : error ? (
          <ErrorState className="m-5" description={errorMessage(error)} onRetry={() => mutate()} />
        ) : trials.length === 0 ? (
          <EmptyState
            className="m-5"
            icon={Hourglass}
            title={windowValue === 'expired' ? 'Aucun essai expiré récemment' : 'Aucun essai ne se termine sur cette période'}
            description="Changez la période pour voir d’autres entreprises."
          />
        ) : (
          <>
            <p className="border-b border-border px-5 py-3 text-xs text-muted-foreground">
              {formatNumber(trials.length)} entreprise(s)
            </p>
            {/* Bureau */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Entreprise</th>
                    <th className="px-5 py-3 font-medium">Responsable</th>
                    <th className="px-5 py-3 font-medium">Santé</th>
                    <th className="px-5 py-3 font-medium">Fin d’essai</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trials.map((t) => (
                    <tr key={t.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                      <td className="px-5 py-3">
                        <Link href={`/admin/companies/${t.id}`} className="font-medium text-foreground hover:underline">
                          {t.name}
                        </Link>
                        <p className="text-xs capitalize text-muted-foreground">{t.planName || 'Sans plan'}</p>
                      </td>
                      <td className="px-5 py-3">
                        <p className="text-foreground">{t.ownerName || '—'}</p>
                        <p className="text-xs text-muted-foreground">{[t.email, t.phone].filter(Boolean).join(' · ') || 'Aucun contact'}</p>
                      </td>
                      <td className="px-5 py-3">
                        <HealthBadge level={t.health?.level} title={t.health?.reasons.join(' ')} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t.health?.lastActivityAt ? `Vu ${formatRelative(t.health.lastActivityAt)}` : 'Jamais connecté'}
                        </p>
                      </td>
                      <td className="tabular whitespace-nowrap px-5 py-3">
                        <p className={t.daysLeft <= 1 ? 'font-medium text-destructive' : 'text-foreground'}>{daysLeftLabel(t.daysLeft)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(t.trialEndsAt)}</p>
                      </td>
                      <td className="px-5 py-3">
                        <TrialActions trial={t} canExtend={can('companies.trial')} onExtend={() => { setDays('7'); setExtending(t) }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <ul className="divide-y divide-border md:hidden">
              {trials.map((t) => (
                <li key={t.id} className="space-y-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/admin/companies/${t.id}`} className="font-medium text-foreground hover:underline">
                        {t.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {[t.ownerName, t.phone || t.email].filter(Boolean).join(' · ') || 'Aucun contact'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`tabular text-sm ${t.daysLeft <= 1 ? 'font-medium text-destructive' : 'text-foreground'}`}>
                        {daysLeftLabel(t.daysLeft)}
                      </p>
                      <HealthBadge level={t.health?.level} />
                    </div>
                  </div>
                  <TrialActions trial={t} canExtend={can('companies.trial')} onExtend={() => { setDays('7'); setExtending(t) }} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Dialog open={extending !== null} onOpenChange={(o) => !o && !saving && setExtending(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={extend} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Prolonger l’essai</DialogTitle>
              <DialogDescription>
                {extending?.name} — la fin d’essai sera repoussée à partir de la date actuelle de fin (ou d’aujourd’hui si
                l’essai est déjà terminé).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="trial-days">Nombre de jours</Label>
              <div className="flex flex-wrap items-center gap-2">
                {[3, 7, 14, 30].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDays(String(n))}
                    aria-pressed={days === String(n)}
                    className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      days === String(n)
                        ? 'border-brand/50 bg-brand-soft text-brand-strong'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {n} j
                  </button>
                ))}
                <Input
                  id="trial-days"
                  type="number"
                  min={1}
                  max={365}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="tabular h-9 w-24"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setExtending(null)} disabled={saving}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Prolonger
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

function TrialActions({ trial, canExtend, onExtend }: { trial: Trial; canExtend: boolean; onExtend: () => void }) {
  const message = trialEndingMessage({ ownerName: trial.ownerName, companyName: trial.name, daysLeft: trial.daysLeft })
  const tel = telLink(trial.phone)
  const wa = whatsAppLink(trial.phone, message)
  const mail = mailtoLink(trial.email, `Votre essai B-Stock — ${trial.name}`, message)

  return (
    <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
      {canExtend && (
        <Button size="sm" variant="outline" onClick={onExtend}>
          <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Prolonger
        </Button>
      )}
      <ContactButton href={tel} label="Appeler" icon={Phone} name={trial.name} />
      <ContactButton href={wa} label="WhatsApp" icon={MessageCircle} name={trial.name} external />
      <ContactButton href={mail} label="Email" icon={Mail} name={trial.name} />
    </div>
  )
}

function ContactButton({
  href,
  label,
  icon: Icon,
  name,
  external,
}: {
  href: string | null
  label: string
  icon: typeof Phone
  name: string
  external?: boolean
}) {
  if (!href) {
    return (
      <Button size="sm" variant="ghost" disabled title={`${label} : contact manquant`}>
        <Icon className="h-4 w-4" aria-hidden="true" /> {label}
      </Button>
    )
  }
  return (
    <Button size="sm" variant="ghost" asChild>
      <a
        href={href}
        aria-label={`${label} — ${name}`}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        <Icon className="h-4 w-4" aria-hidden="true" /> {label}
      </a>
    </Button>
  )
}
