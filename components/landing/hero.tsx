import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export function Hero() {
  return (
    <section className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 overflow-hidden bg-gradient-to-b from-zinc-50 to-white">
      <div className="mx-auto max-w-[1200px] px-6 relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-100 border border-zinc-200 text-xs font-medium text-zinc-600 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Plateforme de gestion pour distributeurs de boissons
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-zinc-950 leading-[1.1] mb-6">
            Gérez votre distribution{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-blue-500">
              avec précision
            </span>
          </h1>

          <p className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed">
            Stock, ventes, emballages consignés, clients et livraisons — tout dans une seule plateforme conçue pour les distributeurs Solibra &amp; Brassivoire.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register">
              <Button className="h-11 px-6 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white text-sm font-semibold shadow-sm">
                Commencer gratuitement
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" className="h-11 px-6 rounded-lg border-zinc-300 text-zinc-700 hover:bg-zinc-50 text-sm font-semibold">
                Voir les fonctionnalités
              </Button>
            </Link>
          </div>
        </div>

        {/* Dashboard Preview */}
        <div className="mt-16 lg:mt-24 max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-2xl shadow-zinc-200/60 border border-zinc-200/80 p-5 sm:p-8">
            <div className="flex items-center justify-between mb-6 pb-5 border-b border-zinc-100">
              <div>
                <p className="text-xs font-medium text-zinc-400 mb-1">Stock total (casiers)</p>
                <div className="flex items-baseline gap-3">
                  <h3 className="text-3xl sm:text-4xl font-bold text-zinc-950 tracking-tight">84 592</h3>
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">+12%</span>
                </div>
              </div>
              <div className="hidden sm:block">
                <div className="bg-amber-50 px-4 py-3 rounded-lg border border-amber-200/60">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-0.5">Alerte stock</p>
                  <p className="text-sm font-semibold text-zinc-950">Bock 65cl — Dépôt Sud</p>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="h-40 sm:h-48 w-full flex items-end gap-1.5 sm:gap-2.5">
              {[40, 50, 45, 60, 75, 85, 70, 90, 80, 100, 85, 95].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end group cursor-pointer">
                  <div
                    className={`w-full rounded-sm transition-all duration-300 ${i === 9 ? 'bg-blue-500' : 'bg-zinc-100 group-hover:bg-zinc-200'}`}
                    style={{ height: `${h}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-3 text-[10px] font-medium text-zinc-300">
              <span>Jan</span><span>Fév</span><span>Mar</span><span>Avr</span><span>Mai</span><span>Juin</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
