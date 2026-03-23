import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { ArrowRight, Shield, Zap, BarChart3 } from 'lucide-react'

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-28 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-50 via-white to-zinc-50/50" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(59,130,246,0.08),transparent)]" />

      <div className="mx-auto max-w-[1200px] px-6 relative z-10">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-xs font-semibold text-blue-600 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            Moins de pertes, plus de ventes.
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-zinc-950 leading-[1.1] mb-6">
            La plateforme de gestion{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500">
              pour distributeurs de boissons
            </span>
          </h1>

          <p className="text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed">
            Stock, ventes, emballages consignés, clients et livraisons — tout dans une seule plateforme conçue pour les distributeurs Solibra &amp; Brassivoire en Côte d&apos;Ivoire.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/register">
              <Button className="h-12 px-7 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5">
                Commencer gratuitement
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" className="h-12 px-7 rounded-xl border-zinc-300 text-zinc-700 hover:bg-zinc-50 text-sm font-semibold">
                Voir les fonctionnalités
              </Button>
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="mt-10 flex items-center justify-center gap-6 text-xs text-zinc-400 font-medium">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              <span>Données sécurisées</span>
            </div>
            <div className="h-3 w-px bg-zinc-200" />
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              <span>Essai gratuit 30 jours</span>
            </div>
            <div className="h-3 w-px bg-zinc-200 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Rapports en temps réel</span>
            </div>
          </div>
        </div>

        {/* Dashboard Screenshot */}
        <div className="mt-16 lg:mt-20 max-w-5xl mx-auto">
          <div className="relative group">
            {/* Glow effect behind */}
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-blue-500/10 rounded-2xl blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            
            {/* Browser chrome */}
            <div className="relative bg-white rounded-xl shadow-2xl shadow-zinc-300/40 border border-zinc-200/80 overflow-hidden">
              {/* Browser bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-zinc-50 border-b border-zinc-200/60">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-amber-400" />
                  <div className="h-3 w-3 rounded-full bg-emerald-400" />
                </div>
                <div className="flex-1 mx-8">
                  <div className="bg-white rounded-md border border-zinc-200 px-4 py-1.5 text-xs text-zinc-400 font-medium max-w-xs mx-auto text-center">
                    app.b-stock.ci/dashboard
                  </div>
                </div>
              </div>
              
              {/* Screenshot */}
              <img
                src="/images/presentation.png"
                alt="B-Stock — Tableau de bord de gestion de distribution"
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
