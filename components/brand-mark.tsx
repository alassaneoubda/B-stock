import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Déclinaison « application » du logo B-Stock : monogramme orange (B + bulles,
 * clin d'œil à la boisson) et nom en texte. Le logo illustré complet reste
 * réservé au site public (BrandLogo).
 */
export function BrandMonogram({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label="B-Stock"
      className={cn('shrink-0', className)}
    >
      <rect width="40" height="40" rx="11" fill="var(--brand)" />
      <path
        d="M13 10.5h8.2c4 0 6.6 2 6.6 5.2 0 2.1-1.1 3.6-2.9 4.3 2.4.6 3.8 2.4 3.8 4.9 0 3.6-2.8 5.9-7.1 5.9H13V10.5Zm4.4 3.6v4.5h3.4c1.7 0 2.7-.8 2.7-2.3 0-1.4-1-2.2-2.7-2.2h-3.4Zm0 7.8v4.9h3.9c1.9 0 3-.9 3-2.5s-1.1-2.4-3-2.4h-3.9Z"
        fill="var(--brand-foreground)"
      />
      <circle cx="31" cy="9" r="2.2" fill="var(--brand-foreground)" opacity=".55" />
      <circle cx="34.2" cy="14.2" r="1.3" fill="var(--brand-foreground)" opacity=".4" />
    </svg>
  )
}

export function BrandMark({
  href = '/dashboard',
  size = 32,
  showName = true,
  subtitle,
  className,
}: {
  href?: string | false
  size?: number
  showName?: boolean
  subtitle?: string | null
  className?: string
}) {
  const content = (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <BrandMonogram size={size} />
      {showName && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[15px] font-semibold tracking-tight text-foreground">B-Stock</span>
          {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
      )}
    </span>
  )
  if (href === false) return content
  return (
    <Link href={href} className="inline-flex min-w-0 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="B-Stock — Tableau de bord">
      {content}
    </Link>
  )
}
