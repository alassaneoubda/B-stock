'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageShell, PageIntro, Panel, StatusBadge } from '@/components/app/blocks'
import { Button, buttonVariants } from '@/components/ui/button'
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
      <PageShell>
        <div className="space-y-6" aria-busy="true" aria-label="Chargement">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-20 rounded-xl" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-96 rounded-xl lg:col-span-2" />
            <Skeleton className="h-96 rounded-xl" />
          </div>
          <TableSkeleton rows={4} />
        </div>
      </PageShell>
    )
  }

  if (error || !company) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <PageShell>
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/admin/companies">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Entreprises
          </Link>
        </Button>
        <ErrorState
          title={notFound ? 'Entreprise introuvable' : undefined}
          description={error ? errorMessage(error) : 'Les données de cette entreprise sont indisponibles.'}
          onRetry={notFound ? undefined : () => mutate()}
        />
      </PageShell>
    )
  }

  const planLabel = plan?.display_name || company.subscription_plan_name || '—'
  const isBusy = !!busy

  return (
    <PageShell>
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
          <Link href="/admin/companies">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Entreprises
          </Link>
        </Button>

        <PageIntro
          title={
            <span className="flex flex-wrap items-center gap-3">
              {company.name}
              {company.is_suspended ? (
                <StatusBadge label="Suspendue" tone="danger" />
              ) : (
                <StatusBadge label={statusLabel(company.subscription_status)} tone={statusTone(company.subscription_status)} />
              )}
            </span>
          }
          description={
            <>
              {company.email || 'Sans email'}
              {company.is_suspended && company.suspension_reason && (
                <span className="mt-1 block text-xs text-destructive">Motif : {company.suspension_reason}</span>
              )}
            </>
          }
          actions={
            <>
              <Button variant="outline" onClick={() => setPending('impersonate')} disabled={isBusy}>
                {busy === 'impersonate' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                )}
                Se connecter en tant que
              </Button>
              {company.is_suspended ? (
                <Button onClick={() => suspend(false)} disabled={isBusy}>
                  {busy === 'reactivate' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  Réactiver
                </Button>
              ) : (
                <Button
                  onClick={() => setPending('suspend')}
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isBusy}
                >
                  <Ban className="h-4 w-4" aria-hidden="true" /> Suspendre
                </Button>
              )}
            </>
          }
        />
      </div>

      {/* Utilisation */}
      <section
        aria-label="Utilisation"
        className="grid grid-cols-2 divide-border overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)] sm:grid-cols-5 sm:divide-x"
      >
        <Usage label="Utilisateurs" value={usage?.users} />
        <Usage label="Dépôts" value={usage?.depots} />
        <Usage label="Produits" value={usage?.products} />
        <Usage label="Clients" value={usage?.clients} />
        <Usage label="Commandes" value={usage?.orders} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Abonnement</CardTitle>
            <CardDescription>
              Pour un paiement hors plateforme (espèces, virement, Mobile Money…) : choisissez l’offre et une durée personnalisée.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={saveSubscription} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plan">Offre</Label>
                  <select
                    id="plan"
                    value={formPlan}
                    onChange={(e) => setFormPlan(e.target.value)}
                    className={SELECT}
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
                    className={SELECT}
                  >
                    <option value="active">Actif (payé)</option>
                    <option value="trialing">Essai</option>
                    <option value="past_due">Impayé / en retard</option>
                    <option value="canceled">Annulé</option>
                  </select>
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-sm font-medium text-foreground">Durée</legend>
                <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/60 p-1">
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
                      className={`h-8 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        durationMode === value
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {durationMode === 'months' && (
                  <div className="flex flex-wrap items-center gap-2">
                    {[1, 3, 6, 12].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setFormMonths(String(m))}
                        aria-pressed={formMonths === String(m)}
                        className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          formMonths === String(m)
                            ? 'border-brand/50 bg-brand-soft text-brand-strong'
                            : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
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
                      className="tabular h-9 w-24"
                      aria-label="Nombre de mois"
                    />
                  </div>
                )}

                {durationMode === 'date' && (
                  <Input
                    type="date"
                    value={formEndsAt}
                    onChange={(e) => setFormEndsAt(e.target.value)}
                    className="h-10 max-w-xs"
                    aria-label="Date de fin"
                    required
                  />
                )}

                {durationMode === 'unlimited' && (
                  <p className="text-xs text-muted-foreground">Accès sans date d’expiration (jusqu’à annulation manuelle).</p>
                )}
              </fieldset>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pay">Moyen de paiement</Label>
                  <select
                    id="pay"
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value)}
                    className={SELECT}
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
                    className="tabular h-10"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="note">Note interne</Label>
                  <Input
                    id="note"
                    placeholder="Ex. payé en liquide le 17/08 chez le commercial"
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" variant="brand" disabled={isBusy} className="w-full sm:w-auto">
                  {busy === 'save-sub' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden="true" />
                  )}
                  Enregistrer l’abonnement
                </Button>
              </div>
            </form>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value)}
                  className="tabular h-9 w-20"
                  aria-label="Jours d'essai"
                />
                <Button variant="outline" size="sm" className="h-9" onClick={() => setPending('trial')} disabled={isBusy}>
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Prolonger l’essai
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={() => setPending('cancel')} disabled={isBusy}>
                Annuler l’abonnement
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Panel title="Résumé" description="Abonnement en cours">
            <dl className="divide-y divide-border text-sm">
              <Row label="Statut" value={statusLabel(company.subscription_status)} />
              <Row label="Plan" value={<span className="capitalize">{planLabel}</span>} />
              <Row label="Fin d’essai" value={formatDate(company.trial_ends_at)} />
              <Row
                label="Fin d’abonnement"
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
          </Panel>

          <section className="rounded-xl border border-destructive/30 bg-card p-5 shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
            <h2 className="text-[15px] font-semibold tracking-tight text-destructive">Zone sensible</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              La suppression est définitive. Préférez la suspension si vous comptez réactiver plus tard.
            </p>
            <Button
              onClick={() => {
                setDeleteConfirm('')
                setPending('delete')
              }}
              variant="destructive"
              disabled={isBusy}
            >
              {busy === 'delete' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              Supprimer l’entreprise
            </Button>
          </section>
        </div>
      </div>

      <Panel title="Utilisateurs" description={`${formatNumber(users.length)} compte(s) dans cette entreprise`}>
        {users.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Aucun utilisateur dans cette entreprise</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Nom</th>
                  <th className="px-5 py-2.5 font-medium">Rôle</th>
                  <th className="px-5 py-2.5 font-medium">Statut</th>
                  <th className="px-5 py-2.5 font-medium">Dernière connexion</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id} className="border-b border-border transition-colors last:border-0 hover:bg-muted/50">
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-foreground">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="px-5 py-2.5 text-foreground">{roleLabel(u.role)}</td>
                    <td className="px-5 py-2.5">
                      <StatusBadge label={u.is_active ? 'Actif' : 'Inactif'} tone={u.is_active ? 'success' : 'default'} />
                    </td>
                    <td className="tabular whitespace-nowrap px-5 py-2.5 text-muted-foreground">{formatDateTime(u.last_login_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

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
              <AlertDialogTitle>Annuler l’abonnement de {company.name} ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le statut de l’abonnement passera à « Annulé » : l’entreprise perdra l’accès aux fonctionnalités
                payantes jusqu’à un nouvel abonnement. Aucun remboursement n’est effectué.
              </AlertDialogDescription>
            </AlertDialogHeader>
          )}
          {pending === 'trial' && (
            <AlertDialogHeader>
              <AlertDialogTitle>Prolonger l’essai de {parseInt(trialDays, 10) || 14} jour(s) ?</AlertDialogTitle>
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
                  ? buttonVariants({ variant: 'destructive' })
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
              {isBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {pending === 'impersonate' && 'Se connecter'}
              {pending === 'suspend' && 'Suspendre'}
              {pending === 'cancel' && 'Annuler l’abonnement'}
              {pending === 'trial' && 'Prolonger'}
              {pending === 'delete' && 'Supprimer définitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}

const SELECT =
  'flex h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function statusTone(s?: string | null): 'success' | 'warning' | 'danger' | 'default' {
  if (s === 'active') return 'success'
  if (s === 'trialing') return 'warning'
  if (s === 'past_due') return 'danger'
  return 'default'
}

function Usage({ label, value }: { label: string; value?: number }) {
  return (
    <div className="px-5 py-4">
      <p className="tabular text-xl font-semibold tracking-tight text-foreground">{formatNumber(value ?? 0)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium text-foreground">{value}</dd>
    </div>
  )
}
