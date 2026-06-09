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
    <div className="min-h-screen flex items-center justify-center bg-zinc-50/50 px-6 py-12">
      <div className="w-full max-w-[440px] space-y-8">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-zinc-950 flex items-center justify-center">
            <span className="text-white text-sm font-bold">B</span>
          </div>
          <span className="text-xl font-bold text-zinc-950">B-Stock</span>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-zinc-950 mb-1">
            Bienvenue, {session.user.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-zinc-500">
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
