import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AuthProvider } from '@/components/providers/session-provider'
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-6 py-12">
      <div className="w-full max-w-[440px] space-y-8">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white text-sm font-bold">B</span>
          </div>
          <span className="text-xl font-bold text-foreground">B-Stock</span>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">
            Bienvenue, {session.user.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-muted-foreground">
            Dernière étape : comment s&apos;appelle votre entreprise ?
          </p>
        </div>

        <AuthProvider>
          <OnboardingForm defaultName={session.user.companyName} />
        </AuthProvider>
      </div>
    </div>
  )
}
