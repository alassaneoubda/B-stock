'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner' // Assuming sonner is used for toasts, standard in shadcn

export default function NotificationsSettingsPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)

    // Dummy state for settings
    const [settings, setSettings] = useState({
        emailAlerts: true,
        lowStock: true,
        newOrder: true,
        dailyReport: false,
        deliveryUpdates: true,
        marketing: false,
    })

    const handleToggle = (key: keyof typeof settings) => {
        setSettings((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    const handleSave = async () => {
        setIsLoading(true)
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800))
        setIsLoading(false)
        toast.success('Préférences enregistrées avec succès', {
            description: "Vos paramètres de notifications ont été mis à jour."
        })
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Paramètres des notifications"
                description="Gérez vos préférences de notifications"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" asChild>
                        <Link href="/dashboard/settings">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Retour aux paramètres
                        </Link>
                    </Button>
                </div>

                <div className="max-w-3xl space-y-6">
                    <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-8 border-b border-slate-100">
                            <CardTitle className="text-xl font-semibold text-slate-950">Notifications par email</CardTitle>
                            <CardDescription>Choisissez les événements pour lesquels vous souhaitez recevoir un email.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-8 space-y-8">
                            <div className="flex items-center justify-between space-x-4">
                                <div className="space-y-1">
                                    <Label htmlFor="emailAlerts" className="text-base font-semibold">Toutes les alertes email</Label>
                                    <p className="text-sm text-muted-foreground">Activer ou désactiver toutes les notifications par email.</p>
                                </div>
                                <Switch
                                    id="emailAlerts"
                                    checked={settings.emailAlerts}
                                    onCheckedChange={() => handleToggle('emailAlerts')}
                                />
                            </div>

                            <div className={`space-y-6 pt-4 border-t border-slate-100 transition-opacity ${!settings.emailAlerts ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className="flex items-center justify-between space-x-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="lowStock">Alertes de stock critique</Label>
                                        <p className="text-sm text-muted-foreground">Recevez un email lorsqu'un produit atteint son seuil d'alerte.</p>
                                    </div>
                                    <Switch
                                        id="lowStock"
                                        checked={settings.lowStock}
                                        onCheckedChange={() => handleToggle('lowStock')}
                                    />
                                </div>

                                <div className="flex items-center justify-between space-x-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="newOrder">Nouvelles commandes</Label>
                                        <p className="text-sm text-muted-foreground">Soyez notifié dès qu'une nouvelle commande est validée.</p>
                                    </div>
                                    <Switch
                                        id="newOrder"
                                        checked={settings.newOrder}
                                        onCheckedChange={() => handleToggle('newOrder')}
                                    />
                                </div>

                                <div className="flex items-center justify-between space-x-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="deliveryUpdates">Mises à jour de livraison</Label>
                                        <p className="text-sm text-muted-foreground">Suivez l'état d'avancement de vos tournées de livraison.</p>
                                    </div>
                                    <Switch
                                        id="deliveryUpdates"
                                        checked={settings.deliveryUpdates}
                                        onCheckedChange={() => handleToggle('deliveryUpdates')}
                                    />
                                </div>

                                <div className="flex items-center justify-between space-x-4">
                                    <div className="space-y-1">
                                        <Label htmlFor="dailyReport">Rapport journalier</Label>
                                        <p className="text-sm text-muted-foreground">Un résumé quotidien de l'activité (ventes, stocks, caisse).</p>
                                    </div>
                                    <Switch
                                        id="dailyReport"
                                        checked={settings.dailyReport}
                                        onCheckedChange={() => handleToggle('dailyReport')}
                                    />
                                </div>
                            </div>
                        </CardContent>
                        <CardFooter className="px-8 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                            <Button onClick={handleSave} disabled={isLoading}>
                                {isLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Save className="mr-2 h-4 w-4" />
                                )}
                                Enregistrer les préférences
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </main>
        </div>
    )
}
