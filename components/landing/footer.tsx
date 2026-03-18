import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function Footer() {
  return (
    <footer className="bg-zinc-50 border-t border-zinc-200">
      {/* CTA Banner */}
      <div className="mx-auto max-w-[1200px] px-6 py-16 lg:py-20">
        <div className="rounded-2xl bg-zinc-950 p-10 lg:p-14 flex flex-col lg:flex-row justify-between items-center gap-8">
          <div className="text-center lg:text-left">
            <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
              Prêt à transformer votre distribution ?
            </h2>
            <p className="text-zinc-400 text-sm">
              Essai gratuit de 30 jours. Aucune carte bancaire requise.
            </p>
          </div>
          <Link href="/register" className="inline-flex items-center gap-2 bg-white text-zinc-950 font-semibold px-6 py-3 rounded-lg text-sm hover:bg-zinc-100 transition-colors whitespace-nowrap">
            Commencer maintenant
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Links */}
      <div className="mx-auto max-w-[1200px] px-6 pb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-7 w-7 rounded-md bg-zinc-950 flex items-center justify-center">
                <span className="text-white text-xs font-bold">B</span>
              </div>
              <span className="text-sm font-bold text-zinc-950">B-Stock</span>
            </div>
            <p className="text-sm text-zinc-500 leading-relaxed max-w-xs">
              Gestion de distribution de boissons. Stocks, ventes, livraisons.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">Plateforme</h4>
            <ul className="space-y-2.5">
              <li><a href="#features" className="text-sm text-zinc-600 hover:text-zinc-950 transition-colors">Fonctionnalités</a></li>
              <li><a href="#pricing" className="text-sm text-zinc-600 hover:text-zinc-950 transition-colors">Tarifs</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">Ressources</h4>
            <ul className="space-y-2.5">
              <li><a href="#" className="text-sm text-zinc-600 hover:text-zinc-950 transition-colors">Guide d&apos;utilisation</a></li>
              <li><a href="#" className="text-sm text-zinc-600 hover:text-zinc-950 transition-colors">Support</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-4">Entreprise</h4>
            <ul className="space-y-2.5">
              <li><a href="#" className="text-sm text-zinc-600 hover:text-zinc-950 transition-colors">À propos</a></li>
              <li><a href="#" className="text-sm text-zinc-600 hover:text-zinc-950 transition-colors">Contact</a></li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-center pt-6 border-t border-zinc-200 gap-4">
          <p className="text-xs text-zinc-400">&copy; {new Date().getFullYear()} B-Stock. Tous droits réservés.</p>
          <div className="flex gap-5">
            <a href="#" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">C.G.U.</a>
            <a href="#" className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors">Confidentialité</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
