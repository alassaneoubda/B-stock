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
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    const [selectedA, setSelectedA] = useState('')
    const [selectedB, setSelectedB] = useState('')

    useEffect(() => {
        fetchData()
    }, [])

    async function fetchData() {
        setLoading(true)
        try {
            const [pkgRes, eqRes] = await Promise.all([
                fetch('/api/packaging'),
                fetch('/api/packaging/equivalences'),
            ])
            const pkgData = await pkgRes.json()
            const eqData = await eqRes.json()

            setPackagingTypes(pkgData.packagingTypes || pkgData.data || [])
            setEquivalences(eqData.data || [])
        } catch {
            setError('Erreur lors du chargement des données')
        } finally {
            setLoading(false)
        }
    }

    async function handleAdd() {
        if (!selectedA || !selectedB) return
        if (selectedA === selectedB) {
            setError('Les deux emballages doivent être différents')
            return
        }

        setSaving(true)
        setError(null)
        setSuccess(null)

        try {
            const res = await fetch('/api/packaging/equivalences', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    packagingTypeA: selectedA,
                    packagingTypeB: selectedB,
                }),
            })
            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Erreur lors de la création')
                return
            }

            setSuccess('Équivalence créée avec succès')
            setSelectedA('')
            setSelectedB('')
            fetchData()
        } catch {
            setError('Erreur réseau')
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Supprimer cette équivalence ?')) return

        try {
            const res = await fetch(`/api/packaging/equivalences?id=${id}`, {
                method: 'DELETE',
            })
            if (!res.ok) {
                const data = await res.json()
                setError(data.error || 'Erreur lors de la suppression')
                return
            }
            setSuccess('Équivalence supprimée')
            fetchData()
        } catch {
            setError('Erreur réseau')
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
                {success && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-700">
                        {success}
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
                                <div className="text-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                </div>
                            ) : equivalences.length === 0 ? (
                                <div className="text-center py-8">
                                    <ArrowLeftRight className="h-10 w-10 mx-auto text-muted-foreground/40" />
                                    <p className="text-sm text-muted-foreground mt-3">
                                        Aucune équivalence configurée
                                    </p>
                                </div>
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
                                                        <p className="text-xs text-muted-foreground">{eq.units_a} u/casier</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <ArrowLeftRight className="h-4 w-4 mx-auto text-muted-foreground" />
                                                </TableCell>
                                                <TableCell>
                                                    <div>
                                                        <p className="font-semibold">{eq.name_b}</p>
                                                        <p className="text-xs text-muted-foreground">{eq.units_b} u/casier</p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDelete(eq.id)}
                                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
        </div>
    )
}
