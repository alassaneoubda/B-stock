'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

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
            try {
                const res = await fetch(`/api/products/${productId}`)
                const result = await res.json()
                if (!res.ok || !result.data) {
                    setError('Produit introuvable')
                    return
                }
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
                })
            } catch {
                setError('Erreur lors du chargement du produit')
            } finally {
                setIsFetching(false)
            }
        }
        fetchProduct()
    }, [productId, reset])

    async function onSubmit(data: ProductForm) {
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch(`/api/products/${productId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })

            const result = await response.json()

            if (!response.ok) {
                setError(result.error || 'Une erreur est survenue')
                return
            }

            router.push(`/dashboard/products/${productId}`)
            router.refresh()
        } catch {
            setError('Une erreur est survenue. Veuillez réessayer.')
        } finally {
            setIsLoading(false)
        }
    }

    if (isFetching) {
        return (
            <div className="flex flex-col min-h-screen">
                <DashboardHeader title="Modifier le produit" description="Chargement..." />
                <main className="flex-1 p-4 lg:p-6 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </main>
            </div>
        )
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Modifier le produit"
                description="Mettez à jour les informations du produit"
            />

            <main className="flex-1 p-4 lg:p-6">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href={`/dashboard/products/${productId}`}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour à la fiche produit
                        </Link>
                    </Button>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
                    {error && (
                        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <Card>
                        <CardHeader>
                            <CardTitle>Informations générales</CardTitle>
                            <CardDescription>Les informations de base du produit</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nom du produit *</Label>
                                    <Input
                                        id="name"
                                        placeholder="Ex: Coca-Cola 33cl"
                                        {...register('name')}
                                        disabled={isLoading}
                                    />
                                    {errors.name && (
                                        <p className="text-sm text-destructive">{errors.name.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="sku">SKU / Référence</Label>
                                    <Input
                                        id="sku"
                                        placeholder="Ex: COCA-33CL"
                                        {...register('sku')}
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="brand">Marque</Label>
                                    <Input
                                        id="brand"
                                        placeholder="Ex: Coca-Cola"
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
                                        <SelectTrigger>
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
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Description du produit (optionnel)"
                                    {...register('description')}
                                    disabled={isLoading}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="baseUnit">Unité de base *</Label>
                                <Select
                                    value={currentBaseUnit}
                                    onValueChange={(value) => setValue('baseUnit', value)}
                                    disabled={isLoading}
                                >
                                    <SelectTrigger>
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
                                {errors.baseUnit && (
                                    <p className="text-sm text-destructive">{errors.baseUnit.message}</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Prix</CardTitle>
                            <CardDescription>Prix d&apos;achat et de vente</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="purchasePrice">Prix d&apos;achat (FCFA) *</Label>
                                    <Input
                                        id="purchasePrice"
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        {...register('purchasePrice', { valueAsNumber: true })}
                                        disabled={isLoading}
                                    />
                                    {errors.purchasePrice && (
                                        <p className="text-sm text-destructive">{errors.purchasePrice.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="sellingPrice">Prix de vente (FCFA) *</Label>
                                    <Input
                                        id="sellingPrice"
                                        type="number"
                                        min="0"
                                        placeholder="0"
                                        {...register('sellingPrice', { valueAsNumber: true })}
                                        disabled={isLoading}
                                    />
                                    {errors.sellingPrice && (
                                        <p className="text-sm text-destructive">{errors.sellingPrice.message}</p>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Statut</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label htmlFor="isActive">Produit actif</Label>
                                    <p className="text-sm text-muted-foreground">
                                        Les produits inactifs ne seront pas disponibles à la vente
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

                    <div className="flex justify-end gap-4">
                        <Button type="button" variant="outline" asChild disabled={isLoading}>
                            <Link href={`/dashboard/products/${productId}`}>Annuler</Link>
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Enregistrement...
                                </>
                            ) : (
                                'Enregistrer les modifications'
                            )}
                        </Button>
                    </div>
                </form>
            </main>
        </div>
    )
}
