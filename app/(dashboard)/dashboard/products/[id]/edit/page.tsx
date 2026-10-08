'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, errorMessage, toastWarnings } from '@/lib/api-client'
import { ErrorState, TableSkeleton } from '@/components/states'

const productSchema = z.object({
    name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
    sku: z.string().optional(),
    description: z.string().optional(),
    category: z.string().optional(),
    brand: z.string().optional(),
    baseUnit: z.string().min(1, "L'unité de base est requise"),
    purchasePrice: z.number().min(0, "Le prix d'achat doit être positif"),
    sellingPrice: z.number().min(0, 'Le prix de vente doit être positif'),
    isActive: z.boolean().default(true),
    // TVA propre au produit (%) : vide = taux standard de l'entreprise
    vatRate: z
        .string()
        .optional()
        .refine((v) => !v || (Number(v.replace(',', '.')) >= 0 && Number(v.replace(',', '.')) <= 100), 'Taux entre 0 et 100'),
})

type ProductForm = z.infer<typeof productSchema>

const categories = [
    'Boissons gazeuses',
    'Bières',
    'Jus de fruits',
    'Eaux minérales',
    'Vins et spiritueux',
    'Autres',
]

const units = [
    { value: 'bouteille', label: 'Bouteille' },
    { value: 'canette', label: 'Canette' },
    { value: 'pack', label: 'Pack' },
    { value: 'casier', label: 'Casier' },
    { value: 'carton', label: 'Carton' },
    { value: 'litre', label: 'Litre' },
]

export default function EditProductPage() {
    const router = useRouter()
    const params = useParams()
    const productId = params.id as string

    const [isLoading, setIsLoading] = useState(false)
    const [isFetching, setIsFetching] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reloadKey, setReloadKey] = useState(0)

    const {
        register,
        handleSubmit,
        setValue,
        watch,
        reset,
        formState: { errors },
    } = useForm<ProductForm>({
        resolver: zodResolver(productSchema),
        defaultValues: {
            isActive: true,
            purchasePrice: 0,
            sellingPrice: 0,
        },
    })

    const isActive = watch('isActive')
    const currentCategory = watch('category')
    const currentBaseUnit = watch('baseUnit')

    useEffect(() => {
        async function fetchProduct() {
            setIsFetching(true)
            setLoadError(null)
            try {
                const result = await apiFetch<{ data: any }>(`/api/products/${productId}`)
                const p = result.data
                reset({
                    name: p.name || '',
                    sku: p.sku || '',
                    description: p.description || '',
                    category: p.category || '',
                    brand: p.brand || '',
                    baseUnit: p.base_unit || 'casier',
                    purchasePrice: Number(p.purchase_price) || 0,
                    sellingPrice: Number(p.selling_price) || 0,
                    isActive: p.is_active !== false,
                    vatRate: p.vat_rate == null ? '' : String(Number(p.vat_rate)),
                })
            } catch (e) {
                setLoadError(errorMessage(e))
            } finally {
                setIsFetching(false)
            }
        }
        fetchProduct()
    }, [productId, reset, reloadKey])

    async function onSubmit(data: ProductForm) {
        setIsLoading(true)
        setError(null)

        try {
            const result = await apiFetch<{ warnings?: unknown }>(`/api/products/${productId}`, {
                method: 'PUT',
                body: {
                    ...data,
                    vatRate: data.vatRate && data.vatRate.trim() !== '' ? Number(data.vatRate.replace(',', '.')) : null,
                },
            })

            toast.success('Produit mis à jour')
            toastWarnings(result?.warnings)
            router.push(`/dashboard/products/${productId}`)
            router.refresh()
        } catch (e) {
            setError(errorMessage(e))
        } finally {
            setIsLoading(false)
        }
    }

    const backLink = (
        <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href={`/dashboard/products/${productId}`}>
                <ArrowLeft aria-hidden="true" />
                Fiche produit
            </Link>
        </Button>
    )

    if (isFetching) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier le produit" description="Chargement…" />
                <PageShell>
                    <div className="mx-auto w-full max-w-3xl space-y-6">
                        {backLink}
                        <div className="rounded-xl border border-border bg-card p-6">
                            <TableSkeleton rows={6} columns={2} />
                        </div>
                    </div>
                </PageShell>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="flex min-h-screen flex-col">
                <DashboardHeader title="Modifier le produit" />
                <PageShell>
                    <div className="mx-auto w-full max-w-3xl space-y-6">
                        {backLink}
                        <ErrorState
                            title="Impossible de charger le produit"
                            description={loadError}
                            onRetry={() => setReloadKey((k) => k + 1)}
                        />
                    </div>
                </PageShell>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Modifier le produit"
                description="Mettez à jour les informations du produit"
            />

            <PageShell>
                <div className="mx-auto w-full max-w-3xl space-y-6">
                    {backLink}

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        {error && (
                            <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <span>{error}</span>
                            </div>
                        )}

                        <Card>
                            <CardHeader>
                                <CardTitle>Informations générales</CardTitle>
                                <CardDescription>Nom, référence et classement du produit.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom du produit *</Label>
                                    <Input
                                        id="name"
                                        placeholder="Ex. : Coca-Cola 33 cl"
                                        aria-invalid={!!errors.name}
                                        {...register('name')}
                                        disabled={isLoading}
                                    />
                                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="sku">SKU / référence</Label>
                                    <Input
                                        id="sku"
                                        placeholder="Ex. : COCA-33CL"
                                        {...register('sku')}
                                        disabled={isLoading}
                                    />
                                    <p className="text-xs text-muted-foreground">Code unique pour retrouver l’article.</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="brand">Marque</Label>
                                    <Input
                                        id="brand"
                                        placeholder="Ex. : Coca-Cola"
                                        {...register('brand')}
                                        disabled={isLoading}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="category">Catégorie</Label>
                                    <Select
                                        value={currentCategory}
                                        onValueChange={(value) => setValue('category', value)}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger id="category" className="w-full">
                                            <SelectValue placeholder="Sélectionner une catégorie" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categories.map((cat) => (
                                                <SelectItem key={cat} value={cat}>
                                                    {cat}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="baseUnit">Unité de base *</Label>
                                    <Select
                                        value={currentBaseUnit}
                                        onValueChange={(value) => setValue('baseUnit', value)}
                                        disabled={isLoading}
                                    >
                                        <SelectTrigger id="baseUnit" className="w-full" aria-invalid={!!errors.baseUnit}>
                                            <SelectValue placeholder="Sélectionner une unité" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {units.map((unit) => (
                                                <SelectItem key={unit.value} value={unit.value}>
                                                    {unit.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.baseUnit ? (
                                        <p className="text-xs text-destructive">{errors.baseUnit.message}</p>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">Unité dans laquelle le stock est compté.</p>
                                    )}
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="description">Description</Label>
                                    <Textarea
                                        id="description"
                                        placeholder="Description du produit (facultatif)"
                                        {...register('description')}
                                        disabled={isLoading}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Prix</CardTitle>
                                <CardDescription>Prix d’achat et de vente par défaut.</CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="purchasePrice">Prix d’achat (FCFA) *</Label>
                                    <Input
                                        id="purchasePrice"
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        className="tabular"
                                        aria-invalid={!!errors.purchasePrice}
                                        {...register('purchasePrice', { valueAsNumber: true })}
                                        disabled={isLoading}
                                    />
                                    {errors.purchasePrice && <p className="text-xs text-destructive">{errors.purchasePrice.message}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="sellingPrice">Prix de vente (FCFA) *</Label>
                                    <Input
                                        id="sellingPrice"
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        className="tabular"
                                        aria-invalid={!!errors.sellingPrice}
                                        {...register('sellingPrice', { valueAsNumber: true })}
                                        disabled={isLoading}
                                    />
                                    {errors.sellingPrice && <p className="text-xs text-destructive">{errors.sellingPrice.message}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="vatRate">TVA propre au produit (%)</Label>
                                    <Input
                                        id="vatRate"
                                        inputMode="decimal"
                                        placeholder="Taux standard"
                                        className="tabular"
                                        aria-invalid={!!errors.vatRate}
                                        {...register('vatRate')}
                                        disabled={isLoading}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Laissez vide pour le taux standard de l’entreprise ; 0 pour un produit exonéré. Sans effet si l’entreprise n’est pas assujettie.
                                    </p>
                                    {errors.vatRate && <p className="text-xs text-destructive">{errors.vatRate.message}</p>}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>Disponibilité</CardTitle>
                                <CardDescription>Indiquez si le produit peut être vendu.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="isActive">Produit actif</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Les produits inactifs ne sont pas proposés à la vente.
                                        </p>
                                    </div>
                                    <Switch
                                        id="isActive"
                                        checked={isActive}
                                        onCheckedChange={(checked) => setValue('isActive', checked)}
                                        disabled={isLoading}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <div className="flex justify-end gap-3">
                            <Button type="button" variant="outline" asChild disabled={isLoading}>
                                <Link href={`/dashboard/products/${productId}`}>Annuler</Link>
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                {isLoading ? 'Enregistrement…' : 'Enregistrer les modifications'}
                            </Button>
                        </div>
                    </form>
                </div>
            </PageShell>
        </div>
    )
}
