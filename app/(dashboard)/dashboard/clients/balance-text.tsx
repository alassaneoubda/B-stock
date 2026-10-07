import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Solde client lisible sans dépendre de la couleur.
 * Convention des comptes clients : solde négatif = le client doit de l'argent.
 *   -2000 → « Doit 2 000 FCFA » (rouge) ; 1500 → « Avoir 1 500 FCFA » (vert) ; 0 → « Soldé ».
 */
export function balanceLabel(value: unknown): { text: string; tone: 'debt' | 'credit' | 'zero' } {
  const n = Number(value ?? 0) || 0
  if (n < 0) return { text: `Doit ${formatMoney(Math.abs(n))}`, tone: 'debt' }
  if (n > 0) return { text: `Avoir ${formatMoney(n)}`, tone: 'credit' }
  return { text: 'Soldé', tone: 'zero' }
}

export function BalanceText({
  value,
  className,
  debtClassName = 'text-destructive',
}: {
  value: unknown
  className?: string
  /** Couleur d'une dette (ex. ambre pour les emballages). */
  debtClassName?: string
}) {
  const { text, tone } = balanceLabel(value)
  return (
    <span
      className={cn(
        tone === 'debt' ? debtClassName : tone === 'credit' ? 'text-success' : 'text-muted-foreground',
        className
      )}
    >
      {text}
    </span>
  )
}
