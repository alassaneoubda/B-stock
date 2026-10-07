'use client'

import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiFetch } from '@/lib/api-client'
import { MobileMoneyDialog, type MobileMoneyTarget } from './mobile-money-dialog'

type Availability = { enabled: boolean; environment: 'sandbox' | 'production' }

// Une seule requête par chargement de page, partagée entre les boutons
let availabilityPromise: Promise<Availability> | null = null
function loadAvailability(): Promise<Availability> {
  if (!availabilityPromise) {
    availabilityPromise = apiFetch<{ data: Availability }>('/api/payments/mobile-money/config')
      .then((r) => r.data)
      .catch(() => {
        availabilityPromise = null
        return { enabled: false, environment: 'sandbox' as const }
      })
  }
  return availabilityPromise
}

/** Disponibilité de Mobile Money pour l'entreprise (bouton masqué sinon). */
export function useMobileMoneyAvailability(): Availability | null {
  const [availability, setAvailability] = useState<Availability | null>(null)
  useEffect(() => {
    let alive = true
    loadAvailability().then((a) => alive && setAvailability(a))
    return () => {
      alive = false
    }
  }, [])
  return availability
}

/**
 * Bouton « Paiement Mobile Money » : n'apparaît que si le propriétaire a
 * configuré et activé ses identifiants GeniusPay.
 */
export function MobileMoneyButton({
  target,
  clientName,
  clientPhone,
  onPaid,
  size,
  variant = 'outline',
  className,
  label = 'Paiement Mobile Money',
}: {
  target: MobileMoneyTarget
  clientName?: string | null
  clientPhone?: string | null
  onPaid?: () => void
  size?: 'default' | 'sm' | 'lg' | 'icon'
  variant?: 'outline' | 'brand' | 'ghost' | 'default'
  className?: string
  label?: string
}) {
  const availability = useMobileMoneyAvailability()
  const [open, setOpen] = useState(false)
  if (!availability?.enabled) return null
  return (
    <>
      <Button type="button" variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Smartphone className="h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
      <MobileMoneyDialog
        open={open}
        onOpenChange={setOpen}
        target={target}
        clientName={clientName}
        clientPhone={clientPhone}
        onPaid={onPaid}
      />
    </>
  )
}
