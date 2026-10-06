'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Permissions effectives de l'utilisateur, calculées côté serveur par le
 * layout du dashboard (relues en base, '*' = propriétaire). Sert uniquement à
 * masquer ce que l'utilisateur ne peut pas faire : l'API reste l'autorité.
 */
const PermissionsContext = createContext<readonly string[]>([])

export function PermissionsProvider({ permissions, children }: { permissions: string[]; children: ReactNode }) {
  return <PermissionsContext.Provider value={permissions}>{children}</PermissionsContext.Provider>
}

export function usePermissions() {
  const permissions = useContext(PermissionsContext)
  return {
    permissions,
    can: (permission: string) => permissions.includes('*') || permissions.includes(permission),
  }
}
