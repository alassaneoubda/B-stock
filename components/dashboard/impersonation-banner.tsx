'use client'

import { signOut } from 'next-auth/react'
import { ShieldAlert } from 'lucide-react'

export function ImpersonationBanner({ companyName }: { companyName: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-warning/40 bg-warning-soft px-4 py-2 text-sm text-warning-foreground">
      <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong className="font-semibold">Mode assistance</strong> — vous agissez en tant que <strong className="font-semibold">{companyName}</strong>. Vos actions sont journalisées.
      </span>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: '/admin/login' })}
        className="rounded-md border border-warning/50 bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Quitter l&apos;assistance
      </button>
    </div>
  )
}
