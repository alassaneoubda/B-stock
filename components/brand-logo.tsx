import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const LOGO_SRC = '/images/b-stock-logo.png?v=5'
/** Ratio réel du PNG après détourage / trim (~1:1) */
const LOGO_RATIO = 648 / 624

type BrandLogoProps = {
  /** Lien optionnel. `false` = image seule (ex. déjà dans un Link parent). */
  href?: string | false
  /** Hauteur en px — le logo inclut déjà le nom B-STOCK */
  height?: number
  className?: string
  priority?: boolean
}

/**
 * Logo officiel B-STOCK (verre + nom), PNG transparent sans fond.
 * Ne pas ajouter de texte « B-Stock » à côté : le nom est déjà dans l’image.
 */
export function BrandLogo({
  href = '/',
  height = 64,
  className,
  priority = false,
}: BrandLogoProps) {
  const width = Math.round(height * LOGO_RATIO)

  const img = (
    <span className={cn('inline-flex items-center justify-center', className)}>
      <Image
        src={LOGO_SRC}
        alt="B-STOCK — Distribution de boissons, Côte d’Ivoire"
        width={width}
        height={height}
        priority={priority}
        className="h-auto w-auto max-h-full max-w-full object-contain object-center"
        style={{ height, width: 'auto' }}
      />
    </span>
  )

  if (href === false) return img

  return (
    <Link href={href} className="inline-flex shrink-0 items-center" aria-label="B-STOCK — Accueil">
      {img}
    </Link>
  )
}
