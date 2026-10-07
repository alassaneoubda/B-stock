'use client'

import useSWR from 'swr'
import { Check, Minus } from 'lucide-react'
import { Panel } from '@/components/app/blocks'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states'
import { HealthBadge } from '@/components/admin/health-badge'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateTime, formatMoney, formatNumber, formatRelative } from '@/lib/format'
import type { CompanyHealth, HEALTH_RULES } from '@/lib/admin/company-health'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => apiFetch(url)

/** Panneau « Santé du compte » de la fiche entreprise : indicateurs + explication du niveau. */
export function CompanyHealthPanel({ companyId }: { companyId: string }) {
  const { data, error, isLoading, mutate } = useSWR<{ data: CompanyHealth; rules: typeof HEALTH_RULES }>(
    `/api/admin/companies/${companyId}/health`,
    fetcher
  )
  const h = data?.data
  const rules = data?.rules

  return (
    <Panel
      title="Santé du compte"
      description="Activité et démarrage, pour anticiper les départs"
      action={h ? <HealthBadge level={h.level} /> : undefined}
    >
      {isLoading ? (
        <div className="space-y-3 p-5" aria-busy="true" aria-label="Chargement">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error || !h ? (
        <ErrorState className="m-5 py-8" description={errorMessage(error)} onRetry={() => mutate()} />
      ) : (
        <div className="space-y-5 p-5">
          <ul className="space-y-1 rounded-lg bg-muted/60 px-4 py-3 text-sm text-foreground">
            {h.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Metric
              label="Dernière activité"
              value={h.lastActivityAt ? formatRelative(h.lastActivityAt) : 'Jamais'}
              hint={h.lastActivityAt ? formatDateTime(h.lastActivityAt) : 'Aucune connexion'}
            />
            <Metric
              label="Utilisateurs actifs"
              value={`${formatNumber(h.activeUsers)} / ${formatNumber(h.totalUsers)}`}
              hint={`Connectés depuis ${rules?.activeUserDays ?? 14} jours`}
            />
            <Metric label="Ventes 7 jours" value={formatNumber(h.sales7d)} hint={formatMoney(h.revenue7d)} />
            <Metric label="Ventes 30 jours" value={formatNumber(h.sales30d)} hint={formatMoney(h.revenue30d)} />
          </dl>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Démarrage — {h.onboarding.score}/4 étapes</p>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              <Step done={h.onboarding.hasProducts} label="Produits créés" />
              <Step done={h.onboarding.hasClients} label="Clients enregistrés" />
              <Step done={h.onboarding.hasSale} label="Première vente" />
              <Step done={h.onboarding.hasCashSession} label="Caisse ouverte" />
            </ul>
          </div>

          {rules && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground">Règles de calcul</summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Nouveau : compte créé il y a moins de {rules.newAccountDays} jours.</li>
                <li>
                  Inactif : aucune connexion depuis {rules.inactiveLoginDays} jours et aucune vente depuis{' '}
                  {rules.inactiveSaleDays} jours.
                </li>
                <li>
                  À risque : aucune vente depuis {rules.atRiskSaleDays} jours, ou moins de {rules.minOnboardingSteps} étapes
                  de démarrage après {rules.newAccountDays} jours.
                </li>
                <li>Actif : dans tous les autres cas.</li>
              </ul>
            </details>
          )}
        </div>
      )}
    </Panel>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-0.5 text-base font-semibold tracking-tight text-foreground">{value}</dd>
      {hint && <p className="tabular text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          done ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'
        )}
        aria-hidden="true"
      >
        {done ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      </span>
      <span className={done ? 'text-foreground' : 'text-muted-foreground'}>
        {label}
        <span className="sr-only">{done ? ' : fait' : ' : pas encore'}</span>
      </span>
    </li>
  )
}
