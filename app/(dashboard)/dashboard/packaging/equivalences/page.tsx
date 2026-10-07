'use client'

import { useState, useEffect } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { ArrowLeft, ArrowLeftRight, Plus, Trash2, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
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
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import { apiFetch, errorMessage, toastError, toastWarnings } from '@/lib/api-client'
import { formatNumber } from '@/lib/format'

interface PackagingType {
    id: string
    name: string
    units_per_case: number
}

interface Equivalence {
    id: string
    packaging_type_a: string
    packaging_type_b: string
    name_a: string
    name_b: string
    units_a: number
    units_b: number
    created_at: string
}

export default function PackagingEquivalencesPage() {
    const [packagingTypes, setPackagingTypes] = useState<PackagingType[]>([])
    const [equivalences, setEquivalences] = useState<Equivalence[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pendingDelete, setPendingDelete] = useState<Equivalence | null>(null)
    const [deleting, setDeleting] = useState(false)

    const [selectedA, setSelectedA] = useState('')
    const [selectedB, setSelectedB] = useState('')

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData({ silent = false }: { silent?: boolean } = {}) {
        if (!silent) setLoading(true)
        setLoadError(false)
        try {
            const [pkgData, eqData] = await Promise.all([
                apiFetch<{ data?: PackagingType[]; packagingTypes?: PackagingType[] }>('/api/packaging'),
                apiFetch<{ data?: Equivalence[] }>('/api/packaging/equivalences'),
            ])
            setPackagingTypes(pkgData.packagingTypes || pkgData.data || [])
            setEquivalences(eqData.data || [])
        } catch (e) {
            if (silent) toastError(e, 'Actualisation impossible')
            else setLoadError(true)
        } finally {
            setLoading(false)
        }
    }

    async function handleAdd() {
        if (!selectedA || !selectedB || saving) return
        if (selectedA === selectedB) {
            setError('Les deux emballages doivent être différents')
            return
        }

        setSaving(true)
        setError(null)

        try {
            const res = await apiFetch<{ warnings?: unknown }>('/api/packaging/equivalences', {
                method: 'POST',
                body: {
                    packagingTypeA: selectedA,
                    packagingTypeB: selectedB,
                },
            })

            toast.success('Équivalence créée')
            toastWarnings(res?.warnings)
            setSelectedA('')
            setSelectedB('')
            fetchData({ silent: true })
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setSaving(false)
        }
    }

    async function confirmDelete() {
        if (!pendingDelete) return
        setDeleting(true)
        try {
            const res = await apiFetch<{ message?: string; warnings?: unknown }>(
                `/api/packaging/equivalences?id=${encodeURIComponent(pendingDelete.id)}`,
                { method: 'DELETE' }
            )
            toast.success(res?.message || 'Équivalence supprimée')
            toastWarnings(res?.warnings)
            setPendingDelete(null)
            fetchData({ silent: true })
        } catch (e) {
            toastError(e, 'Suppression impossible')
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Équivalences d'emballages"
                description="Emballages interchangeables entre formats"
            />

            <PageShell>
                <Button variant="ghost" size="sm" asChild className="-ml-2">
                    <Link href="/dashboard/packaging">
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Emballages
                    </Link>
                </Button>

                <div className="grid items-start gap-6 lg:grid-cols-3">
                    {/* Nouvelle équivalence */}
                    <Card className="lg:col-span-1">
                        <CardHeader>
                            <CardTitle>Nouvelle équivalence</CardTitle>
                            <CardDescription>
                                Liez deux emballages interchangeables. Ex. : casier Solibra 65 cl = casier Brassivoire 65 cl.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {error && (
                                <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                    {error}
                                </div>
                            )}
                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="equivalence-a">Emballage A</Label>
                                    <Select value={selectedA} onValueChange={setSelectedA}>
                                        <SelectTrigger id="equivalence-a" className="w-full">
                                            <SelectValue placeholder="Choisir un emballage…" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {packagingTypes
                                                .filter(pt => pt.id !== selectedB)
                                                .map(pt => (
                                                    <SelectItem key={pt.id} value={pt.id}>
                                                        {pt.name} ({pt.units_per_case} u/casier)
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="equivalence-b">Emballage B</Label>
                                    <Select value={selectedB} onValueChange={setSelectedB}>
                                        <SelectTrigger id="equivalence-b" className="w-full">
                                            <SelectValue placeholder="Choisir un emballage…" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {packagingTypes
                                                .filter(pt => pt.id !== selectedA)
                                                .map(pt => (
                                                    <SelectItem key={pt.id} value={pt.id}>
                                                        {pt.name} ({pt.units_per_case} u/casier)
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <Button
                                variant="brand"
                                className="w-full"
                                onClick={handleAdd}
                                disabled={!selectedA || !selectedB || saving}
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                        Création…
                                    </>
                                ) : (
                                    <>
                                        <Plus className="h-4 w-4" aria-hidden="true" />
                                        Créer l&apos;équivalence
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Équivalences existantes */}
                    <Panel
                        className="lg:col-span-2"
                        title="Équivalences existantes"
                        description={
                            loading || loadError
                                ? undefined
                                : `${formatNumber(equivalences.length)} équivalence${equivalences.length > 1 ? 's' : ''} configurée${equivalences.length > 1 ? 's' : ''}`
                        }
                    >
                            {loading ? (
                                <div className="p-5">
                                    <TableSkeleton rows={3} columns={3} />
                                </div>
                            ) : loadError ? (
                                <div className="p-5">
                                    <ErrorState onRetry={() => fetchData()} />
                                </div>
                            ) : equivalences.length === 0 ? (
                                <div className="p-5">
                                <EmptyState
                                    icon={ArrowLeftRight}
                                    title="Aucune équivalence configurée"
                                    description={
                                        packagingTypes.length < 2
                                            ? 'Créez au moins deux types d’emballage pour pouvoir les lier.'
                                            : 'Liez deux emballages interchangeables avec le formulaire ci-dessus.'
                                    }
                                    action={
                                        packagingTypes.length < 2
                                            ? { label: 'Nouvel emballage', href: '/dashboard/packaging/new' }
                                            : undefined
                                    }
                                />
                                </div>
                            ) : (
                                <>
                                <div className="hidden md:block">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-5">Emballage A</TableHead>
                                            <TableHead className="w-12 text-center"><span className="sr-only">Lien</span></TableHead>
                                            <TableHead>Emballage B</TableHead>
                                            <TableHead className="w-12 pr-5"><span className="sr-only">Actions</span></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {equivalences.map(eq => (
                                            <TableRow key={eq.id} className="transition-colors hover:bg-muted/40">
                                                <TableCell className="pl-5">
                                                    <p className="text-sm font-medium text-foreground">{eq.name_a}</p>
                                                    <p className="tabular text-xs text-muted-foreground">{formatNumber(eq.units_a)} u. par casier</p>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <ArrowLeftRight className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                                </TableCell>
                                                <TableCell>
                                                    <p className="text-sm font-medium text-foreground">{eq.name_b}</p>
                                                    <p className="tabular text-xs text-muted-foreground">{formatNumber(eq.units_b)} u. par casier</p>
                                                </TableCell>
                                                <TableCell className="pr-5 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        onClick={() => setPendingDelete(eq)}
                                                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                        aria-label={`Supprimer l'équivalence ${eq.name_a} / ${eq.name_b}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                </div>

                                <ul className="divide-y divide-border md:hidden">
                                    {equivalences.map(eq => (
                                        <li key={eq.id} className="flex items-center gap-3 px-5 py-4">
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <p className="truncate text-sm font-medium text-foreground">{eq.name_a}</p>
                                                <p className="flex items-center gap-1.5 truncate text-sm text-foreground">
                                                    <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                                    {eq.name_b}
                                                </p>
                                                <p className="tabular text-xs text-muted-foreground">
                                                    {formatNumber(eq.units_a)} u. ↔ {formatNumber(eq.units_b)} u. par casier
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon-sm"
                                                onClick={() => setPendingDelete(eq)}
                                                className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                aria-label={`Supprimer l'équivalence ${eq.name_a} / ${eq.name_b}`}
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                                </>
                            )}
                    </Panel>
                </div>
            </PageShell>

            <AlertDialog
                open={pendingDelete !== null}
                onOpenChange={(open) => {
                    if (!open && !deleting) setPendingDelete(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cette équivalence ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {pendingDelete
                                ? `« ${pendingDelete.name_a} » et « ${pendingDelete.name_b} » ne seront plus considérés comme interchangeables lors des retours d’emballages.`
                                : ''}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={deleting}
                            onClick={(e) => {
                                e.preventDefault()
                                confirmDelete()
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
