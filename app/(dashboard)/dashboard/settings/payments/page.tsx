'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, KeyRound, Loader2, PlugZap, RefreshCw, Save, Smartphone, XCircle } from 'lucide-react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
import { ErrorState, PageSkeleton } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type SecretStatus = { configured: boolean; last4: string | null }
type Settings = {
    enabled: boolean
    environment: 'sandbox' | 'production'
    apiKey: SecretStatus
    apiSecret: SecretStatus
    webhookSecret: SecretStatus
    webhookPath: string
    lastTest: { at: string | null; ok: boolean | null; message: string | null }
    keyConfigured: boolean
    ready: boolean
}

const SECRET_FIELDS = [
    { key: 'apiKey', label: 'Clé API (X-API-Key)', placeholder: 'pk_live_…' },
    { key: 'apiSecret', label: 'Secret API (X-API-Secret)', placeholder: 'sk_live_…' },
    { key: 'webhookSecret', label: 'Secret de webhook', placeholder: 'whsec_…' },
] as const
type SecretKey = (typeof SECRET_FIELDS)[number]['key']

export default function PaymentSettingsPage() {
    const [settings, setSettings] = useState<Settings | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [enabled, setEnabled] = useState(false)
    const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox')
    const [secrets, setSecrets] = useState<Record<SecretKey, string>>({ apiKey: '', apiSecret: '', webhookSecret: '' })
    const [saving, setSaving] = useState(false)
    const [testing, setTesting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [origin, setOrigin] = useState('')

    const apply = (s: Settings) => {
        setSettings(s)
        setEnabled(s.enabled)
        setEnvironment(s.environment)
    }

    const load = useCallback(async () => {
        setLoading(true)
        setLoadError(null)
        try {
            const { data } = await apiFetch<{ data: Settings }>('/api/settings/payments')
            apply(data)
        } catch (e) {
            setLoadError(errorMessage(e))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        setOrigin(window.location.origin)
        load()
    }, [load])

    async function save(extra: Record<string, unknown> = {}) {
        if (saving) return
        setFormError(null)
        setSaving(true)
        try {
            const { data } = await apiFetch<{ data: Settings }>('/api/settings/payments', {
                method: 'PUT',
                body: { enabled, environment, ...secrets, ...extra },
            })
            apply(data)
            // Les secrets saisis ne sont jamais conservés dans la page
            setSecrets({ apiKey: '', apiSecret: '', webhookSecret: '' })
            toast.success(extra.regenerateWebhookToken ? 'Nouvelle URL de webhook générée' : 'Paramètres enregistrés')
        } catch (e) {
            setFormError(errorMessage(e))
        } finally {
            setSaving(false)
        }
    }

    async function testConnection() {
        if (testing) return
        setTesting(true)
        try {
            const { data } = await apiFetch<{ data: { ok: boolean; message: string; settings: Settings } }>(
                '/api/settings/payments/test',
                { method: 'POST' }
            )
            apply(data.settings)
            if (data.ok) toast.success(data.message)
            else toast.error('Connexion refusée', { description: data.message })
        } catch (e) {
            toastError(e, 'Test impossible')
        } finally {
            setTesting(false)
        }
    }

    async function copyWebhook() {
        if (!settings) return
        try {
            await navigator.clipboard.writeText(`${origin}${settings.webhookPath}`)
            toast.success('URL du webhook copiée')
        } catch {
            toast.error('Copie impossible : sélectionnez l’URL manuellement')
        }
    }

    if (loading && !settings) return <PageSkeleton />

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Paiements Mobile Money"
                description="Encaissez vos clients par Wave, Orange Money, MTN MoMo et Moov sur votre propre compte GeniusPay"
            />
            <PageShell className="max-w-4xl">
                <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
                    <Link href="/dashboard/settings">
                        <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        Paramètres
                    </Link>
                </Button>

                {loadError || !settings ? (
                    <ErrorState title="Impossible de charger les paramètres de paiement" description={loadError ?? undefined} onRetry={load} />
                ) : (
                    <>
                        {!settings.keyConfigured && (
                            <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <p>
                                    Fonctionnalité indisponible : le serveur n’a pas de clé de chiffrement des identifiants
                                    (PAYMENT_CREDENTIALS_KEY). Contactez le support B-Stock.
                                </p>
                            </div>
                        )}

                        <Panel
                            title="Activation"
                            description="L’argent des paiements arrive directement sur le compte marchand GeniusPay de votre entreprise."
                            action={<StatusBadge label={settings.ready ? 'Actif' : 'Inactif'} tone={settings.ready ? 'success' : 'default'} />}
                            bodyClassName="space-y-5 px-5 py-5"
                        >
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <Label htmlFor="mm-enabled" className="text-sm font-medium">Activer les paiements Mobile Money</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Affiche le bouton « Paiement Mobile Money » sur les ventes et les créances.
                                    </p>
                                </div>
                                <Switch id="mm-enabled" checked={enabled} onCheckedChange={setEnabled} />
                            </div>
                            <fieldset className="space-y-2">
                                <legend className="text-sm font-medium text-foreground">Mode</legend>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {([
                                        { value: 'sandbox', title: 'Test (sandbox)', hint: 'Paiements simulés, aucun argent réel' },
                                        { value: 'production', title: 'Production', hint: 'Paiements réels de vos clients' },
                                    ] as const).map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            aria-pressed={environment === opt.value}
                                            onClick={() => setEnvironment(opt.value)}
                                            className={cn(
                                                'rounded-lg border px-3 py-2.5 text-left transition-colors',
                                                environment === opt.value ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border hover:bg-muted'
                                            )}
                                        >
                                            <span className="block text-sm font-medium">{opt.title}</span>
                                            <span className="block text-xs opacity-80">{opt.hint}</span>
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                        </Panel>

                        <Panel
                            title="Identifiants GeniusPay"
                            description="Disponibles dans votre tableau de bord pay.genius.ci. Ils sont chiffrés et ne sont plus jamais affichés."
                            bodyClassName="space-y-4 px-5 py-5"
                        >
                            {SECRET_FIELDS.map((f) => {
                                const st = settings[f.key]
                                return (
                                    <div key={f.key} className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <Label htmlFor={`mm-${f.key}`}>{f.label}</Label>
                                            {st.configured ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-success">
                                                    <KeyRound className="h-3 w-3" aria-hidden="true" />
                                                    Configuré ••••{st.last4}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-muted-foreground">Non configuré</span>
                                            )}
                                        </div>
                                        <Input
                                            id={`mm-${f.key}`}
                                            type="password"
                                            autoComplete="off"
                                            spellCheck={false}
                                            placeholder={st.configured ? 'Laisser vide pour conserver la valeur actuelle' : f.placeholder}
                                            value={secrets[f.key]}
                                            onChange={(e) => setSecrets((s) => ({ ...s, [f.key]: e.target.value }))}
                                            className="font-mono"
                                        />
                                    </div>
                                )
                            })}

                            {formError && (
                                <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                    {formError}
                                </p>
                            )}

                            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={testConnection}
                                    disabled={testing || !settings.apiKey.configured || !settings.apiSecret.configured}
                                >
                                    {testing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PlugZap className="h-4 w-4" aria-hidden="true" />}
                                    Tester la connexion
                                </Button>
                                <Button type="button" variant="brand" onClick={() => save()} disabled={saving || !settings.keyConfigured}>
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                                    Enregistrer
                                </Button>
                            </div>
                            {settings.lastTest.at && (
                                <p className={cn('flex items-start gap-2 text-xs', settings.lastTest.ok ? 'text-success' : 'text-destructive')}>
                                    {settings.lastTest.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                                    <span>Dernier test le {formatDateTime(settings.lastTest.at)} : {settings.lastTest.message}</span>
                                </p>
                            )}
                        </Panel>

                        <Panel
                            title="URL de webhook"
                            description="À coller dans GeniusPay (Paramètres > Webhooks) pour que les paiements soient enregistrés automatiquement."
                            bodyClassName="space-y-3 px-5 py-5"
                        >
                            <div className="flex items-center gap-2">
                                <Input readOnly value={`${origin}${settings.webhookPath}`} aria-label="URL du webhook" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                                <Button type="button" variant="outline" size="icon" onClick={copyWebhook} aria-label="Copier l’URL du webhook" title="Copier">
                                    <Copy className="h-4 w-4" aria-hidden="true" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Chaque notification est vérifiée avec votre secret de webhook, puis le statut est revérifié
                                auprès de GeniusPay avant d’enregistrer le paiement. Sans webhook, les paiements sont tout de
                                même rapprochés automatiquement toutes les 15 minutes environ.
                            </p>
                            <div className="flex justify-end">
                                <Button type="button" variant="ghost" size="sm" onClick={() => save({ regenerateWebhookToken: true })} disabled={saving}>
                                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                                    Générer une nouvelle URL
                                </Button>
                            </div>
                        </Panel>

                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                            Suivez les paiements reçus dans{' '}
                            <Link href="/dashboard/mobile-money" className="font-medium text-foreground underline-offset-4 hover:underline">
                                Suivi Mobile Money
                            </Link>
                            .
                        </p>
                    </>
                )}
            </PageShell>
        </div>
    )
}
