'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import { useAuthModal } from '@/components/auth/auth-modal'

export function HeroCta() {
  const { open } = useAuthModal()

  return (
    <div className="mt-9 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
      <Button
        onClick={() => open('register')}
        className="h-12 px-7 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5"
      >
        Commencer gratuitement
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
      <Link href="#features">
        <Button
          variant="outline"
          className="h-12 px-7 rounded-xl border-zinc-300 text-zinc-700 hover:bg-zinc-50 text-sm font-semibold"
        >
          Voir les fonctionnalités
        </Button>
      </Link>
    </div>
  )
}
