import Image from 'next/image'
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CreditCard,
  FileText,
  MonitorSmartphone,
  ShieldCheck,
  Truck,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import type { CmsFeature } from '@/lib/cms'

const ICONS: Record<string, LucideIcon> = {
  warehouse: Warehouse, stock: Warehouse, package: Boxes, boxes: Boxes, truck: Truck, delivery: Truck,
  wallet: Wallet, cash: Wallet, credit: CreditCard, 'credit-card': CreditCard, file: FileText, invoice: FileText,
  chart: BarChart3, 'bar-chart': BarChart3, transfer: ArrowLeftRight, shield: ShieldCheck, pos: MonitorSmartphone,
}

const DEFAULT_MODULES = [
  { icon: Warehouse, title: 'Stock multi-dépôts', text: 'Lots, dates de péremption, seuils d’alerte, inventaires et transferts entre dépôts.' },
  { icon: FileText, title: 'Ventes et factures', text: 'Une vente génère automatiquement la facture, la sortie de stock et l’encaissement.' },
  { icon: Boxes, title: 'Emballages consignés', text: 'Casiers et bouteilles suivis séparément des produits, client par client.' },
  { icon: CreditCard, title: 'Crédits clients', text: 'Plafonds, échéances, règlements partiels et relances, sans cahier.' },
  { icon: Wallet, title: 'Caisse du jour', text: 'Ouverture, mouvements validés, clôture avec l’écart entre compté et attendu.' },
  { icon: Truck, title: 'Tournées de livraison', text: 'Véhicules, arrêts, statut de chaque livraison et commandes livrées.' },
  { icon: MonitorSmartphone, title: 'Point de vente', text: 'Tables, commandes en attente et encaissement rapide pour les maquis.' },
  { icon: ShieldCheck, title: 'Équipe et droits', text: 'Gérant, caissier, magasinier : chacun ne voit que ce qui le concerne.' },
]

const STORIES = [
  {
    eyebrow: 'Sur le terrain',
    title: 'Pensé pour le dépôt, pas pour un bureau climatisé',
    body: 'Grandes zones tactiles, fonctionne sur un téléphone d’entrée de gamme, montants en FCFA et vocabulaire du métier : casiers, consignes, tournées, ardoise.',
    image: '/images/landing/landing-gerant.jpg',
    alt: 'Gérant de dépôt de boissons',
  },
  {
    eyebrow: 'Livraisons',
    title: 'Chaque tournée suivie, de la sortie du dépôt au dernier client',
    body: 'Préparez la tournée, suivez chaque arrêt et voyez les commandes passer à « livrée ». Les écarts de fin de journée se voient tout de suite.',
    image: '/images/landing/landing-livraison.jpg',
    alt: 'Chargement de casiers dans un camion de livraison',
  },
]

export function LandingStories({ features }: { features: CmsFeature[] }) {
  const modules = features.length
    ? features.map((f) => ({ icon: ICONS[f.icon] ?? Boxes, title: f.title, text: f.description ?? '' }))
    : DEFAULT_MODULES

  return (
    <section id="features" className="scroll-mt-20 py-20 lg:py-28">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-strong">Fonctionnalités</p>
          <h2 className="mt-3 text-balance text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            Tout le cycle du dépôt, dans une seule application
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Du camion du fournisseur à la caisse du soir, chaque opération met à jour le stock, les comptes clients et la caisse.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m) => (
            <div key={m.title} className="rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                <m.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-semibold tracking-tight text-foreground">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-24 space-y-20 lg:space-y-28">
          {STORIES.map((s, i) => (
            <article key={s.title} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className={i % 2 ? 'lg:order-2' : ''}>
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl">
                  <Image src={s.image} alt={s.alt} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 50vw" />
                </div>
              </div>
              <div className={i % 2 ? 'lg:order-1' : ''}>
                <p className="text-sm font-semibold text-brand-strong">{s.eyebrow}</p>
                <h3 className="mt-3 text-balance text-[clamp(1.5rem,2.6vw,2rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground">
                  {s.title}
                </h3>
                <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{s.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
