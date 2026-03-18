'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { Loader2, ArrowLeft, Plus, Trash2, BoxesIcon } from 'lucide-react'
import Link from 'next/link'

const productSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  sku: z.string().min(1, 'Le SKU est requis'),
  description: z.string().optional(),
  category: z.string().optional(),
  brand: z.string().optional(),
  baseUnit: z.string().min(1, "L'unité de base est requise"),
  purchasePrice: z.number().min(0, "Le prix d'achat doit être positif"),
  sellingPrice: z.number().min(0, 'Le prix de vente doit être positif'),
  isActive: z.boolean().default(true),
})

type ProductForm = z.infer<typeof productSchema>

interface PackagingType {
  id: string
  name: string
  units_per_case: number
  deposit_price: number
}

interface VariantRow {
  packagingTypeId: string
  price: number
  costPrice: number
  barcode: string
}

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

export default function NewProductPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [packagingTypes, setPackagingTypes] = useState<PackagingType[]>([])
  const [variants, setVariants] = useState<VariantRow[]>([])

  const {
    register,
    handleSubmit,
    setValue,
    watch,
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
  const sellingPrice = watch('sellingPrice')
  const purchasePrice = watch('purchasePrice')

  useEffect(() => {
    fetch('/api/packaging')
      .then(r => r.json())
      .then(d => setPackagingTypes(d.packagingTypes || d.data || []))
      .catch(() => {})
  }, [])

  function addVariant() {
    setVariants(prev => [...prev, {
      packagingTypeId: '',
      price: sellingPrice || 0,
      costPrice: purchasePrice || 0,
      barcode: '',
    }])
  }

  function removeVariant(idx: number) {
    setVariants(prev => prev.filter((_, i) => i !== idx))
  }

  function updateVariant(idx: number, field: keyof VariantRow, value: string | number) {
    setVariants(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v))
  }

  async function onSubmit(data: ProductForm) {
    setIsLoading(true)
    setError(null)

    try {
      const validVariants = variants.filter(v => v.packagingTypeId)
      const payload: Record<string, unknown> = { ...data }

      if (validVariants.length > 0) {
        payload.variants = validVariants.map(v => ({
          packagingTypeId: v.packagingTypeId,
          price: v.price,
          costPrice: v.costPrice,
          barcode: v.barcode || undefined,
        }))
      }

      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Une erreur est survenue')
        return
      }

      router.push('/dashboard/products')
      router.refresh()
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.')
    } finally {
      setIsLoading(false)
    }
  }

  const usedPackagingIds = variants.map(v => v.packagingTypeId).filter(Boolean)

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader
        title="Nouveau produit"
        description="Ajoutez un nouveau produit à votre catalogue"
      />

      <main className="flex-1 p-4 lg:p-6">
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/products">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour aux produits
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
              <CardDescription>
                Les informations de base du produit
              </CardDescription>
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
                  <Label htmlFor="sku">SKU / Référence *</Label>
                  <Input
                    id="sku"
                    placeholder="Ex: COCA-33CL"
                    {...register('sku')}
                    disabled={isLoading}
                  />
                  {errors.sku && (
                    <p className="text-sm text-destructive">{errors.sku.message}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="brand">Marque</Label>
                  <Input
                    id="brand"
                    placeholder="Ex: Coca-Cola, Solibra..."
                    {...register('brand')}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Catégorie</Label>
                  <Select
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
              <CardTitle>Prix par défaut</CardTitle>
              <CardDescription>
                Prix de base du produit (utilisé si aucune variante n&apos;est définie)
              </CardDescription>
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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BoxesIcon className="h-5 w-5 text-muted-foreground" />
                    Variantes / Emballages
                  </CardTitle>
                  <CardDescription>
                    Ajoutez les différents formats de vente (casier 50cl, casier 66cl, pack 33cl...)
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addVariant}
                  disabled={isLoading || packagingTypes.length === 0}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Ajouter
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {packagingTypes.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">
                    Aucun type d&apos;emballage configuré.
                    <Link href="/dashboard/settings" className="text-primary ml-1 hover:underline">
                      Configurer les emballages
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Un emballage par défaut sera créé automatiquement.
                  </p>
                </div>
              ) : variants.length === 0 ? (
                <div className="text-center py-6">
                  <BoxesIcon className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground mt-2">
                    Aucune variante ajoutée. Un emballage par défaut sera créé automatiquement.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cliquez sur &quot;Ajouter&quot; pour définir des formats spécifiques.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {variants.map((variant, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-3 items-end p-4 rounded-lg border bg-muted/20">
                      <div className="col-span-12 sm:col-span-4 space-y-1">
                        <Label className="text-xs">Emballage *</Label>
                        <Select
                          value={variant.packagingTypeId}
                          onValueChange={(v) => updateVariant(idx, 'packagingTypeId', v)}
                          disabled={isLoading}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir..." />
                          </SelectTrigger>
                          <SelectContent>
                            {packagingTypes
                              .filter(pt => !usedPackagingIds.includes(pt.id) || pt.id === variant.packagingTypeId)
                              .map(pt => (
                                <SelectItem key={pt.id} value={pt.id}>
                                  {pt.name} ({pt.units_per_case} u/casier)
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-5 sm:col-span-3 space-y-1">
                        <Label className="text-xs">Prix vente (FCFA)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={variant.price}
                          onChange={e => updateVariant(idx, 'price', Number(e.target.value))}
                          disabled={isLoading}
                        />
                      </div>
                      <div className="col-span-5 sm:col-span-3 space-y-1">
                        <Label className="text-xs">Prix achat (FCFA)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={variant.costPrice}
                          onChange={e => updateVariant(idx, 'costPrice', Number(e.target.value))}
                          disabled={isLoading}
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-2 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeVariant(idx)}
                          disabled={isLoading}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              <Link href="/dashboard/products">Annuler</Link>
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Création...
                </>
              ) : (
                'Créer le produit'
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
