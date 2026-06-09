'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { signIn } from 'next-auth/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  ArrowLeft,
  Ban,
  CheckCircle2,
  LogIn,
  Trash2,
  CalendarPlus,
} from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const xof = (n: number) => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'

export default function AdminCompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data, isLoading, mutate } = useSWR<any>(`/api/admin/companies/${id}`, fetcher)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const company = data?.data?.company
  const usage = data?.data?.usage
  const users = data?.data?.users || []
  const plan = data?.data?.plan
  const plans = data?.data?.plans || []

  async function call(url: string, body: any, label: string) {
    setBusy(label)
    setMsg(null)
    try {
      const res = await fetch(url, {
        method: body?._method || 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: body?._method === 'DELETE' ? undefined : JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        setMsg({ type: 'err', text: json.error || 'Erreur' })
        return null
      }
      setMsg({ type: 'ok', text: 'Action effectuée' })
      await mutate()
      return json
    } catch {
      setMsg({ type: 'err', text: 'Erreur réseau' })
      return null
    } finally {
      setBusy(null)
    }
  }

  async function suspend(suspendIt: boolean) {
    let reason: string | null = null
    if (suspendIt) {
      reason = window.prompt('Motif de la suspension (optionnel) :') || null
    }
    await fetch(`/api/admin/companies/${id}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspend: suspendIt, reason }),
    })
    await mutate()
    setMsg({ type: 'ok', text: suspendIt ? 'Entreprise suspendue' : 'Entreprise réactivée' })
  }

  async function impersonate() {
    if (!confirm("Se connecter en tant que cette entreprise ? Vous quitterez le back office.")) return
    setBusy('impersonate')
    try {
      const res = await fetch(`/api/admin/companies/${id}/impersonate`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setMsg({ type: 'err', text: json.error || 'Erreur' })
        setBusy(null)
        return
      }
      await signIn('impersonate', { token: json.token, callbackUrl: '/dashboard' })
    } catch {
      setMsg({ type: 'err', text: 'Erreur' })
      setBusy(null)
    }
  }

  async function remove() {
    if (!confirm("Supprimer DÉFINITIVEMENT cette entreprise ? Cette action est irréversible.")) return
    const json = await call(`/api/admin/companies/${id}`, { _method: 'DELETE' }, 'delete')
    if (json?.success) router.push('/admin/companies')
  }

  if (isLoading || !company) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <Link href="/admin/companies" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 mb-4">
        <ArrowLeft className="h-4 w-4" /> Entreprises
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-zinc-950">{company.name}</h1>
            {company.is_suspended ? (
              <Badge className="bg-red-100 text-red-700">Suspendue</Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 capitalize">{company.subscription_status}</Badge>
            )}
          </div>
          <p className="text-sm text-zinc-500">{company.email || 'Sans email'}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={impersonate} disabled={busy === 'impersonate'}>
            {busy === 'impersonate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4 mr-1.5" />}
            Se connecter en tant que
          </Button>
          {company.is_suspended ? (
            <Button onClick={() => suspend(false)} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Réactiver
            </Button>
          ) : (
            <Button onClick={() => suspend(true)} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
              <Ban className="h-4 w-4 mr-1.5" /> Suspendre
            </Button>
          )}
        </div>
      </div>

      {msg && (
        <div
          className={`rounded-lg p-3 text-sm font-medium mb-5 ${
            msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Usage */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Usage label="Utilisateurs" value={usage?.users} />
        <Usage label="Dépôts" value={usage?.depots} />
        <Usage label="Produits" value={usage?.products} />
        <Usage label="Clients" value={usage?.clients} />
        <Usage label="Commandes" value={usage?.orders} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Abonnement */}
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-zinc-950 mb-4">Abonnement</h2>
          <dl className="space-y-2 text-sm mb-4">
            <Row label="Statut" value={<span className="capitalize">{company.subscription_status}</span>} />
            <Row label="Plan" value={<span className="capitalize">{company.subscription_plan_name || '—'}</span>} />
            <Row
              label="Fin d'essai"
              value={company.trial_ends_at ? new Date(company.trial_ends_at).toLocaleDateString('fr-FR') : '—'}
            />
            {plan && <Row label="Prix" value={xof(Number(plan.price_monthly))} />}
          </dl>

          <div className="space-y-3 pt-3 border-t border-zinc-100">
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1.5">Changer de plan</p>
              <div className="flex flex-wrap gap-2">
                {plans.map((p: any) => (
                  <button
                    key={p.name}
                    onClick={() => call(`/api/admin/companies/${id}`, { action: 'set_plan', planName: p.name }, 'plan-' + p.name)}
                    disabled={!!busy}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 text-sm capitalize hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => call(`/api/admin/companies/${id}`, { action: 'extend_trial', days: 14 }, 'trial')}
                disabled={!!busy}
              >
                <CalendarPlus className="h-4 w-4 mr-1.5" /> +14 j d&apos;essai
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => call(`/api/admin/companies/${id}`, { action: 'set_status', status: 'canceled' }, 'cancel')}
                disabled={!!busy}
              >
                Annuler l&apos;abonnement
              </Button>
            </div>
          </div>
        </Card>

        {/* Zone dangereuse */}
        <Card className="p-6 border-red-100">
          <h2 className="text-sm font-semibold text-red-600 mb-2">Zone sensible</h2>
          <p className="text-sm text-zinc-500 mb-4">
            La suppression est définitive. Préférez la suspension si vous comptez réactiver plus tard.
          </p>
          <Button onClick={remove} variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" disabled={busy === 'delete'}>
            {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
            Supprimer l&apos;entreprise
          </Button>
        </Card>
      </div>

      {/* Utilisateurs */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-zinc-950">Utilisateurs ({users.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 uppercase tracking-wide">
                <th className="px-5 py-2.5 font-medium">Nom</th>
                <th className="px-5 py-2.5 font-medium">Rôle</th>
                <th className="px-5 py-2.5 font-medium">Statut</th>
                <th className="px-5 py-2.5 font-medium">Dernière connexion</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className="border-b border-zinc-50">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-zinc-900">{u.full_name}</p>
                    <p className="text-xs text-zinc-400">{u.email}</p>
                  </td>
                  <td className="px-5 py-2.5 capitalize text-zinc-700">{u.role}</td>
                  <td className="px-5 py-2.5">
                    {u.is_active ? (
                      <span className="text-green-600 text-xs font-medium">Actif</span>
                    ) : (
                      <span className="text-zinc-400 text-xs font-medium">Inactif</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-zinc-500">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleString('fr-FR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function Usage({ label, value }: { label: string; value?: number }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-bold text-zinc-950">{value ?? 0}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-zinc-900">{value}</dd>
    </div>
  )
}
