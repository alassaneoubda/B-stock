import { Package, Bell, BarChart3, Users, ShoppingCart, Truck } from 'lucide-react'

const features = [
  {
    icon: Package,
    title: 'Traçabilité complète',
    desc: 'Suivez votre inventaire depuis l\'approvisionnement jusqu\'à la livraison. Double comptabilité produits pleins et emballages vides consignés.',
  },
  {
    icon: Bell,
    title: 'Alertes intelligentes',
    desc: 'Notifications proactives avant rupture de stock ou dépassement de crédit client.',
  },
  {
    icon: BarChart3,
    title: 'Rapports décisionnels',
    desc: 'Tableaux de bord pour identifier vos meilleures ventes et dépôts les plus performants.',
  },
  {
    icon: Users,
    title: 'Multi-utilisateurs',
    desc: 'Rôles gérants, caissiers et magasiniers avec permissions strictes.',
  },
  {
    icon: ShoppingCart,
    title: 'Ventes &amp; Créances',
    desc: 'Comptes produits et emballages séparés, paiements partiels, encaissement de dettes.',
  },
  {
    icon: Truck,
    title: 'Gestion de flotte',
    desc: 'Planification de tournées, chargement, livraison et gestion des retours d\'emballages.',
  },
]

export function Features() {
  return (
    <section id="features" className="py-20 lg:py-32 bg-white">
      <div className="mx-auto max-w-[1200px] px-6">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-semibold text-blue-600 mb-3">Fonctionnalités</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950 mb-4">
            Tout ce dont vous avez besoin
          </h2>
          <p className="text-lg text-zinc-500 leading-relaxed">
            Une plateforme complète pour gérer votre chaîne de distribution, sans complexité inutile.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((item, i) => {
            const Icon = item.icon
            return (
              <div key={i} className="group p-6 rounded-xl border border-zinc-200/80 bg-white hover:border-zinc-300 hover:shadow-sm transition-all duration-200">
                <div className="h-10 w-10 rounded-lg bg-zinc-100 group-hover:bg-blue-50 flex items-center justify-center mb-4 transition-colors">
                  <Icon className="h-5 w-5 text-zinc-600 group-hover:text-blue-600 transition-colors" />
                </div>
                <h3 className="text-base font-semibold text-zinc-950 mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
