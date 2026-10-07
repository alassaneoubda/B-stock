import type { CmsFaq } from '@/lib/cms'

const DEFAULT_FAQ: CmsFaq[] = [
  { id: 'f1', sort_order: 1, question: 'Faut-il installer quelque chose ?', answer: 'Non. B-Stock fonctionne dans le navigateur d’un ordinateur, d’une tablette ou d’un téléphone. Vous pouvez aussi l’ajouter à l’écran d’accueil comme une application.' },
  { id: 'f2', sort_order: 2, question: 'Comment se passe l’essai gratuit ?', answer: 'Vous créez votre compte sans carte bancaire et vous avez accès à toutes les fonctionnalités pendant la durée de l’essai. À la fin, vous choisissez une formule ou vous arrêtez simplement.' },
  { id: 'f3', sort_order: 3, question: 'Comment payer l’abonnement ?', answer: 'Par Mobile Money (Wave, Orange Money, MTN, Moov) ou par carte, via notre prestataire de paiement sécurisé GeniusPay.' },
  { id: 'f4', sort_order: 4, question: 'Mes données sont-elles en sécurité ?', answer: 'Chaque entreprise ne voit que ses propres données, les connexions sont chiffrées et chaque employé n’accède qu’aux écrans autorisés par son rôle. Les opérations sensibles sont tracées.' },
  { id: 'f5', sort_order: 5, question: 'Est-ce adapté à un maquis ou un bar ?', answer: 'Oui. Le point de vente gère les tables, les commandes en attente, l’encaissement rapide avec calcul de la monnaie et l’ardoise des habitués.' },
  { id: 'f6', sort_order: 6, question: 'Puis-je gérer plusieurs dépôts ?', answer: 'Oui, avec le stock par dépôt, les transferts entre dépôts et des droits par employé.' },
]

export function LandingFaq({ items }: { items: CmsFaq[] }) {
  const faq = items.length ? items : DEFAULT_FAQ
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border bg-card py-20 lg:py-24">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <p className="text-sm font-semibold text-brand-strong">Questions fréquentes</p>
          <h2 className="mt-3 text-balance text-[clamp(1.75rem,3.2vw,2.5rem)] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            Vous vous posez la question ?
          </h2>
          <p className="mt-4 text-muted-foreground">
            Une autre question ?{' '}
            <a href="/contact" className="font-medium text-foreground underline underline-offset-4">
              Écrivez-nous
            </a>
            , nous répondons rapidement.
          </p>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {faq.map((item) => (
            <details key={item.id} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-transform duration-200 group-open:rotate-45"
                  aria-hidden="true"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
