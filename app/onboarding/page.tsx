import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AuthProvider } from '@/components/providers/session-provider'
import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { OnboardingForm } from '@/components/auth/onboarding-form'

export default async function OnboardingPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  // Already onboarded (existing accounts / email sign-ups) -> straight to dashboard
  if (session.user.onboardingCompleted !== false) {
    redirect('/dashboard')
  }

  const firstName = session.user.name?.split(' ')[0]

  return (
    <AuthSplitLayout
      headline="Votre espace est presque prêt."
      subline="Encore une information et vous pourrez enregistrer vos produits, vos clients et vos premières ventes."
    >
      <div className="mb-8 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Dernière étape</p>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Bienvenue{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">Comment s’appelle votre entreprise ?</p>
        </div>
      </div>

      <AuthProvider>
        <OnboardingForm defaultName={session.user.companyName} />
      </AuthProvider>
    </AuthSplitLayout>
  )
}
