'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { signIn } from 'next-auth/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  ArrowLeft,
  Ban,
  CheckCircle2,
  LogIn,
  Trash2,
  CalendarPlus,
  Save,
} from 'lucide-react'

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const xof = (n: number) => new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'

function toDateInput(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

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

  const [formPlan, setFormPlan] = useState('')
  const [formStatus, setFormStatus] = useState('active')
  const [durationMode, setDurationMode] = useState<'months' | 'date' | 'unlimited'>('months')
  const [formMonths, setFormMonths] = useState('1')
  const [formEndsAt, setFormEndsAt] = useState('')
  const [formPaymentMethod, setFormPaymentMethod] = useState('especes')
  const [formAmount, setFormAmount] = useState('')
  const [formNote, setFormNote] = useState('')
  const [trialDays, setTrialDays] = useState('14')

  useEffect(() => {
    if (!company) return
    setFormPlan(company.subscription_plan_name || plans[0]?.name || '')
    setFormStatus(company.subscription_status || 'active')
    if (!company.subscription_ends_at && company.subscription_status === 'active') {
      setDurationMode('unlimited')
    } else if (company.subscription_ends_at) {
      setDurationMode('date')
      setFormEndsAt(toDateInput(company.subscription_ends_at))
    } else if (company.trial_ends_at && company.subscription_status === 'trialing') {
      setDurationMode('date')
      setFormEndsAt(toDateInput(company.trial_ends_at))
    } else {
      setDurationMode('months')
      setFormMonths('1')
    }
  }, [
    company?.id,
    company?.subscription_plan_name,
    company?.subscription_status,
    company?.subscription_ends_at,
    company?.trial_ends_at,
    plans,
  ])

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

  async function saveSubscription(e: React.FormEvent) {
    e.preventDefault()
    if (!formPlan) {
      setMsg({ type: 'err', text: 'Choisissez un plan' })
      return
    }

    const payload: Record<string, unknown> = {
      action: 'set_plan',
      planName: formPlan,
      status: formStatus,
      paymentMethod: formPaymentMethod,
      note: formNote || null,
      amount: formAmount === '' ? 0 : Number(formAmount),
    }

    if (durationMode === 'unlimited') {
      payload.unlimited = true
      payload.endsAt = null
    } else if (durationMode === 'date') {
      if (!formEndsAt) {
        setMsg({ type: 'err', text: 'Indiquez une date de fin' })
        return
      }
      payload.endsAt = new Date(formEndsAt + 'T23:59:59').toISOString()
    } else {
      payload.months = parseInt(formMonths, 10) || 1
    }

    const json = await call(`/api/admin/companies/${id}`, payload, 'save-sub')
    if (json?.success) {
      setMsg({
        type: 'ok',
        text: 'Abonnement mis à jour (paiement hors plateforme / manuel)',
      })
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
    if (!confirm('Se connecter en tant que cette entreprise ? Vous quitterez le back office.')) return
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
    if (!confirm('Supprimer DÉFINITIVEMENT cette entreprise ? Cette action est irréversible.')) return
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

  const planLabel = plan?.display_name || company.subscription_plan_name || '—'

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

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Usage label="Utilisateurs" value={usage?.users} />
        <Usage label="Dépôts" value={usage?.depots} />
        <Usage label="Produits" value={usage?.products} />
        <Usage label="Clients" value={usage?.clients} />
        <Usage label="Commandes" value={usage?.orders} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <h2 className="text-sm font-semibold text-zinc-950 mb-1">Abonnement</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Pour un paiement hors plateforme (espèces, virement, Mobile Money…) : choisissez l’offre et une durée personnalisée.
          </p>

          <dl className="space-y-2 text-sm mb-5">
            <Row label="Statut" value={<span className="capitalize">{company.subscription_status}</span>} />
            <Row label="Plan" value={<span className="capitalize">{planLabel}</span>} />
            <Row
              label="Fin d'essai"
              value={company.trial_ends_at ? new Date(company.trial_ends_at).toLocaleDateString('fr-FR') : '—'}
            />
            <Row
              label="Fin d'abonnement"
              value={
                company.subscription_ends_at
                  ? new Date(company.subscription_ends_at).toLocaleDateString('fr-FR')
                  : company.subscription_status === 'active'
                    ? 'Illimité'
                    : '—'
              }
            />
            {plan && <Row label="Prix catalogue" value={xof(Number(plan.price_monthly))} />}
          </dl>

          <form onSubmit={saveSubscription} className="space-y-4 border-t border-zinc-100 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="plan">Offre</Label>
              <select
                id="plan"
                value={formPlan}
                onChange={(e) => setFormPlan(e.target.value)}
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
              >
                {plans.map((p: any) => (
                  <option key={p.name} value={p.name}>
                    {(p.display_name || p.name) + ` — ${xof(Number(p.price_monthly))}/mois`}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">Statut</Label>
              <select
                id="status"
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
                className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
              >
                <option value="active">Actif (payé)</option>
                <option value="trialing">Essai</option>
                <option value="past_due">Impayé / en retard</option>
                <option value="canceled">Annulé</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Durée</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(
                  [
                    ['months', 'Par mois'],
                    ['date', 'Date de fin'],
                    ['unlimited', 'Illimité'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDurationMode(value)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                      durationMode === value
                        ? 'bg-zinc-950 text-white border-zinc-950'
                        : 'bg-white text-zinc-600 border-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {durationMode === 'months' && (
                <div className="flex flex-wrap gap-2 items-center">
                  {[1, 3, 6, 12].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFormMonths(String(m))}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                        formMonths === String(m)
                          ? 'bg-orange-50 text-orange-700 border-orange-200'
                          : 'bg-white text-zinc-600 border-zinc-200'
                      }`}
                    >
                      {m} mois
                    </button>
                  ))}
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={formMonths}
                    onChange={(e) => setFormMonths(e.target.value)}
                    className="h-9 w-24"
                    aria-label="Nombre de mois"
                  />
                </div>
              )}

              {durationMode === 'date' && (
                <Input
                  type="date"
                  value={formEndsAt}
                  onChange={(e) => setFormEndsAt(e.target.value)}
                  className="h-10"
                  required
                />
              )}

              {durationMode === 'unlimited' && (
                <p className="text-xs text-zinc-500">Accès sans date d’expiration (jusqu’à annulation manuelle).</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pay">Moyen de paiement</Label>
                <select
                  id="pay"
                  value={formPaymentMethod}
                  onChange={(e) => setFormPaymentMethod(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
                >
                  <option value="especes">Espèces</option>
                  <option value="virement">Virement</option>
                  <option value="mobile_money">Mobile Money</option>
                  <option value="cheque">Chèque</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Montant reçu (FCFA)</Label>
                <Input
                  id="amount"
                  type="number"
                  min={0}
                  placeholder="Optionnel"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">Note interne</Label>
              <Input
                id="note"
                placeholder="Ex. payé en liquide le 17/08 chez le commercial"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                className="h-10"
              />
            </div>

            <Button type="submit" disabled={busy === 'save-sub'} className="w-full sm:w-auto">
              {busy === 'save-sub' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Enregistrer l&apos;abonnement
            </Button>
          </form>

          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-zinc-100">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={365}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                className="h-9 w-20"
                aria-label="Jours d'essai"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  call(
                    `/api/admin/companies/${id}`,
                    { action: 'extend_trial', days: parseInt(trialDays, 10) || 14 },
                    'trial'
                  )
                }
                disabled={!!busy}
              >
                <CalendarPlus className="h-4 w-4 mr-1.5" /> Prolonger l&apos;essai
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => call(`/api/admin/companies/${id}`, { action: 'set_status', status: 'canceled' }, 'cancel')}
              disabled={!!busy}
            >
              Annuler l&apos;abonnement
            </Button>
          </div>
        </Card>

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
