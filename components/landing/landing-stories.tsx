import Image from 'next/image'
import type { CmsFeature } from '@/lib/cms'
import { ProductCapture } from '@/components/landing/landing-product'

type Story = {
  id: string
  eyebrow: string
  title: string
  body: string
  image: string
  imageAlt: string
  reverse?: boolean
  captureSrc?: string
  captureAlt?: string
}

const STORIES: Story[] = [
  {
    id: 'stock',
    eyebrow: 'Stock',
    title: 'Sachez exactement ce qu’il reste dans chaque dépôt',
    body: 'Entrées, sorties, inventaires et alertes de seuil. Vous arrêtez de compter “à peu près” et vous pilotez avec des quantités fiables.',
    image: '/images/landing/landing-gerant.jpg',
    imageAlt: 'Gérant de dépôt',
  },
  {
    id: 'livraisons',
    eyebrow: 'Livraisons',
    title: 'Organisez vos tournées sans perdre le stock en route',
    body: 'Chargez le véhicule, suivez les stops, rapprochez ce qui est parti et ce qui est revenu. Moins d’écarts en fin de journée.',
    image: '/images/landing/landing-livraison.jpg',
    imageAlt: 'Chargement de casiers pour livraison',
    reverse: true,
    captureSrc: '/images/landing/capture-tournee.png',
    captureAlt: 'Planification d’une tournée de livraison dans B-Stock',
  },
  {
    id: 'consignes',
    eyebrow: 'Emballages consignés',
    title: 'Les casiers chez le client, enfin sous contrôle',
    body: 'Donné, retourné, solde : B-Stock sépare produits et emballages. C’est souvent là que les dépôts perdent de l’argent sans le voir.',
    image: '/images/landing/landing-consignes.jpg',
    imageAlt: 'Comptage de bouteilles consignées',
  },
  {
    id: 'creances',
    eyebrow: 'Créances',
    title: 'Suivez ce que chaque client vous doit vraiment',
    body: 'Crédit, paiements partiels, relances. Une vision claire des soldes pour décider à qui livrer demain.',
    image: '/images/landing/landing-equipe.jpg',
    imageAlt: 'Distributeurs en discussion',
    reverse: true,
  },
]

export function LandingStories({ features }: { features: CmsFeature[] }) {
  // Si le CMS a des modules, on garde les stories visuelles (plus parlantes que des cards icônes)
  void features

  return (
    <section id="features" className="bg-[#F7F4EF] py-10 lg:py-16">
      <div className="mx-auto max-w-[1180px] space-y-16 px-6 lg:space-y-24">
        {STORIES.map((s) => (
          <article
            key={s.id}
            className={`grid items-center gap-10 lg:grid-cols-2 lg:gap-16 ${
              s.reverse ? '' : ''
            }`}
          >
            <div className={s.reverse ? 'lg:order-2' : ''}>
              <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem]">
                <Image
                  src={s.image}
                  alt={s.imageAlt}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
            </div>

            <div className={s.reverse ? 'lg:order-1' : ''}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2563EB]">
                {s.eyebrow}
              </p>
              <h2 className="mt-3 text-[clamp(1.6rem,3vw,2.25rem)] font-bold leading-[1.15] tracking-tight text-[#0F172A]">
                {s.title}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#52525B]">{s.body}</p>

              {s.captureSrc && (
                <div className="mt-8">
                  <ProductCapture
                    src={s.captureSrc}
                    alt={s.captureAlt || 'Capture B-Stock'}
                    className="max-w-md rounded-2xl"
                  />
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
