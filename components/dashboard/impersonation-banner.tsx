'use client'

import { signOut } from 'next-auth/react'
import { ShieldAlert } from 'lucide-react'

export function ImpersonationBanner({ companyName }: { companyName: string }) {
  return (
    <div role="status" className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium">
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Mode assistance — vous agissez en tant que <strong>{companyName}</strong>. Vos actions sont journalisées.
      </span>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/admin/login' })}
        className="ml-2 rounded-md bg-amber-950/10 hover:bg-amber-950/20 px-2.5 py-1 text-xs font-semibold transition-colors"
      >
        Quitter l&apos;assistance
      </button>
    </div>
  )
}
