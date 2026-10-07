import Link from 'next/link'
import { WifiOff } from 'lucide-react'

export const metadata = {
  title: 'Hors ligne — B-Stock',
}

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/50 px-6 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
        <WifiOff className="h-6 w-6 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-bold text-foreground">Vous êtes hors ligne</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Impossible de joindre le serveur. Vérifiez votre connexion internet puis réessayez. Les
        pages déjà consultées restent accessibles.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary"
      >
        Réessayer
      </Link>
    </div>
  )
}
