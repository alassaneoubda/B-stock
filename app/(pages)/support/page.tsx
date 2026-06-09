import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail, Phone, BookOpen, MessageCircle, Clock } from 'lucide-react'
import { getSettings } from '@/lib/settings'

export const metadata: Metadata = {
  title: 'Support — B-Stock',
  description: "Obtenez de l'aide sur B-Stock : contact, FAQ et ressources.",
}

const faqs = [
  {
    q: 'Comment démarrer mon essai gratuit ?',
    a: 'Cliquez sur « Créer un compte » depuis la page d’accueil, renseignez votre entreprise et vous accédez immédiatement à votre tableau de bord.',
  },
  {
    q: 'Comment fonctionne le paiement ?',
    a: 'À la fin de l’essai, vous choisissez une formule. Les paiements sont sécurisés et facturés en francs CFA (XOF) via GeniusPay.',
  },
  {
    q: 'Puis-je gérer plusieurs dépôts ?',
    a: 'Oui. Vous pouvez créer plusieurs dépôts, suivre le stock par dépôt et effectuer des transferts entre eux.',
  },
  {
    q: 'Comment ajouter mes collaborateurs ?',
    a: 'Dans Paramètres → Utilisateurs, invitez vos collaborateurs et attribuez-leur un rôle (gérant, caissier, magasinier).',
  },
  {
    q: 'Mes données sont-elles en sécurité ?',
    a: 'Vos données sont chiffrées en transit, cloisonnées par entreprise et protégées par un contrôle d’accès par rôle. Voir notre politique de confidentialité.',
  },
]

export default async function SupportPage() {
  const settings = await getSettings()
  const email = settings.support_email || 'support@b-stock.ci'
  const phone = settings.support_phone

  return (
    <div>
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-zinc-200/60 bg-gradient-to-b from-zinc-50 to-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-20%,rgba(59,130,246,0.08),transparent)]" />
        <div className="relative mx-auto max-w-4xl px-6 py-14 sm:py-20 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-950">Comment pouvons-nous aider ?</h1>
          <p className="mt-3 text-lg text-zinc-500 max-w-2xl mx-auto leading-relaxed">
            Une question, un blocage ? Notre équipe est là pour vous accompagner.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        {/* Contact channels */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
          <a
            href={`mailto:${email}`}
            className="group rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 hover:shadow-sm transition-all"
          >
            <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <Mail className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-zinc-950">E-mail</h3>
            <p className="text-sm text-zinc-500 mt-1 break-all">{email}</p>
          </a>

          {phone ? (
            <a
              href={`tel:${phone.replace(/\s/g, '')}`}
              className="group rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 hover:shadow-sm transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center mb-3">
                <Phone className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-zinc-950">Téléphone</h3>
              <p className="text-sm text-zinc-500 mt-1">{phone}</p>
            </a>
          ) : (
            <Link
              href="/contact"
              className="group rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 hover:shadow-sm transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-green-50 text-green-600 flex items-center justify-center mb-3">
                <MessageCircle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-zinc-950">Nous écrire</h3>
              <p className="text-sm text-zinc-500 mt-1">Via le formulaire de contact</p>
            </Link>
          )}

          <Link
            href="/guide"
            className="group rounded-xl border border-zinc-200 p-5 hover:border-zinc-300 hover:shadow-sm transition-all"
          >
            <div className="h-10 w-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
              <BookOpen className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold text-zinc-950">Guide d&apos;utilisation</h3>
            <p className="text-sm text-zinc-500 mt-1">Prise en main pas à pas</p>
          </Link>
        </div>

        {/* Hours */}
        <div className="flex items-start gap-3 rounded-xl bg-zinc-50 border border-zinc-200/70 p-5 mb-14">
          <Clock className="h-5 w-5 text-zinc-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-zinc-900">Horaires du support</p>
            <p className="text-sm text-zinc-500 mt-0.5">
              Du lundi au vendredi, 8h–18h (GMT, Abidjan). Les clients des formules supérieures
              bénéficient d&apos;un support prioritaire.
            </p>
          </div>
        </div>

        {/* FAQ */}
        <h2 className="text-xl font-bold text-zinc-950 mb-5">Questions fréquentes</h2>
        <div className="space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group rounded-xl border border-zinc-200 p-5 [&_summary]:cursor-pointer">
              <summary className="flex items-center justify-between text-sm font-semibold text-zinc-900 list-none">
                {f.q}
                <span className="text-zinc-400 group-open:rotate-180 transition-transform">⌄</span>
              </summary>
              <p className="mt-3 text-sm text-zinc-600 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
