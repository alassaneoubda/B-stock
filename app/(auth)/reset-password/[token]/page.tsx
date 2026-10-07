import Link from 'next/link'
import { ArrowLeft, Clock, KeyRound } from 'lucide-react'
import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { ResetPasswordForm } from '@/components/auth/reset-password-form'
import { Button } from '@/components/ui/button'
import { inspectResetToken } from '@/lib/password-reset'

export const metadata = {
  title: 'Nouveau mot de passe — B-Stock',
  robots: { index: false, follow: false },
}

// Jeton à usage unique : jamais mis en cache
export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const state = /^[A-Za-z0-9_-]{20,200}$/.test(token)
    ? await inspectResetToken(token).catch(() => ({ valid: false as const }))
    : { valid: false as const }

  return (
    <AuthSplitLayout
      headline="Un nouveau départ, en toute sécurité."
      subline="Votre nouveau mot de passe ferme toutes les sessions ouvertes sur vos autres appareils."
      footer={
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour à la connexion
        </Link>
      }
    >
      {state.valid ? (
        <>
          <div className="mb-8 space-y-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">Choisir un nouveau mot de passe</h1>
              <p className="text-sm text-muted-foreground">
                Pour le compte <span className="font-medium text-foreground">{'email' in state ? state.email : ''}</span>.
              </p>
            </div>
          </div>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <div className="space-y-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-soft text-warning">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Lien expiré</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ce lien de réinitialisation a expiré ou a déjà été utilisé. Les liens sont valables 60 minutes et ne
              servent qu’une fois. Demandez-en un nouveau.
            </p>
          </div>
          <Button asChild className="h-11 w-full">
            <Link href="/forgot-password">Demander un nouveau lien</Link>
          </Button>
        </div>
      )}
    </AuthSplitLayout>
  )
}
