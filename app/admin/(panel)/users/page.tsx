'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Loader2, Search, KeyRound, ChevronLeft, ChevronRight, Copy } from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const ROLES = ['owner', 'manager', 'cashier', 'warehouse_keeper']

type User = {
  id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  auth_provider: string | null
  last_login_at: string | null
  company_id: string
  company_name: string
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<string | null>(null)
  const [resetInfo, setResetInfo] = useState<{ email: string; password: string } | null>(null)

  const qs = new URLSearchParams({ search, role, page: String(page) }).toString()
  const { data, isLoading, mutate } = useSWR<{
    data: User[]
    pagination: { page: number; pages: number; total: number }
  }>(`/api/admin/users?${qs}`, fetcher)

  const users = data?.data || []
  const pagination = data?.pagination

  async function patch(userId: string, body: any, key: string) {
    setBusy(key)
    try {
      await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      await mutate()
    } finally {
      setBusy(null)
    }
  }

  async function resetPassword(u: User) {
    if (!confirm(`Réinitialiser le mot de passe de ${u.email} ?`)) return
    setBusy('reset-' + u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}/reset-password`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) setResetInfo({ email: json.email, password: json.tempPassword })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-950">Utilisateurs</h1>
        <p className="text-sm text-zinc-500">
          {pagination ? `${pagination.total} utilisateur(s) — tous tenants` : 'Tous les tenants'}
        </p>
      </header>

      {resetInfo && (
        <Card className="p-4 mb-4 border-blue-200 bg-blue-50">
          <p className="text-sm text-blue-900 mb-2 font-medium">
            Mot de passe temporaire pour {resetInfo.email}
          </p>
          <div className="flex items-center gap-2">
            <code className="px-3 py-1.5 bg-white rounded border border-blue-200 text-sm font-mono">
              {resetInfo.password}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard?.writeText(resetInfo.password)}
            >
              <Copy className="h-4 w-4 mr-1.5" /> Copier
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResetInfo(null)}>
              Fermer
            </Button>
          </div>
          <p className="text-xs text-blue-700 mt-2">
            Communiquez-le à l&apos;utilisateur. Il ne sera plus affiché.
          </p>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Rechercher (email, nom, entreprise)…"
            className="pl-9 h-10"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value)
            setPage(1)
          }}
          className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm capitalize"
        >
          <option value="">Tous les rôles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
          </div>
        ) : users.length === 0 ? (
          <div className="py-20 text-center text-sm text-zinc-400">Aucun utilisateur</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Utilisateur</th>
                  <th className="px-5 py-3 font-medium">Entreprise</th>
                  <th className="px-5 py-3 font-medium">Rôle</th>
                  <th className="px-5 py-3 font-medium">Actif</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-zinc-900">{u.full_name}</p>
                      <p className="text-xs text-zinc-400">
                        {u.email}
                        {u.auth_provider === 'google' && ' · Google'}
                      </p>
                    </td>
                    <td className="px-5 py-3">
                      <Link href={`/admin/companies/${u.company_id}`} className="text-zinc-700 hover:underline">
                        {u.company_name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={u.role}
                        disabled={busy === 'role-' + u.id}
                        onChange={(e) => patch(u.id, { role: e.target.value }, 'role-' + u.id)}
                        className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs capitalize"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => patch(u.id, { isActive: !u.is_active }, 'active-' + u.id)}
                        disabled={busy === 'active-' + u.id}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          u.is_active ? 'bg-green-500' : 'bg-zinc-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            u.is_active ? 'translate-x-4' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resetPassword(u)}
                        disabled={busy === 'reset-' + u.id}
                      >
                        {busy === 'reset-' + u.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        MDP
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-zinc-500">
            Page {pagination.page} / {pagination.pages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-zinc-200 bg-white disabled:opacity-40 hover:bg-zinc-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-zinc-200 bg-white disabled:opacity-40 hover:bg-zinc-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
