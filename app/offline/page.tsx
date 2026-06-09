import Link from 'next/link'
import { WifiOff } from 'lucide-react'

export const metadata = {
  title: 'Hors ligne — B-Stock',
}

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-200">
        <WifiOff className="h-6 w-6 text-zinc-600" />
      </div>
      <h1 className="text-xl font-bold text-zinc-900">Vous êtes hors ligne</h1>
      <p className="mt-2 max-w-sm text-sm text-zinc-500">
        Impossible de joindre le serveur. Vérifiez votre connexion internet puis réessayez. Les
        pages déjà consultées restent accessibles.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex h-10 items-center rounded-lg bg-zinc-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
      >
        Réessayer
      </Link>
    </div>
  )
}
