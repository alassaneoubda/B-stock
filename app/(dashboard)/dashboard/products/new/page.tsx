'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
import { AlertTriangle, ArrowLeft, BoxesIcon, Loader2, Plus, RotateCw, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { apiFetch, errorMessage, toastError, toastWarnings } from '@/lib/api-client'

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
  const [packagingLoading, setPackagingLoading] = useState(true)
  const [packagingError, setPackagingError] = useState(false)

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

  async function loadPackaging() {
    setPackagingLoading(true)
    setPackagingError(false)
    try {
      const d = await apiFetch<{ data?: PackagingType[]; packagingTypes?: PackagingType[] }>('/api/packaging')
      setPackagingTypes(d.packagingTypes || d.data || [])
    } catch (e) {
      setPackagingError(true)
      toastError(e, 'Emballages indisponibles')
    } finally {
      setPackagingLoading(false)
    }
  }

  useEffect(() => {
    loadPackaging()
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

      const result = await apiFetch<{ warnings?: unknown }>('/api/products', {
        method: 'POST',
        body: payload,
      })

      toast.success('Produit créé')
      toastWarnings(result?.warnings)
      router.push('/dashboard/products')
      router.refresh()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setIsLoading(false)
    }
  }

  const usedPackagingIds = variants.map(v => v.packagingTypeId).filter(Boolean)

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Nouveau produit"
        description="Ajoutez un article à votre catalogue"
      />

      <PageShell>
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/dashboard/products">
              <ArrowLeft aria-hidden="true" />
              Produits
            </Link>
          </Button>

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
                  <Label htmlFor="sku">SKU / référence *</Label>
                  <Input
                    id="sku"
                    placeholder="Ex. : COCA-33CL"
                    aria-invalid={!!errors.sku}
                    {...register('sku')}
                    disabled={isLoading}
                  />
                  {errors.sku ? (
                    <p className="text-xs text-destructive">{errors.sku.message}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Code unique pour retrouver l’article.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="brand">Marque</Label>
                  <Input
                    id="brand"
                    placeholder="Ex. : Coca-Cola, Solibra…"
                    {...register('brand')}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Catégorie</Label>
                  <Select onValueChange={(value) => setValue('category', value)} disabled={isLoading}>
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
                  <Select onValueChange={(value) => setValue('baseUnit', value)} disabled={isLoading}>
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
                <CardTitle>Prix par défaut</CardTitle>
                <CardDescription>Utilisés si aucune variante n’est définie.</CardDescription>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <CardTitle>Variantes et emballages</CardTitle>
                  <CardDescription>Formats de vente : casier 50 cl, casier 66 cl, pack 33 cl…</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addVariant}
                  disabled={isLoading || packagingLoading || packagingTypes.length === 0}
                >
                  <Plus aria-hidden="true" />
                  Ajouter
                </Button>
              </CardHeader>
              <CardContent>
                {packagingLoading ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Chargement des emballages…
                  </div>
                ) : packagingError ? (
                  <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-8 text-center">
                    <p className="text-sm text-foreground">Impossible de charger les emballages.</p>
                    <Button type="button" variant="outline" size="sm" onClick={loadPackaging}>
                      <RotateCw aria-hidden="true" />
                      Réessayer
                    </Button>
                  </div>
                ) : packagingTypes.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-8 text-center">
                    <p className="text-sm font-medium text-foreground">Aucun type d’emballage configuré</p>
                    <p className="text-xs text-muted-foreground">Un emballage par défaut sera créé automatiquement.</p>
                    <Button type="button" variant="outline" size="sm" asChild className="mt-1">
                      <Link href="/dashboard/packaging/new">Configurer les emballages</Link>
                    </Button>
                  </div>
                ) : variants.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-8 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <BoxesIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <p className="text-sm text-foreground">Aucune variante ajoutée</p>
                    <p className="text-xs text-muted-foreground">
                      Un emballage par défaut sera créé. Cliquez sur « Ajouter » pour définir des formats précis.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {variants.map((variant, idx) => (
                      <div key={idx} className="grid grid-cols-12 items-end gap-3 rounded-lg border border-border bg-muted/30 p-4">
                        <div className="col-span-12 space-y-2 sm:col-span-5">
                          <Label htmlFor={`variant-${idx}-packaging`} className="text-xs">Emballage *</Label>
                          <Select
                            value={variant.packagingTypeId}
                            onValueChange={(v) => updateVariant(idx, 'packagingTypeId', v)}
                            disabled={isLoading}
                          >
                            <SelectTrigger id={`variant-${idx}-packaging`} className="w-full">
                              <SelectValue placeholder="Choisir…" />
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
                        <div className="col-span-5 space-y-2 sm:col-span-3">
                          <Label htmlFor={`variant-${idx}-price`} className="text-xs">Prix de vente (FCFA)</Label>
                          <Input
                            id={`variant-${idx}-price`}
                            type="number"
                            min="0"
                            className="tabular"
                            value={variant.price}
                            onChange={e => updateVariant(idx, 'price', Number(e.target.value))}
                            disabled={isLoading}
                          />
                        </div>
                        <div className="col-span-5 space-y-2 sm:col-span-3">
                          <Label htmlFor={`variant-${idx}-cost`} className="text-xs">Prix d’achat (FCFA)</Label>
                          <Input
                            id={`variant-${idx}-cost`}
                            type="number"
                            min="0"
                            className="tabular"
                            value={variant.costPrice}
                            onChange={e => updateVariant(idx, 'costPrice', Number(e.target.value))}
                            disabled={isLoading}
                          />
                        </div>
                        <div className="col-span-2 flex justify-end sm:col-span-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeVariant(idx)}
                            disabled={isLoading}
                            aria-label="Retirer cette variante"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 aria-hidden="true" />
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
                <Link href="/dashboard/products">Annuler</Link>
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isLoading ? 'Création…' : 'Créer le produit'}
              </Button>
            </div>
          </form>
        </div>
      </PageShell>
    </div>
  )
}
