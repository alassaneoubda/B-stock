'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import { ApiError, apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/permissions'
import { ErrorState, TableSkeleton } from '@/components/states'

const fetcher = (url: string) => apiFetch(url)

const STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  trialing: 'Essai',
  past_due: 'Impayé',
  canceled: 'Annulé',
}
const statusLabel = (s?: string | null) => (s ? STATUS_LABELS[s] || s : '—')
const roleLabel = (r: string) => (ROLE_LABELS as Record<string, string>)[r] || r

/** Date (ISO) → valeur d'un <input type="date"> en heure locale. */
function toDateInput(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type Pending = 'impersonate' | 'suspend' | 'cancel' | 'trial' | 'delete'

export default function AdminCompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR<any>(`/api/admin/companies/${id}`, fetcher)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')

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

  /** Mutation générique : toast de succès, erreur serveur affichée, rechargement. */
  async function call(
    url: string,
    init: { method: 'PATCH' | 'POST' | 'DELETE'; body?: unknown },
    label: string,
    success: string,
    errorTitle = 'Action impossible'
  ) {
    if (busy) return null
    setBusy(label)
    try {
      const json = await apiFetch(url, init)
      toast.success(success)
      if (init.method !== 'DELETE') await mutate()
      return json
    } catch (e) {
      toastError(e, errorTitle)
      return null
    } finally {
      setBusy(null)
    }
  }

  async function saveSubscription(e: React.FormEvent) {
    e.preventDefault()
    if (!formPlan) {
      toast.error('Choisissez un plan')
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
        toast.error('Indiquez une date de fin')
        return
      }
      payload.endsAt = new Date(formEndsAt + 'T23:59:59').toISOString()
    } else {
      payload.months = parseInt(formMonths, 10) || 1
    }

    await call(
      `/api/admin/companies/${id}`,
      { method: 'PATCH', body: payload },
      'save-sub',
      'Abonnement mis à jour (paiement hors plateforme / manuel)',
      'Abonnement non enregistré'
    )
  }

  async function suspend(suspendIt: boolean, reason: string | null = null) {
    const json = await call(
      `/api/admin/companies/${id}/suspend`,
      { method: 'POST', body: { suspend: suspendIt, reason } },
      suspendIt ? 'suspend' : 'reactivate',
      suspendIt ? 'Entreprise suspendue' : 'Entreprise réactivée'
    )
    if (json) {
      setPending(null)
      setSuspendReason('')
    }
  }

  async function cancelSubscription() {
    const json = await call(
      `/api/admin/companies/${id}`,
      { method: 'PATCH', body: { action: 'set_status', status: 'canceled' } },
      'cancel',
      'Abonnement annulé'
    )
    if (json) setPending(null)
  }

  async function extendTrial() {
    const days = parseInt(trialDays, 10) || 14
    const json = await call(
      `/api/admin/companies/${id}`,
      { method: 'PATCH', body: { action: 'extend_trial', days } },
      'trial',
      `Essai prolongé de ${days} jour(s)`
    )
    if (json) setPending(null)
  }

  async function impersonate() {
    if (busy) return
    setBusy('impersonate')
    try {
      const json = await apiFetch<{ token: string }>(`/api/admin/companies/${id}/impersonate`, { method: 'POST' })
      await signIn('impersonate', { token: json.token, callbackUrl: '/dashboard' })
    } catch (e) {
      toastError(e, 'Connexion impossible')
      setPending(null)
      setBusy(null)
    }
  }

  async function remove() {
    const json = await call(
      `/api/admin/companies/${id}`,
      { method: 'DELETE' },
      'delete',
      'Entreprise supprimée',
      'Suppression impossible'
    )
    if (json) {
      setPending(null)
      router.push('/admin/companies')
    } else {
      setPending(null)
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6" aria-busy="true" aria-label="Chargement">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <TableSkeleton rows={4} />
      </div>
    )
  }

  if (error || !company) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="p-4 sm:p-8 max-w-5xl mx-auto">
        <Link
          href="/admin/companies"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Entreprises
        </Link>
        <ErrorState
          title={notFound ? 'Entreprise introuvable' : undefined}
          description={error ? errorMessage(error) : 'Les données de cette entreprise sont indisponibles.'}
          onRetry={notFound ? undefined : () => mutate()}
        />
      </div>
    )
  }

  const planLabel = plan?.display_name || company.subscription_plan_name || '—'
  const isBusy = !!busy

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
              <Badge className="bg-green-100 text-green-700">{statusLabel(company.subscription_status)}</Badge>
            )}
          </div>
          <p className="text-sm text-zinc-500">{company.email || 'Sans email'}</p>
          {company.is_suspended && company.suspension_reason && (
            <p className="text-xs text-red-600 mt-1">Motif : {company.suspension_reason}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setPending('impersonate')} disabled={isBusy}>
            {busy === 'impersonate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4 mr-1.5" />}
            Se connecter en tant que
          </Button>
          {company.is_suspended ? (
            <Button onClick={() => suspend(false)} className="bg-green-600 hover:bg-green-700" disabled={isBusy}>
              {busy === 'reactivate' ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              Réactiver
            </Button>
          ) : (
            <Button
              onClick={() => setPending('suspend')}
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              disabled={isBusy}
            >
              <Ban className="h-4 w-4 mr-1.5" /> Suspendre
            </Button>
          )}
        </div>
      </div>

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
            <Row label="Statut" value={statusLabel(company.subscription_status)} />
            <Row label="Plan" value={<span className="capitalize">{planLabel}</span>} />
            <Row label="Fin d'essai" value={formatDate(company.trial_ends_at)} />
            <Row
              label="Fin d'abonnement"
              value={
                company.subscription_ends_at
                  ? formatDate(company.subscription_ends_at)
                  : company.subscription_status === 'active'
                    ? 'Illimité'
                    : '—'
              }
            />
            {plan && <Row label="Prix catalogue" value={formatMoney(plan.price_monthly)} />}
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
                    {(p.display_name || p.name) + ` — ${formatMoney(p.price_monthly)}/mois`}
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
                    aria-pressed={durationMode === value}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
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
                      aria-pressed={formMonths === String(m)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
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
                  aria-label="Date de fin"
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

            <Button type="submit" disabled={isBusy} className="w-full sm:w-auto">
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
              <Button variant="outline" size="sm" onClick={() => setPending('trial')} disabled={isBusy}>
                <CalendarPlus className="h-4 w-4 mr-1.5" /> Prolonger l&apos;essai
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPending('cancel')} disabled={isBusy}>
              Annuler l&apos;abonnement
            </Button>
          </div>
        </Card>

        <Card className="p-6 border-red-100">
          <h2 className="text-sm font-semibold text-red-600 mb-2">Zone sensible</h2>
          <p className="text-sm text-zinc-500 mb-4">
            La suppression est définitive. Préférez la suspension si vous comptez réactiver plus tard.
          </p>
          <Button
            onClick={() => {
              setDeleteConfirm('')
              setPending('delete')
            }}
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50"
            disabled={isBusy}
          >
            {busy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
            Supprimer l&apos;entreprise
          </Button>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100">
          <h2 className="text-sm font-semibold text-zinc-950">Utilisateurs ({formatNumber(users.length)})</h2>
        </div>
        {users.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-400">Aucun utilisateur dans cette entreprise</p>
        ) : (
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
                    <td className="px-5 py-2.5 text-zinc-700">{roleLabel(u.role)}</td>
                    <td className="px-5 py-2.5">
                      {u.is_active ? (
                        <span className="text-green-600 text-xs font-medium">Actif</span>
                      ) : (
                        <span className="text-zinc-400 text-xs font-medium">Inactif</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-zinc-500">{formatDateTime(u.last_login_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AlertDialog open={pending !== null} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <AlertDialogContent>
          {pending === 'impersonate' && (
            <AlertDialogHeader>
              <AlertDialogTitle>Se connecter en tant que {company.name} ?</AlertDialogTitle>
              <AlertDialogDescription>
                Vous quitterez le back office et serez connecté au tableau de bord de l’entreprise avec le compte de
                son propriétaire. Toutes vos actions y seront réelles et l’accès est consigné dans le journal
                d’audit.
              </AlertDialogDescription>
            </AlertDialogHeader>
          )}
          {pending === 'suspend' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Suspendre {company.name} ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Les utilisateurs de l’entreprise ne pourront plus accéder à l’application tant qu’elle ne sera pas
                  réactivée. Les données sont conservées.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="suspend-reason">Motif de la suspension (optionnel)</Label>
                <Input
                  id="suspend-reason"
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  placeholder="Ex. impayé, demande du client…"
                />
              </div>
            </>
          )}
          {pending === 'cancel' && (
            <AlertDialogHeader>
              <AlertDialogTitle>Annuler l&apos;abonnement de {company.name} ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le statut de l’abonnement passera à « Annulé » : l’entreprise perdra l’accès aux fonctionnalités
                payantes jusqu’à un nouvel abonnement. Aucun remboursement n’est effectué.
              </AlertDialogDescription>
            </AlertDialogHeader>
          )}
          {pending === 'trial' && (
            <AlertDialogHeader>
              <AlertDialogTitle>Prolonger l&apos;essai de {parseInt(trialDays, 10) || 14} jour(s) ?</AlertDialogTitle>
              <AlertDialogDescription>
                La fin d’essai sera repoussée et le statut de l’abonnement passera à « Essai »
                {company.subscription_status === 'active'
                  ? ' : l’abonnement actuellement actif (payé) sera remplacé par une période d’essai.'
                  : '.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
          )}
          {pending === 'delete' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer définitivement {company.name} ?</AlertDialogTitle>
                <AlertDialogDescription>
                  L’entreprise sera supprimée de la plateforme. Cette action est irréversible ; elle est refusée si
                  des données liées (ventes, stock…) existent encore. Pour confirmer, saisissez le nom de
                  l’entreprise.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={company.name}
                aria-label="Nom de l'entreprise pour confirmer"
              />
            </>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={isBusy || (pending === 'delete' && deleteConfirm.trim() !== String(company.name).trim())}
              className={
                pending === 'delete' || pending === 'suspend' || pending === 'cancel'
                  ? 'bg-red-600 hover:bg-red-700'
                  : undefined
              }
              onClick={(e) => {
                e.preventDefault()
                if (pending === 'impersonate') impersonate()
                else if (pending === 'suspend') suspend(true, suspendReason.trim() || null)
                else if (pending === 'cancel') cancelSubscription()
                else if (pending === 'trial') extendTrial()
                else if (pending === 'delete') remove()
              }}
            >
              {isBusy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {pending === 'impersonate' && 'Se connecter'}
              {pending === 'suspend' && 'Suspendre'}
              {pending === 'cancel' && 'Annuler l’abonnement'}
              {pending === 'trial' && 'Prolonger'}
              {pending === 'delete' && 'Supprimer définitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Usage({ label, value }: { label: string; value?: number }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-bold text-zinc-950">{formatNumber(value ?? 0)}</p>
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
