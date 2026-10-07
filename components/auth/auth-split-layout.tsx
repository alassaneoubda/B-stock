import Image from 'next/image'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { cn } from '@/lib/utils'

type AuthSplitLayoutProps = {
  children: React.ReactNode
  imageSrc?: string
  imageAlt?: string
  /** Proposition de valeur affichée sur le panneau visuel (une phrase courte). */
  headline: string
  subline?: string
  /** Conservé pour compatibilité : le panneau visuel est toujours à droite. */
  imageSide?: 'left' | 'right'
  formMaxWidth?: string
  /** Liens sous le formulaire (ex. « Pas encore de compte ? ») */
  footer?: React.ReactNode
}

const TRUST_POINTS = [
  'Stock, ventes, crédits et consignes au même endroit',
  'Un accès par rôle pour chaque membre de l’équipe',
  'Pensé pour les dépôts, bars et maquis de Côte d’Ivoire',
]

/**
 * Mise en page des écrans d'authentification : colonne formulaire à gauche,
 * panneau photo (voile encre) à droite. Sur mobile : formulaire seul.
 */
export function AuthSplitLayout({
  children,
  imageSrc = '/images/landing/landing-hero-depot.jpg',
  imageAlt = 'Dépôt de distribution de boissons',
  headline,
  subline,
  formMaxWidth = 'max-w-[400px]',
  footer,
}: AuthSplitLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Colonne formulaire */}
      <div className="flex min-h-screen flex-1 flex-col px-6 py-8 sm:px-10 lg:px-16">
        <header>
          <Link
            href="/"
            aria-label="B-Stock — Accueil"
            className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrandMark href={false} />
          </Link>
        </header>

        <main className="flex flex-1 items-center py-10">
          <div className={cn('mx-auto w-full', formMaxWidth)}>
            {children}
            {footer && <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>}
          </div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} B-Stock</span>
          <Link href="/" className="transition-colors hover:text-foreground">
            Retour au site
          </Link>
        </footer>
      </div>

      {/* Panneau visuel (≥ lg) — toujours sombre : on le place dans la palette « dark » */}
      <aside className="dark relative hidden w-[46%] max-w-[760px] overflow-hidden lg:block">
        <Image src={imageSrc} alt={imageAlt} fill priority className="object-cover object-center" sizes="46vw" />
        <div className="absolute inset-0 bg-background/85" aria-hidden="true" />

        <div className="relative z-10 flex h-full flex-col justify-end p-12 xl:p-16">
          <div className="max-w-md">
            <h2 className="text-[clamp(1.6rem,2.3vw,2.2rem)] font-semibold leading-tight tracking-tight text-foreground">
              {headline}
            </h2>
            {subline && <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{subline}</p>}

            <ul className="mt-8 space-y-3 border-t border-border pt-8">
              {TRUST_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-foreground/90">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  )
}

/** En-tête de formulaire d'authentification (titre + sous-titre). */
export function AuthHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-8 space-y-1.5">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

/** Séparateur « ou » entre Google et le formulaire email. */
export function AuthDivider({ label = 'ou avec votre email' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3" role="separator">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}
