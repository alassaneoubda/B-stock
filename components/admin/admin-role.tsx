'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { AdminCapability, AdminRole } from '@/lib/admin-auth'

/**
 * Rôle de l'administrateur connecté, relu en base par le layout du back-office.
 * Sert uniquement à masquer ce que le rôle ne permet pas : l'API reste l'autorité.
 */
type AdminContextValue = { role: AdminRole; capabilities: AdminCapability[] | '*'; adminId: string }

const AdminContext = createContext<AdminContextValue>({ role: 'support', capabilities: [], adminId: '' })

export function AdminRoleProvider({ value, children }: { value: AdminContextValue; children: ReactNode }) {
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  return {
    ...ctx,
    can: (capability: AdminCapability) => ctx.capabilities === '*' || ctx.capabilities.includes(capability),
  }
}
