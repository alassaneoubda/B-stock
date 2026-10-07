'use client'

import { useState } from 'react'
import { useSWRConfig } from 'swr'
import { toast } from 'sonner'
import { Panel } from '@/components/app/blocks'
import { Switch } from '@/components/ui/switch'
import { useAdmin } from '@/components/admin/admin-role'
import { apiFetch, toastError } from '@/lib/api-client'
import { FEATURE_FLAGS, isFeatureEnabled, type FeatureFlagKey } from '@/lib/feature-flags'
import { timelineKey } from './company-timeline-panel'

/** Carte « Fonctionnalités » : activation par entreprise (companies.feature_flags). */
export function CompanyFeaturesCard({
  companyId,
  flags,
  onChanged,
}: {
  companyId: string
  flags: unknown
  onChanged: () => Promise<unknown> | void
}) {
  const { can } = useAdmin()
  const { mutate } = useSWRConfig()
  const [pending, setPending] = useState<FeatureFlagKey | null>(null)
  const editable = can('companies.features')

  async function toggle(key: FeatureFlagKey, value: boolean, label: string) {
    setPending(key)
    try {
      await apiFetch(`/api/admin/companies/${companyId}/features`, { method: 'PATCH', body: { flags: { [key]: value } } })
      toast.success(`${label} ${value ? 'activé' : 'désactivé'}`)
      await Promise.all([onChanged(), mutate(timelineKey(companyId))])
    } catch (e) {
      toastError(e, 'Modification impossible')
    } finally {
      setPending(null)
    }
  }

  return (
    <Panel
      title="Fonctionnalités"
      description={editable ? 'Activez ou désactivez des modules pour ce compte' : 'Modules activés pour ce compte'}
    >
      <ul className="divide-y divide-border">
        {FEATURE_FLAGS.map((f) => {
          const enabled = isFeatureEnabled(flags, f.key)
          const id = `feature-${f.key}`
          return (
            <li key={f.key} className="flex items-start justify-between gap-4 px-5 py-3.5">
              <div className="min-w-0">
                <label htmlFor={id} className="text-sm font-medium text-foreground">
                  {f.label}
                </label>
                <p className="text-xs text-muted-foreground">{f.description}</p>
              </div>
              <Switch
                id={id}
                checked={enabled}
                disabled={!editable || pending !== null}
                onCheckedChange={(v) => toggle(f.key, v, f.label)}
                aria-describedby={`${id}-state`}
              />
              <span id={`${id}-state`} className="sr-only">
                {enabled ? 'Activé' : 'Désactivé'}
              </span>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
