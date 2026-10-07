import { StatusBadge } from '@/components/app/blocks'
import type { HealthLevel } from '@/lib/admin/company-health'

/** Libellé et ton de chaque niveau de santé (miroir de HEALTH_LABELS, sans dépendance serveur). */
export const HEALTH_META: Record<HealthLevel, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' }> = {
  active: { label: 'Actif', tone: 'success' },
  at_risk: { label: 'À risque', tone: 'warning' },
  inactive: { label: 'Inactif', tone: 'danger' },
  new: { label: 'Nouveau', tone: 'info' },
}

export function HealthBadge({ level, title }: { level?: HealthLevel | null; title?: string }) {
  if (!level) return <span className="text-muted-foreground">—</span>
  const meta = HEALTH_META[level]
  return (
    <span title={title}>
      <StatusBadge label={meta.label} tone={meta.tone} />
    </span>
  )
}
