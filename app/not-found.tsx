import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata = { title: 'Page introuvable — B-Stock' }

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Erreur 404</p>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">Cette page n&apos;existe pas</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Le lien est peut-être incorrect ou la page a été déplacée.
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/dashboard">Mon tableau de bord</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Accueil</Link>
        </Button>
      </div>
    </main>
  )
}
