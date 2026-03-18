'use client'

import { useState } from 'react'
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
import { Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

const clientSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caracteres'),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  address: z.string().optional(),
  zone: z.string().optional(),
  clientType: z.string().min(1, 'Le type de client est requis'),
  creditLimit: z.number().min(0, 'La limite de credit doit etre positive'),
  packagingCreditLimit: z.number().min(0, 'La limite emballage doit etre positive'),
  paymentTermsDays: z.number().min(0).max(90),
  isActive: z.boolean().default(true),
})

type ClientForm = z.infer<typeof clientSchema>

const clientTypes = [
  { value: 'retail', label: 'Détaillant' },
  { value: 'wholesale', label: 'Grossiste' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'bar', label: 'Bar / Maquis' },
  { value: 'subdepot', label: 'Sous-dépôt' },
]

const zones = [
  'Zone 1 - Centre',
  'Zone 2 - Nord',
  'Zone 3 - Sud',
  'Zone 4 - Est',
  'Zone 5 - Ouest',
]

export default function NewClientPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ClientForm>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      isActive: true,
      creditLimit: 0,
      packagingCreditLimit: 0,
      paymentTermsDays: 0,
    },
  })

  const isActive = watch('isActive')

  async function onSubmit(data: ClientForm) {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Une erreur est survenue')
        return
      }

      router.push('/dashboard/clients')
      router.refresh()
    } catch {
      setError('Une erreur est survenue. Veuillez reessayer.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader
        title="Nouveau client"
        description="Ajoutez un nouveau client a votre liste"
      />

      <main className="flex-1 p-4 lg:p-6">
        <div className="mb-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/clients">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Retour aux clients
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
              <CardTitle>Informations generales</CardTitle>
              <CardDescription>
                Les informations de base du client
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du client / Entreprise *</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Boutique Koffi"
                    {...register('name')}
                    disabled={isLoading}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clientType">Type de client *</Label>
                  <Select
                    onValueChange={(value) => setValue('clientType', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selectionner un type" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.clientType && (
                    <p className="text-sm text-destructive">{errors.clientType.message}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Nom du contact</Label>
                  <Input
                    id="contactName"
                    placeholder="Ex: Jean Koffi"
                    {...register('contactName')}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telephone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+225 XX XX XX XX XX"
                    {...register('phone')}
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="client@exemple.com"
                  {...register('email')}
                  disabled={isLoading}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <Textarea
                  id="address"
                  placeholder="Adresse complete du client"
                  {...register('address')}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="zone">Zone de livraison</Label>
                <Select
                  onValueChange={(value) => setValue('zone', value)}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selectionner une zone" />
                  </SelectTrigger>
                  <SelectContent>
                    {zones.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conditions commerciales</CardTitle>
              <CardDescription>
                Definissez les conditions de credit et de paiement
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="creditLimit">Limite de credit produits (FCFA)</Label>
                  <Input
                    id="creditLimit"
                    type="number"
                    min="0"
                    placeholder="0"
                    {...register('creditLimit', { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = pas de credit produit autorise
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="packagingCreditLimit">Limite de credit emballages (FCFA)</Label>
                  <Input
                    id="packagingCreditLimit"
                    type="number"
                    min="0"
                    placeholder="0"
                    {...register('packagingCreditLimit', { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = pas de credit emballage autorise
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="paymentTermsDays">Delai de paiement (jours)</Label>
                  <Input
                    id="paymentTermsDays"
                    type="number"
                    min="0"
                    max="90"
                    placeholder="0"
                    {...register('paymentTermsDays', { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = paiement immediat
                  </p>
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
                  <Label htmlFor="isActive">Client actif</Label>
                  <p className="text-sm text-muted-foreground">
                    Les clients inactifs ne peuvent pas passer de commandes
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
              <Link href="/dashboard/clients">Annuler</Link>
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creation...
                </>
              ) : (
                'Creer le client'
              )}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
