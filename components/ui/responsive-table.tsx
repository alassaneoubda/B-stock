'use client'

import React from 'react'

interface ResponsiveTableProps {
  children: React.ReactNode
  mobileCards: React.ReactNode
  className?: string
}

export function ResponsiveTable({ children, mobileCards, className = '' }: ResponsiveTableProps) {
  return (
    <div className={className}>
      {/* Desktop: normal table */}
      <div className="hidden md:block overflow-x-auto">
        {children}
      </div>
      {/* Mobile: card view */}
      <div className="md:hidden">
        {mobileCards}
      </div>
    </div>
  )
}

interface MobileCardProps {
  children: React.ReactNode
  onClick?: () => void
  href?: string
  className?: string
}

export function MobileCard({ children, className = '' }: MobileCardProps) {
  return (
    <div className={`p-4 border-b border-zinc-100 last:border-b-0 active:bg-zinc-50 transition-colors ${className}`}>
      {children}
    </div>
  )
}

interface MobileCardRowProps {
  label: string
  children: React.ReactNode
  className?: string
}

export function MobileCardRow({ label, children, className = '' }: MobileCardRowProps) {
  return (
    <div className={`flex items-center justify-between py-0.5 ${className}`}>
      <span className="text-xs text-zinc-500">{label}</span>
      <div className="text-sm text-zinc-900">{children}</div>
    </div>
  )
}
