'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import {
    AlertTriangle,
    CheckCircle2,
    Download,
    FileSearch,
    Loader2,
    Lock,
    LockOpen,
    Scale,
    Settings2,
    XCircle,
} from 'lucide-react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatCard, StatusBadge } from '@/components/app/blocks'
import { EmptyState, ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
import { ApiError, apiFetch, errorMessage, toastError } from '@/lib/api-client'
import { EXPORT_FORMATS, JOURNAL_KEYS, JOURNAL_LABELS, type ExportFormat, type JournalKey } from '@/lib/accounting/chart'
import type { AccountingControl, EntryLine } from '@/lib/accounting/entries'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format'

type Preview = { control: AccountingControl; lines: EntryLine[]; truncated: boolean }

type PeriodRow = {
    period: string
    periodStart: string
    periodEnd: string
    label: string
    isPast: boolean
    locked: boolean
    lockedAt: string | null
    lockedByName: string | null
    exportedAt: string | null
    exportFormat: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Mois précédent : période proposée par défaut (celle qu'on transmet au cabinet). */
function previousMonth(): { from: string; to: string } {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: isoDay(start), to: isoDay(end) }
}

export default function AccountingExportPage() {
    const { data: session } = useSession()
    const isOwner = session?.user?.role === 'owner'

    const initial = useMemo(previousMonth, [])
    const [from, setFrom] = useState(initial.from)
    const [to, setTo] = useState(initial.to)
    const [journals, setJournals] = useState<JournalKey[]>([...JOURNAL_KEYS])
    const [format, setFormat] = useState<ExportFormat>('csv')

    const [preview, setPreview] = useState<Preview | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [previewError, setPreviewError] = useState<string | null>(null)
    const [downloading, setDownloading] = useState(false)

    const [periods, setPeriods] = useState<PeriodRow[] | null>(null)
    const [periodsError, setPeriodsError] = useState<string | null>(null)

    const query = useMemo(() => {
        const p = new URLSearchParams({ from, to, journals: journals.join(','), format })
        return p.toString()
    }, [from, to, journals, format])

    const loadPeriods = useCallback(async () => {
        setPeriodsError(null)
        try {
            const { data } = await apiFetch<{ data: PeriodRow[] }>('/api/accounting/periods')
            setPeriods(data)
        } catch (e) {
            setPeriodsError(errorMessage(e))
        }
    }, [])

    useEffect(() => {
        if (isOwner) loadPeriods()
    }, [isOwner, loadPeriods])

    // Toute modification des critères invalide le contrôle affiché
    useEffect(() => {
        setPreview(null)
        setPreviewError(null)
    }, [from, to, journals])

    async function runPreview() {
        setPreviewLoading(true)
        setPreviewError(null)
        try {
            const { data } = await apiFetch<{ data: Preview }>(`/api/accounting/preview?${query}`)
            setPreview(data)
        } catch (e) {
            setPreviewError(errorMessage(e))
        } finally {
            setPreviewLoading(false)
        }
    }

    async function download() {
        setDownloading(true)
        try {
            const res = await fetch(`/api/accounting/export?${query}`)
            if (!res.ok) {
                const payload = await res.json().catch(() => null)
                throw new ApiError(payload?.error || 'Export impossible', res.status, payload?.code)
            }
            const blob = await res.blob()
            const disposition = res.headers.get('Content-Disposition') || ''
            const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'ecritures.csv'
            const href = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = href
            a.download = filename
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(href)
            toast.success('Export téléchargé', { description: filename })
            loadPeriods()
        } catch (e) {
            toastError(e, 'Export impossible')
        } finally {
            setDownloading(false)
        }
    }

    function selectMonth(period: string) {
        const [y, m] = period.split('-').map(Number)
        setFrom(isoDay(new Date(y, m - 1, 1)))
        setTo(isoDay(new Date(y, m, 0)))
    }

    const toggleJournal = (k: JournalKey, checked: boolean) =>
        setJournals((js) => (checked ? JOURNAL_KEYS.filter((j) => j === k || js.includes(j)) : js.filter((j) => j !== k)))

    const control = preview?.control
    const canExport = Boolean(control && control.unbalancedPieces.length === 0 && control.lineCount > 0)

    if (session && !isOwner) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Export comptable" />
                <PageShell>
                    <EmptyState icon={Lock} title="Réservé au propriétaire" description="Seul le propriétaire du compte peut exporter la comptabilité." />
                </PageShell>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Export comptable"
                description="Écritures SYSCOHADA à transmettre à votre expert-comptable"
                actions={
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/dashboard/settings/accounting">
                            <Settings2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Plan de comptes
                        </Link>
                    </Button>
                }
            />
            <PageShell>
                <Panel title="Paramètres de l'export" description="Période, journaux et format du fichier">
                    <div className="space-y-5 p-5">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="space-y-2">
                                <Label htmlFor="month">Mois</Label>
                                <Select onValueChange={selectMonth}>
                                    <SelectTrigger id="month" className="h-10 w-full">
                                        <SelectValue placeholder="Choisir un mois" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {(periods ?? []).map((p) => (
                                            <SelectItem key={p.period} value={p.period}>
                                                {p.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="from">Du</Label>
                                <Input id="from" type="date" className="h-10" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="to">Au</Label>
                                <Input id="to" type="date" className="h-10" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="format">Format</Label>
                                <Select value={format} onValueChange={(v) => setFormat(v as ExportFormat)}>
                                    <SelectTrigger id="format" className="h-10 w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {EXPORT_FORMATS.map((f) => (
                                            <SelectItem key={f.value} value={f.value}>
                                                {f.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">{EXPORT_FORMATS.find((f) => f.value === format)?.description}</p>
                            </div>
                        </div>

                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium text-foreground">Journaux à inclure</legend>
                            <div className="flex flex-wrap gap-x-6 gap-y-3">
                                {JOURNAL_KEYS.map((k) => (
                                    <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
                                        <Checkbox checked={journals.includes(k)} onCheckedChange={(v) => toggleJournal(k, v === true)} />
                                        <span className="font-mono text-xs font-semibold">{k}</span>
                                        <span className="text-muted-foreground">{JOURNAL_LABELS[k]}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" onClick={runPreview} disabled={previewLoading || journals.length === 0}>
                                {previewLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                    <FileSearch className="mr-2 h-4 w-4" aria-hidden="true" />
                                )}
                                Contrôler
                            </Button>
                            <Button type="button" variant="brand" onClick={download} disabled={!canExport || downloading}>
                                {downloading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                ) : (
                                    <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                                )}
                                Télécharger l&apos;export
                            </Button>
                            {!preview && !previewLoading && (
                                <p className="text-xs text-muted-foreground">Lancez le contrôle : le téléchargement est possible une fois les pièces vérifiées.</p>
                            )}
                        </div>
                    </div>
                </Panel>

                {previewError && <ErrorState description={previewError} onRetry={runPreview} />}
                {previewLoading && !preview && (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
                        {Array.from({ length: 4 }, (_, i) => (
                            <Skeleton key={i} className="h-28 rounded-xl" />
                        ))}
                    </div>
                )}

                {control && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <StatCard
                                label="Écritures"
                                value={formatNumber(control.lineCount)}
                                hint={`${formatNumber(control.pieceCount)} pièce(s)`}
                                icon={FileSearch}
                            />
                            <StatCard label="Total débit" value={formatMoney(control.totalDebit)} icon={Scale} />
                            <StatCard label="Total crédit" value={formatMoney(control.totalCredit)} icon={Scale} />
                            <StatCard
                                label="Pièces déséquilibrées"
                                value={formatNumber(control.unbalancedPieces.length)}
                                hint={control.unbalancedPieces.length === 0 ? 'Débit = crédit pour chaque pièce' : 'Export bloqué'}
                                icon={control.unbalancedPieces.length === 0 ? CheckCircle2 : XCircle}
                                tone={control.unbalancedPieces.length === 0 ? 'success' : 'danger'}
                            />
                        </div>

                        {control.lineCount === 0 && (
                            <EmptyState title="Aucune écriture sur cette période" description="Aucun document comptabilisable pour la période et les journaux choisis." />
                        )}

                        {control.byJournal.length > 0 && (
                            <Panel title="Totaux par journal">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Journal</TableHead>
                                            <TableHead className="text-right">Pièces</TableHead>
                                            <TableHead className="text-right">Lignes</TableHead>
                                            <TableHead className="text-right">Débit</TableHead>
                                            <TableHead className="text-right">Crédit</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {control.byJournal.map((j) => (
                                            <TableRow key={j.journalKey}>
                                                <TableCell>
                                                    <span className="font-mono text-xs font-semibold">{j.journal}</span>{' '}
                                                    <span className="text-muted-foreground">{JOURNAL_LABELS[j.journalKey]}</span>
                                                </TableCell>
                                                <TableCell className="tabular text-right">{formatNumber(j.pieces)}</TableCell>
                                                <TableCell className="tabular text-right">{formatNumber(j.lines)}</TableCell>
                                                <TableCell className="tabular text-right">{formatMoney(j.debit)}</TableCell>
                                                <TableCell className="tabular text-right">{formatMoney(j.credit)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Panel>
                        )}

                        {control.unbalancedPieces.length > 0 && (
                            <Panel title="Pièces déséquilibrées" description="À signaler au support B-Stock">
                                <ul className="divide-y divide-border">
                                    {control.unbalancedPieces.map((p) => (
                                        <li key={p.pieceKey} className="flex justify-between px-5 py-2.5 text-sm">
                                            <span>
                                                {p.journal} · {p.piece}
                                            </span>
                                            <span className="tabular text-destructive">
                                                D {formatMoney(p.debit)} / C {formatMoney(p.credit)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </Panel>
                        )}

                        {control.warnings.length > 0 && (
                            <section className="space-y-2 rounded-xl border border-warning/30 bg-warning-soft px-5 py-4 text-sm text-warning-foreground">
                                <h3 className="flex items-center gap-2 font-semibold">
                                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                                    Points à vérifier avec votre comptable
                                </h3>
                                <ul className="list-disc space-y-1 pl-6">
                                    {control.warnings.map((w, i) => (
                                        <li key={i}>{w}</li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {control.ignored.length > 0 && (
                            <Panel title={`Documents ignorés (${control.ignored.length})`} description="Non exportés, avec la raison">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Document</TableHead>
                                            <TableHead>N°</TableHead>
                                            <TableHead>Raison</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {control.ignored.slice(0, 200).map((d, i) => (
                                            <TableRow key={`${d.number}-${i}`}>
                                                <TableCell className="whitespace-nowrap">{formatDate(d.date)}</TableCell>
                                                <TableCell>{d.type}</TableCell>
                                                <TableCell className="font-mono text-xs">{d.number}</TableCell>
                                                <TableCell className="text-muted-foreground">{d.reason}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Panel>
                        )}

                        {preview && preview.lines.length > 0 && (
                            <Panel
                                title="Aperçu des écritures"
                                description={preview.truncated ? `Premières lignes sur ${formatNumber(control.lineCount)}` : undefined}
                            >
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Jnl</TableHead>
                                                <TableHead>Pièce</TableHead>
                                                <TableHead>Compte</TableHead>
                                                <TableHead>Auxiliaire</TableHead>
                                                <TableHead>Libellé</TableHead>
                                                <TableHead className="text-right">Débit</TableHead>
                                                <TableHead className="text-right">Crédit</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {preview.lines.map((l, i) => (
                                                <TableRow key={`${l.pieceKey}-${i}`}>
                                                    <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell>
                                                    <TableCell className="font-mono text-xs">{l.journal}</TableCell>
                                                    <TableCell className="whitespace-nowrap font-mono text-xs">{l.piece}</TableCell>
                                                    <TableCell className="font-mono text-xs">{l.account}</TableCell>
                                                    <TableCell className="font-mono text-xs">{l.auxiliary ?? ''}</TableCell>
                                                    <TableCell className="max-w-xs truncate">{l.label}</TableCell>
                                                    <TableCell className="tabular text-right">{l.debit ? formatMoney(l.debit) : ''}</TableCell>
                                                    <TableCell className="tabular text-right">{l.credit ? formatMoney(l.credit) : ''}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </Panel>
                        )}
                    </>
                )}

                <PeriodsPanel periods={periods} error={periodsError} onReload={loadPeriods} />
            </PageShell>
        </div>
    )
}

function PeriodsPanel({ periods, error, onReload }: { periods: PeriodRow[] | null; error: string | null; onReload: () => void }) {
    const [pending, setPending] = useState<{ row: PeriodRow; action: 'lock' | 'unlock'; force: boolean } | null>(null)
    const [busy, setBusy] = useState(false)

    async function confirm() {
        if (!pending) return
        setBusy(true)
        try {
            const res = await apiFetch<{ message: string }>('/api/accounting/periods', {
                method: 'POST',
                body: { period: pending.row.period, action: pending.action, force: pending.force },
            })
            toast.success(res.message)
            setPending(null)
            onReload()
        } catch (e) {
            if (e instanceof ApiError && e.code === 'NOT_EXPORTED') {
                // Deuxième confirmation : clôture sans export complet
                setPending({ ...pending, force: true })
                toast.warning(e.message)
            } else {
                toastError(e)
                setPending(null)
            }
        } finally {
            setBusy(false)
        }
    }

    return (
        <Panel
            title="Clôture des périodes"
            description="Un mois clôturé ne peut plus recevoir de facture, d'avoir ou de dépense (création, modification, annulation)."
        >
            {error ? (
                <div className="p-5">
                    <ErrorState description={error} onRetry={onReload} />
                </div>
            ) : !periods ? (
                <div className="space-y-2 p-5" aria-busy="true">
                    {Array.from({ length: 4 }, (_, i) => (
                        <Skeleton key={i} className="h-10 w-full rounded-lg" />
                    ))}
                </div>
            ) : (
                <ul className="divide-y divide-border">
                    {periods.map((p) => (
                        <li key={p.period} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <p className="text-sm font-medium capitalize text-foreground">{p.label}</p>
                                <p className="text-xs text-muted-foreground">
                                    {p.exportedAt ? `Exporté le ${formatDateTime(p.exportedAt)}` : 'Pas encore exporté (tous journaux)'}
                                    {p.locked && p.lockedAt
                                        ? ` · clôturé le ${formatDateTime(p.lockedAt)}${p.lockedByName ? ` par ${p.lockedByName}` : ''}`
                                        : ''}
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                {p.locked ? (
                                    <StatusBadge label="Clôturé" tone="default" />
                                ) : p.isPast ? (
                                    <StatusBadge label="Ouvert" tone="success" />
                                ) : (
                                    <StatusBadge label="En cours" tone="info" />
                                )}
                                {p.locked ? (
                                    <Button size="sm" variant="outline" onClick={() => setPending({ row: p, action: 'unlock', force: false })}>
                                        <LockOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                        Rouvrir
                                    </Button>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!p.isPast}
                                        title={p.isPast ? undefined : 'Seul un mois terminé peut être clôturé'}
                                        onClick={() => setPending({ row: p, action: 'lock', force: false })}
                                    >
                                        <Lock className="mr-1.5 h-4 w-4" aria-hidden="true" />
                                        Clôturer
                                    </Button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && !busy && setPending(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {pending?.action === 'unlock' ? `Rouvrir ${pending.row.label} ?` : `Clôturer ${pending?.row.label} ?`}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {pending?.action === 'unlock'
                                ? 'Les documents de ce mois pourront de nouveau être créés, modifiés ou annulés. Pensez à refaire l’export transmis au cabinet.'
                                : pending?.force
                                  ? 'Aucun export complet ne couvre ce mois. Clôturer quand même ?'
                                  : 'Plus aucune facture, aucun avoir ni aucune dépense daté de ce mois ne pourra être créé, modifié ou annulé.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={busy}
                            onClick={(e) => {
                                e.preventDefault()
                                confirm()
                            }}
                        >
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                            {pending?.action === 'unlock' ? 'Rouvrir' : pending?.force ? 'Clôturer sans export' : 'Clôturer'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Panel>
    )
}
