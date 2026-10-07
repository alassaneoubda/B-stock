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
import { toast } from 'sonner'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { PageShell } from '@/components/app/blocks'

const clientSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  address: z.string().optional(),
  zone: z.string().optional(),
  clientType: z.string().min(1, 'Le type de client est requis'),
  creditLimit: z.number().min(0, 'La limite de crédit doit être positive'),
  packagingCreditLimit: z.number().min(0, 'La limite emballage doit être positive'),
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
    if (isLoading) return
    setIsLoading(true)
    setError(null)

    try {
      await apiFetch('/api/clients', { method: 'POST', body: data })
      toast.success(`Client « ${data.name} » créé`)
      router.push('/dashboard/clients')
      router.refresh()
    } catch (e) {
      // Erreur affichée dans le formulaire (message du serveur)
      setError(errorMessage(e))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Nouveau client"
        description="Ajoutez un client à votre répertoire"
      />

      <PageShell>
        <div className="mx-auto w-full max-w-3xl space-y-6">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/dashboard/clients">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Clients
            </Link>
          </Button>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Informations générales</CardTitle>
                <CardDescription>Identité et coordonnées du client.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du client ou de l’entreprise *</Label>
                  <Input
                    id="name"
                    placeholder="Ex. : Boutique Koffi"
                    {...register('name')}
                    disabled={isLoading}
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clientType">Type de client *</Label>
                  <Select
                    onValueChange={(value) => setValue('clientType', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger id="clientType" className="w-full">
                      <SelectValue placeholder="Sélectionner un type" />
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
                    <p className="text-xs text-destructive">{errors.clientType.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contactName">Nom du contact</Label>
                  <Input
                    id="contactName"
                    placeholder="Ex. : Jean Koffi"
                    {...register('contactName')}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Téléphone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+225 XX XX XX XX XX"
                    {...register('phone')}
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="client@exemple.com"
                    {...register('email')}
                    disabled={isLoading}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="zone">Zone de livraison</Label>
                  <Select
                    onValueChange={(value) => setValue('zone', value)}
                    disabled={isLoading}
                  >
                    <SelectTrigger id="zone" className="w-full">
                      <SelectValue placeholder="Sélectionner une zone" />
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

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Adresse</Label>
                  <Textarea
                    id="address"
                    placeholder="Quartier, rue, point de repère…"
                    {...register('address')}
                    disabled={isLoading}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conditions commerciales</CardTitle>
                <CardDescription>Plafonds de crédit et délai de paiement accordés.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="creditLimit">Limite de crédit produits (FCFA)</Label>
                  <Input
                    id="creditLimit"
                    type="number"
                    min="0"
                    placeholder="0"
                    className="tabular"
                    {...register('creditLimit', { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">0 = aucun crédit produit autorisé</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="packagingCreditLimit">Limite de crédit emballages (FCFA)</Label>
                  <Input
                    id="packagingCreditLimit"
                    type="number"
                    min="0"
                    placeholder="0"
                    className="tabular"
                    {...register('packagingCreditLimit', { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">0 = aucun crédit emballage autorisé</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentTermsDays">Délai de paiement (jours)</Label>
                  <Input
                    id="paymentTermsDays"
                    type="number"
                    min="0"
                    max="90"
                    placeholder="0"
                    className="tabular"
                    {...register('paymentTermsDays', { valueAsNumber: true })}
                    disabled={isLoading}
                  />
                  <p className="text-xs text-muted-foreground">0 = paiement immédiat (90 jours maximum)</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Statut</CardTitle>
                <CardDescription>Autorisez ou bloquez les commandes de ce client.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">Client actif</Label>
                    <p className="text-xs text-muted-foreground">
                      Un client inactif ne peut pas passer de commande.
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
                <Link href="/dashboard/clients">Annuler</Link>
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Création…
                  </>
                ) : (
                  'Créer le client'
                )}
              </Button>
            </div>
          </form>
        </div>
      </PageShell>
    </div>
  )
}
