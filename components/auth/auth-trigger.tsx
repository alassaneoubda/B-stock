'use client'

import { useAuthModal } from '@/components/auth/auth-modal'

type Mode = 'login' | 'register'

export function AuthTrigger({
  mode = 'register',
  className,
  children,
}: {
  mode?: Mode
  className?: string
  children: React.ReactNode
}) {
  const { open } = useAuthModal()
  return (
    <button type="button" onClick={() => open(mode)} className={className}>
      {children}
    </button>
  )
}
