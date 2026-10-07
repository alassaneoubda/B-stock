import type { Metadata } from 'next'
import { CheckCircle2, XCircle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Paiement Mobile Money — B-Stock',
  robots: { index: false, follow: false },
}

/**
 * Page de retour du client final après un paiement Mobile Money (lien envoyé
 * par un dépôt ou un maquis). Purement informative : le paiement n'est
 * enregistré qu'après vérification serveur auprès de GeniusPay.
 */
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { statut } = await searchParams
  const success = statut === 'succes'
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {success ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden="true" />
        ) : (
          <XCircle className="mx-auto h-12 w-12 text-destructive" aria-hidden="true" />
        )}
        <h1 className="text-xl font-semibold text-foreground">
          {success ? 'Merci, paiement transmis' : 'Paiement non abouti'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {success
            ? 'Votre fournisseur recevra la confirmation automatiquement. Vous pouvez fermer cette page.'
            : 'Aucun montant n’a été débité. Vous pouvez réessayer avec le même lien ou contacter votre fournisseur.'}
        </p>
      </div>
    </main>
  )
}
