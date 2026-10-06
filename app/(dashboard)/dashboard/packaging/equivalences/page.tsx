'use client'

import { useState, useEffect } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
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
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Équivalences d'Emballages"
                description="Gérez les emballages interchangeables entre formats"
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6">
                <div className="mb-2">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/packaging">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour aux emballages
                        </Link>
                    </Button>
                </div>

                {error && (
                    <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <div className="max-w-2xl space-y-6">
                    {/* Add new equivalence */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
                                Nouvelle Équivalence
                            </CardTitle>
                            <CardDescription>
                                Liez deux emballages interchangeables. Ex : Casier Solibra 65cl = Casier Brassivoire 65cl
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label>Emballage A</Label>
                                    <Select value={selectedA} onValueChange={setSelectedA}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choisir un emballage..." />
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
                                    <Label>Emballage B</Label>
                                    <Select value={selectedB} onValueChange={setSelectedB}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Choisir un emballage..." />
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
                                onClick={handleAdd}
                                disabled={!selectedA || !selectedB || saving}
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Création...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Créer l&apos;équivalence
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Existing equivalences */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Équivalences existantes</CardTitle>
                            <CardDescription>
                                {equivalences.length} équivalence{equivalences.length > 1 ? 's' : ''} configurée{equivalences.length > 1 ? 's' : ''}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <TableSkeleton rows={3} columns={3} />
                            ) : loadError ? (
                                <ErrorState onRetry={() => fetchData()} />
                            ) : equivalences.length === 0 ? (
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
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Emballage A</TableHead>
                                            <TableHead className="text-center">Lien</TableHead>
                                            <TableHead>Emballage B</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {equivalences.map(eq => (
                                            <TableRow key={eq.id}>
                                                <TableCell>
                                                    <div>
                                                        <p className="font-semibold">{eq.name_a}</p>
                                                        <p className="text-xs text-muted-foreground">{formatNumber(eq.units_a)} u/casier</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <ArrowLeftRight className="h-4 w-4 mx-auto text-muted-foreground" />
                                                </TableCell>
                                                <TableCell>
                                                    <div>
                                                        <p className="font-semibold">{eq.name_b}</p>
                                                        <p className="text-xs text-muted-foreground">{formatNumber(eq.units_b)} u/casier</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setPendingDelete(eq)}
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        aria-label={`Supprimer l'équivalence ${eq.name_a} / ${eq.name_b}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </main>

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
                            className="bg-destructive text-white hover:bg-destructive/90"
                        >
                            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
