'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { ArrowLeft, Loader2, Save } from 'lucide-react'

type NotificationSettings = {
    low_stock_enabled: boolean
    low_stock_threshold: number
    credit_overdue_enabled: boolean
    credit_overdue_days: number
    delivery_updates_enabled: boolean
    daily_report_enabled: boolean
    email_enabled: boolean
    sms_enabled: boolean
    updated_at: string | null
}

type ToggleKey = 'low_stock_enabled' | 'credit_overdue_enabled' | 'delivery_updates_enabled' | 'daily_report_enabled'

const TOGGLES: { key: ToggleKey; label: string; description: string }[] = [
    {
        key: 'low_stock_enabled',
        label: 'Alertes de stock critique',
        description: "Être prévenu lorsqu'un produit atteint son seuil d'alerte.",
    },
    {
        key: 'credit_overdue_enabled',
        label: 'Crédits clients en retard',
        description: "Être prévenu lorsqu'un client dépasse le délai de paiement.",
    },
    {
        key: 'delivery_updates_enabled',
        label: 'Mises à jour de livraison',
        description: "Suivre l'état d'avancement des tournées de livraison.",
    },
    {
        key: 'daily_report_enabled',
        label: 'Rapport journalier',
        description: "Un résumé quotidien de l'activité (ventes, stocks, caisse).",
    },
]

export default function NotificationsSettingsPage() {
    const [settings, setSettings] = useState<NotificationSettings | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [dirty, setDirty] = useState(false)
    const [overdueDaysInput, setOverdueDaysInput] = useState('')

    const fetchSettings = useCallback(async () => {
        setIsLoading(true)
        setLoadError(null)
        try {
            const { data } = await apiFetch<{ data: NotificationSettings }>('/api/profile/notifications')
            setSettings(data)
            setOverdueDaysInput(String(data.credit_overdue_days))
            setDirty(false)
        } catch (e) {
            setLoadError(errorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => { fetchSettings() }, [fetchSettings])

    const handleToggle = (key: ToggleKey, value: boolean) => {
        setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
        setDirty(true)
    }

    const handleSave = async () => {
        if (!settings || saving) return
        const days = Number(overdueDaysInput)
        if (!Number.isInteger(days) || days < 1 || days > 365) {
            toast.error('Délai invalide', { description: 'Le délai de retard doit être compris entre 1 et 365 jours.' })
            return
        }
        setSaving(true)
        try {
            const { data } = await apiFetch<{ data: NotificationSettings }>('/api/profile/notifications', {
                method: 'PUT',
                body: {
                    low_stock_enabled: settings.low_stock_enabled,
                    credit_overdue_enabled: settings.credit_overdue_enabled,
                    credit_overdue_days: days,
                    delivery_updates_enabled: settings.delivery_updates_enabled,
                    daily_report_enabled: settings.daily_report_enabled,
                },
            })
            setSettings(data)
            setOverdueDaysInput(String(data.credit_overdue_days))
            setDirty(false)
            toast.success('Préférences enregistrées')
        } catch (e) {
            toastError(e, "Préférences non enregistrées")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Notifications"
                description="Choisissez les événements dont vous voulez être prévenu"
            />
            <PageShell>
                <div>
                    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
                        <Link href="/dashboard/settings">
                            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Paramètres
                        </Link>
                    </Button>
                </div>

                <div className="max-w-3xl space-y-6">
                    {isLoading ? (
                        <Card aria-busy="true" aria-label="Chargement">
                            <CardHeader>
                                <Skeleton className="h-4 w-48" />
                                <Skeleton className="h-3 w-72" />
                            </CardHeader>
                            <CardContent className="space-y-5">
                                {Array.from({ length: 4 }, (_, i) => (
                                    <div key={i} className="flex items-center justify-between gap-4">
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-48" />
                                            <Skeleton className="h-3 w-72" />
                                        </div>
                                        <Skeleton className="h-5 w-9 rounded-full" />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    ) : loadError || !settings ? (
                        <ErrorState description={loadError ?? undefined} onRetry={fetchSettings} />
                    ) : (
                        <>
                            <Card className="gap-0 overflow-hidden pb-0">
                                <CardHeader className="border-b border-border">
                                    <CardTitle className="text-[15px]">Événements à suivre</CardTitle>
                                    <CardDescription>
                                        Préférences propres à votre compte. Les alertes restent consultables dans la page{' '}
                                        <Link href="/dashboard/alerts" className="font-medium text-foreground underline-offset-4 hover:underline">Alertes</Link>.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="divide-y divide-border px-0">
                                    {TOGGLES.map((toggle) => (
                                        <div key={toggle.key} className="space-y-3 px-5 py-4">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="min-w-0 space-y-0.5">
                                                    <Label htmlFor={toggle.key} className="text-sm font-medium text-foreground">{toggle.label}</Label>
                                                    <p className="text-xs text-muted-foreground">{toggle.description}</p>
                                                </div>
                                                <Switch
                                                    id={toggle.key}
                                                    checked={settings[toggle.key]}
                                                    disabled={saving}
                                                    onCheckedChange={(value) => handleToggle(toggle.key, value)}
                                                />
                                            </div>
                                            {toggle.key === 'credit_overdue_enabled' && settings.credit_overdue_enabled && (
                                                <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-2.5">
                                                    <Label htmlFor="credit_overdue_days" className="text-sm font-normal text-muted-foreground">
                                                        Considérer en retard après
                                                    </Label>
                                                    <Input
                                                        id="credit_overdue_days"
                                                        type="number"
                                                        inputMode="numeric"
                                                        min={1}
                                                        max={365}
                                                        className="tabular h-10 w-24 bg-card"
                                                        value={overdueDaysInput}
                                                        disabled={saving}
                                                        onChange={(e) => {
                                                            setOverdueDaysInput(e.target.value)
                                                            setDirty(true)
                                                        }}
                                                    />
                                                    <span className="text-sm text-muted-foreground">jours</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </CardContent>
                                <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-4">
                                    <span className="text-xs text-muted-foreground">
                                        {settings.updated_at
                                            ? `Dernier enregistrement : ${formatDateTime(settings.updated_at)}`
                                            : 'Valeurs par défaut (jamais enregistrées)'}
                                    </span>
                                    <Button onClick={handleSave} disabled={saving || !dirty}>
                                        {saving ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                        ) : (
                                            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                                        )}
                                        Enregistrer les préférences
                                    </Button>
                                </CardFooter>
                            </Card>

                            <Card className="gap-0 overflow-hidden pb-0">
                                <CardHeader className="border-b border-border">
                                    <CardTitle className="text-[15px]">Canaux d&apos;envoi</CardTitle>
                                    <CardDescription>
                                        L&apos;envoi par e-mail et par SMS n&apos;est pas encore disponible.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="divide-y divide-border px-0">
                                    {[
                                        { id: 'email_channel', label: 'Notifications par e-mail' },
                                        { id: 'sms_channel', label: 'Notifications par SMS' },
                                    ].map((channel) => (
                                        <div key={channel.id} className="flex items-center justify-between gap-4 px-5 py-4">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Label htmlFor={channel.id} className="text-sm font-medium text-muted-foreground">{channel.label}</Label>
                                                <Badge variant="muted">Bientôt disponible</Badge>
                                            </div>
                                            <Switch id={channel.id} checked={false} disabled aria-describedby={`${channel.id}-hint`} />
                                            <span id={`${channel.id}-hint`} className="sr-only">Bientôt disponible</span>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </>
                    )}
                </div>
            </PageShell>
        </div>
    )
}
