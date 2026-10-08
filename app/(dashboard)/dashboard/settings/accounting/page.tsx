'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { ArrowLeft, FileSpreadsheet, Loader2, Lock, RotateCcw, Save, Search } from 'lucide-react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { apiFetch, errorMessage, toastError } from '@/lib/api-client'
import {
    ACCOUNT_DEFINITIONS,
    ACCOUNT_GROUP_LABELS,
    ACCOUNT_NUMBER_RE,
    DEFAULT_SETTINGS,
    JOURNAL_CODE_RE,
    JOURNAL_KEYS,
    JOURNAL_LABELS,
    type AccountDefinition,
    type AccountingSettings,
} from '@/lib/accounting/chart'

type AuxEntity = { id: string; name: string; customCode: string | null; code: string }

const GROUP_ORDER: AccountDefinition['group'][] = ['tiers', 'ventes', 'achats', 'tresorerie', 'consignes', 'fiscal', 'charges', 'divers']

export default function AccountingSettingsPage() {
    const { data: session } = useSession()
    const isOwner = session?.user?.role === 'owner'

    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [settings, setSettings] = useState<AccountingSettings>(DEFAULT_SETTINGS)
    const [saving, setSaving] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    const fetchSettings = useCallback(async () => {
        setLoading(true)
        setLoadError(null)
        try {
            const { data } = await apiFetch<{ data: { settings: AccountingSettings } }>('/api/accounting/settings')
            setSettings(data.settings)
        } catch (e) {
            setLoadError(errorMessage(e))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchSettings()
    }, [fetchSettings])

    const invalidAccounts = useMemo(
        () => ACCOUNT_DEFINITIONS.filter((d) => !ACCOUNT_NUMBER_RE.test(settings.accounts[d.key] ?? '')),
        [settings.accounts]
    )
    const invalidJournals = useMemo(
        () => JOURNAL_KEYS.filter((k) => !JOURNAL_CODE_RE.test(settings.journals[k] ?? '')),
        [settings.journals]
    )

    async function handleSave(e: React.FormEvent) {
        e.preventDefault()
        if (saving) return
        setFormError(null)
        if (invalidAccounts.length > 0) {
            setFormError(`Numéro de compte invalide : ${invalidAccounts.map((a) => a.label).join(', ')} (2 à 13 chiffres).`)
            return
        }
        if (invalidJournals.length > 0) {
            setFormError('Chaque code journal doit comporter 1 à 6 lettres majuscules ou chiffres.')
            return
        }
        setSaving(true)
        try {
            const { data } = await apiFetch<{ data: { settings: AccountingSettings } }>('/api/accounting/settings', {
                method: 'PUT',
                body: settings,
            })
            setSettings(data.settings)
            toast.success('Plan de comptes enregistré')
        } catch (err) {
            setFormError(errorMessage(err))
        } finally {
            setSaving(false)
        }
    }

    async function handleReset() {
        setResetting(true)
        try {
            const { data } = await apiFetch<{ data: { settings: AccountingSettings } }>('/api/accounting/settings/reset', {
                method: 'POST',
            })
            setSettings(data.settings)
            setFormError(null)
            toast.success('Valeurs SYSCOHADA rétablies')
        } catch (err) {
            toastError(err)
        } finally {
            setResetting(false)
        }
    }

    const setAccount = (key: string, value: string) =>
        setSettings((s) => ({ ...s, accounts: { ...s.accounts, [key]: value.replace(/\D/g, '').slice(0, 13) } }))
    const setJournal = (key: string, value: string) =>
        setSettings((s) => ({
            ...s,
            journals: { ...s.journals, [key]: value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) },
        }))

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Comptabilité"
                description="Plan de comptes SYSCOHADA utilisé par l'export comptable"
            />
            <PageShell>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
                        <Link href="/dashboard/settings">
                            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Paramètres
                        </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/dashboard/accounting">
                            <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Export comptable
                        </Link>
                    </Button>
                </div>

                <div className="max-w-4xl space-y-6">
                    {!isOwner && session && (
                        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-foreground">
                            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <p>Le paramétrage comptable est réservé au propriétaire du compte.</p>
                        </div>
                    )}

                    {loading ? (
                        <Card aria-busy="true" aria-label="Chargement">
                            <CardHeader>
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-3 w-72" />
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {Array.from({ length: 6 }, (_, i) => (
                                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                                ))}
                            </CardContent>
                        </Card>
                    ) : loadError ? (
                        <ErrorState description={loadError} onRetry={fetchSettings} />
                    ) : (
                        <form onSubmit={handleSave} className="space-y-6">
                            <fieldset disabled={!isOwner || saving || resetting} className="space-y-6">
                                <Card>
                                    <CardHeader className="border-b border-border">
                                        <CardTitle className="text-[15px]">Plan de comptes</CardTitle>
                                        <CardDescription>
                                            Valeurs par défaut du SYSCOHADA révisé. Adaptez-les au plan de votre expert-comptable :
                                            elles s&apos;appliquent aux prochains exports.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6 pt-5">
                                        {GROUP_ORDER.map((group) => (
                                            <section key={group} aria-labelledby={`group-${group}`} className="space-y-2">
                                                <h3 id={`group-${group}`} className="text-sm font-semibold text-foreground">
                                                    {ACCOUNT_GROUP_LABELS[group]}
                                                </h3>
                                                <div className="divide-y divide-border rounded-lg border border-border">
                                                    {ACCOUNT_DEFINITIONS.filter((d) => d.group === group).map((d) => {
                                                        const value = settings.accounts[d.key] ?? ''
                                                        const invalid = !ACCOUNT_NUMBER_RE.test(value)
                                                        const changed = value !== DEFAULT_SETTINGS.accounts[d.key]
                                                        return (
                                                            <div key={d.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                                                                <div className="min-w-0 flex-1">
                                                                    <Label htmlFor={`acc-${d.key}`} className="text-sm font-medium">
                                                                        {d.label}
                                                                    </Label>
                                                                    {d.help && <p className="mt-0.5 text-xs text-muted-foreground">{d.help}</p>}
                                                                    {changed && (
                                                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                                                            SYSCOHADA : {DEFAULT_SETTINGS.accounts[d.key]}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <Input
                                                                    id={`acc-${d.key}`}
                                                                    inputMode="numeric"
                                                                    className="tabular h-10 sm:w-36"
                                                                    value={value}
                                                                    aria-invalid={invalid}
                                                                    onChange={(e) => setAccount(d.key, e.target.value)}
                                                                />
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </section>
                                        ))}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="border-b border-border">
                                        <CardTitle className="text-[15px]">Codes journaux</CardTitle>
                                        <CardDescription>Codes des journaux tels qu&apos;ils existent dans le logiciel du cabinet.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3">
                                        {JOURNAL_KEYS.map((k) => (
                                            <div key={k} className="space-y-2">
                                                <Label htmlFor={`jnl-${k}`}>{JOURNAL_LABELS[k]}</Label>
                                                <Input
                                                    id={`jnl-${k}`}
                                                    className="h-10 font-mono uppercase"
                                                    value={settings.journals[k] ?? ''}
                                                    aria-invalid={!JOURNAL_CODE_RE.test(settings.journals[k] ?? '')}
                                                    onChange={(e) => setJournal(k, e.target.value)}
                                                />
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="border-b border-border">
                                        <CardTitle className="text-[15px]">Comptes auxiliaires</CardTitle>
                                        <CardDescription>
                                            Un compte tiers par client et par fournisseur (préfixe + code), en plus du compte collectif 411 / 401.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4 pt-5">
                                        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
                                            <div>
                                                <Label htmlFor="use-aux" className="text-sm font-medium">
                                                    Exporter les comptes auxiliaires
                                                </Label>
                                                <p className="text-xs text-muted-foreground">
                                                    Désactivé : seuls les comptes collectifs sont exportés.
                                                </p>
                                            </div>
                                            <Switch
                                                id="use-aux"
                                                checked={settings.useAuxiliary}
                                                onCheckedChange={(v) => setSettings((s) => ({ ...s, useAuxiliary: v }))}
                                            />
                                        </div>
                                        {settings.useAuxiliary && (
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="space-y-2">
                                                    <Label htmlFor="client-prefix">Préfixe clients</Label>
                                                    <Input
                                                        id="client-prefix"
                                                        className="h-10 font-mono uppercase"
                                                        value={settings.clientAuxPrefix}
                                                        onChange={(e) =>
                                                            setSettings((s) => ({
                                                                ...s,
                                                                clientAuxPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
                                                            }))
                                                        }
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="supplier-prefix">Préfixe fournisseurs</Label>
                                                    <Input
                                                        id="supplier-prefix"
                                                        className="h-10 font-mono uppercase"
                                                        value={settings.supplierAuxPrefix}
                                                        onChange={(e) =>
                                                            setSettings((s) => ({
                                                                ...s,
                                                                supplierAuxPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
                                                            }))
                                                        }
                                                    />
                                                </div>
                                                <p className="text-xs text-muted-foreground sm:col-span-2">
                                                    Sans code saisi, le code est formé du préfixe et du nom (ex. « CMAQUISLEBA »). Les codes saisis ci-dessous sont prioritaires.
                                                </p>
                                            </div>
                                        )}
                                    </CardContent>
                                    {(formError || isOwner) && (
                                        <CardFooter className="flex-col items-stretch gap-3 border-t border-border">
                                            {formError && (
                                                <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                                    {formError}
                                                </p>
                                            )}
                                            {isOwner && (
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button type="button" variant="outline" disabled={resetting}>
                                                                {resetting ? (
                                                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                                                ) : (
                                                                    <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                                                                )}
                                                                Rétablir les valeurs SYSCOHADA
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Rétablir les valeurs SYSCOHADA ?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    Tous les numéros de compte, codes journaux et préfixes reviennent aux valeurs par défaut.
                                                                    Les codes auxiliaires saisis pour vos clients et fournisseurs sont conservés.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                                                <AlertDialogAction onClick={handleReset}>Rétablir</AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                    <Button type="submit" variant="brand" disabled={saving}>
                                                        {saving ? (
                                                            <>
                                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Enregistrement…
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Save className="mr-2 h-4 w-4" aria-hidden="true" /> Enregistrer
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            )}
                                        </CardFooter>
                                    )}
                                </Card>
                            </fieldset>
                        </form>
                    )}

                    {!loading && !loadError && isOwner && settings.useAuxiliary && <AuxiliaryCodes />}
                </div>
            </PageShell>
        </div>
    )
}

/** Codes auxiliaires saisis par tiers (client / fournisseur). */
function AuxiliaryCodes() {
    const [data, setData] = useState<{ clients: AuxEntity[]; suppliers: AuxEntity[] } | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    const load = useCallback(async () => {
        setError(null)
        try {
            const res = await apiFetch<{ data: { clients: AuxEntity[]; suppliers: AuxEntity[] } }>('/api/accounting/auxiliaries')
            setData(res.data)
        } catch (e) {
            setError(errorMessage(e))
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    return (
        <Card>
            <CardHeader className="border-b border-border">
                <CardTitle className="text-[15px]">Codes auxiliaires des tiers</CardTitle>
                <CardDescription>
                    Saisissez le code utilisé par votre cabinet (17 caractères au plus). Laissez vide pour le code automatique.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
                {error ? (
                    <ErrorState description={error} onRetry={load} />
                ) : !data ? (
                    <div className="space-y-2" aria-busy="true">
                        {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton key={i} className="h-10 w-full rounded-lg" />
                        ))}
                    </div>
                ) : (
                    <>
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                            <Input
                                aria-label="Rechercher un tiers"
                                placeholder="Rechercher un client ou un fournisseur"
                                className="h-10 pl-9"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <Tabs defaultValue="client">
                            <TabsList>
                                <TabsTrigger value="client">Clients ({data.clients.length})</TabsTrigger>
                                <TabsTrigger value="supplier">Fournisseurs ({data.suppliers.length})</TabsTrigger>
                            </TabsList>
                            <TabsContent value="client">
                                <AuxList entityType="client" entities={data.clients} search={search} onSaved={load} />
                            </TabsContent>
                            <TabsContent value="supplier">
                                <AuxList entityType="supplier" entities={data.suppliers} search={search} onSaved={load} />
                            </TabsContent>
                        </Tabs>
                    </>
                )}
            </CardContent>
        </Card>
    )
}

const AUX_PAGE = 50

function AuxList({
    entityType,
    entities,
    search,
    onSaved,
}: {
    entityType: 'client' | 'supplier'
    entities: AuxEntity[]
    search: string
    onSaved: () => void
}) {
    const [limit, setLimit] = useState(AUX_PAGE)
    const q = search.trim().toLowerCase()
    const filtered = q
        ? entities.filter((e) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q))
        : entities
    if (filtered.length === 0) {
        return <p className="py-6 text-center text-sm text-muted-foreground">Aucun tiers.</p>
    }
    return (
        <div className="space-y-3">
            <div className="divide-y divide-border rounded-lg border border-border">
                {filtered.slice(0, limit).map((e) => (
                    <AuxRow key={e.id} entityType={entityType} entity={e} onSaved={onSaved} />
                ))}
            </div>
            {filtered.length > limit && (
                <Button type="button" variant="outline" size="sm" onClick={() => setLimit((l) => l + AUX_PAGE)}>
                    Afficher plus ({filtered.length - limit} restants)
                </Button>
            )}
        </div>
    )
}

function AuxRow({ entityType, entity, onSaved }: { entityType: 'client' | 'supplier'; entity: AuxEntity; onSaved: () => void }) {
    const [value, setValue] = useState(entity.customCode ?? '')
    const [saving, setSaving] = useState(false)
    const dirty = value !== (entity.customCode ?? '')

    useEffect(() => {
        setValue(entity.customCode ?? '')
    }, [entity.customCode])

    async function save() {
        setSaving(true)
        try {
            await apiFetch('/api/accounting/auxiliaries', {
                method: 'PUT',
                body: { entityType, entityId: entity.id, code: value || null },
            })
            toast.success('Code auxiliaire enregistré')
            onSaved()
        } catch (e) {
            toastError(e)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{entity.name}</span>
            <div className="flex items-center gap-2">
                <Input
                    aria-label={`Code auxiliaire de ${entity.name}`}
                    className="h-9 w-48 font-mono uppercase"
                    placeholder={entity.customCode ? undefined : entity.code}
                    value={value}
                    onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17))}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && dirty) {
                            e.preventDefault()
                            save()
                        }
                    }}
                />
                <Button type="button" size="sm" variant="outline" disabled={!dirty || saving} onClick={save}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'Enregistrer'}
                </Button>
            </div>
        </div>
    )
}
