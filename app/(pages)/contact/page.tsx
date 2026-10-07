import type { Metadata } from 'next'
import { Mail, Phone, MapPin } from 'lucide-react'
import { getSettings } from '@/lib/settings'
import { ContactForm } from '@/components/marketing/contact-form'

export const metadata: Metadata = {
  title: 'Contact — B-Stock',
  description: 'Contactez l’équipe B-Stock.',
}

export default async function ContactPage() {
  const settings = await getSettings()
  const email = settings.support_email || 'support@b-stock.ci'
  const phone = settings.support_phone

  return (
    <div>
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border bg-gradient-to-b from-zinc-50 to-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-20%,rgba(59,130,246,0.08),transparent)]" />
        <div className="relative mx-auto max-w-4xl px-6 py-14 sm:py-20 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Contactez-nous</h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Une question, une démo, un partenariat ? Écrivez-nous, nous vous répondons rapidement.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16 grid lg:grid-cols-[1fr_1.4fr] gap-10">
        {/* Coordonnées */}
        <div className="space-y-5">
          <h2 className="text-lg font-bold text-foreground">Nos coordonnées</h2>

          <a href={`mailto:${email}`} className="flex items-start gap-3 group">
            <div className="h-10 w-10 rounded-lg bg-brand-soft text-brand-strong flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">E-mail</p>
              <p className="text-sm text-muted-foreground break-all group-hover:text-foreground transition-colors">{email}</p>
            </div>
          </a>

          {phone && (
            <a href={`tel:${phone.replace(/\s/g, '')}`} className="flex items-start gap-3 group">
              <div className="h-10 w-10 rounded-lg bg-success-soft text-success flex items-center justify-center shrink-0">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Téléphone</p>
                <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{phone}</p>
              </div>
            </a>
          )}

          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning-soft text-warning-foreground flex items-center justify-center shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Adresse</p>
              <p className="text-sm text-muted-foreground">Abidjan, Côte d&apos;Ivoire</p>
            </div>
          </div>
        </div>

        {/* Formulaire */}
        <div className="rounded-xl border border-border p-6 sm:p-8">
          <h2 className="text-lg font-bold text-foreground mb-5">Envoyez-nous un message</h2>
          <ContactForm email={email} />
        </div>
      </div>
    </div>
  )
}
