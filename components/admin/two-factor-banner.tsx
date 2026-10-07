'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import useSWR from 'swr'
import { ShieldAlert, ArrowRight } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

type AccountResponse = { data: { email: string; full_name: string; role: string; totp_enabled: boolean } }

/** Clé SWR partagée : la page « Mon compte » la revalide après activation de la 2FA. */
export const ADMIN_ACCOUNT_KEY = '/api/admin/account'

/**
 * Bandeau persistant : un super-administrateur sans double authentification
 * expose toute la plateforme. À monter dans l'en-tête du back-office.
 */
export function TwoFactorBanner() {
  const pathname = usePathname()
  const { data } = useSWR<AccountResponse>(ADMIN_ACCOUNT_KEY, (url: string) => apiFetch(url), {
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  })
  const account = data?.data
  if (!account || account.role !== 'super_admin' || account.totp_enabled) return null

  const onAccountPage = pathname === '/admin/account'

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-warning/30 bg-warning-soft px-4 py-2.5 text-sm text-warning-foreground sm:px-6"
    >
      <p className="flex min-w-0 flex-1 items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold">Double authentification désactivée.</span> Votre compte super-administrateur
          donne accès à toute la plateforme : protégez-le avec un code à usage unique.
        </span>
      </p>
      {!onAccountPage && (
        <Link
          href="/admin/account#securite"
          className="inline-flex shrink-0 items-center gap-1 rounded-md font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Activer maintenant <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
