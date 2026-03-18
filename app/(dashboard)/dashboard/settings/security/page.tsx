'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Loader2, ShieldCheck, KeyRound } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

export default function SecuritySettingsPage() {
    const router = useRouter()
    const [isLoading, setIsLoading] = useState(false)
    const [passwords, setPasswords] = useState({
        current: '',
        newPass: '',
        confirm: ''
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPasswords(prev => ({ ...prev, [e.target.id]: e.target.value }))
    }

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault()

        if (passwords.newPass !== passwords.confirm) {
            toast.error('Les mots de passe ne correspondent pas', {
                description: "Veuillez vérifier le nouveau mot de passe et sa confirmation."
            })
            return
        }

        setIsLoading(true)
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000))
        setIsLoading(false)

        setPasswords({ current: '', newPass: '', confirm: '' })
        toast.success('Mot de passe mis à jour', {
            description: "Votre mot de passe a été modifié avec succès."
        })
    }

    return (
        <div className="flex flex-col min-h-screen">
            <DashboardHeader
                title="Sécurité et accès"
                description="Gérez la sécurité de votre compte"
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

                <div className="max-w-2xl space-y-6">
                    <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-8 border-b border-slate-100 flex flex-row items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-semibold text-slate-950">Changer le mot de passe</CardTitle>
                                <CardDescription>Assurez-vous d'utiliser un mot de passe long et complexe.</CardDescription>
                            </div>
                        </CardHeader>
                        <form onSubmit={handleUpdatePassword}>
                            <CardContent className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="current">Mot de passe actuel</Label>
                                    <Input
                                        type="password"
                                        id="current"
                                        required
                                        value={passwords.current}
                                        onChange={handleChange}
                                        disabled={isLoading}
                                        placeholder="••••••••"
                                    />
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="newPass">Nouveau mot de passe</Label>
                                        <Input
                                            type="password"
                                            id="newPass"
                                            required
                                            value={passwords.newPass}
                                            onChange={handleChange}
                                            disabled={isLoading}
                                            placeholder="••••••••"
                                            minLength={8}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirm">Confirmer le nouveau</Label>
                                        <Input
                                            type="password"
                                            id="confirm"
                                            required
                                            value={passwords.confirm}
                                            onChange={handleChange}
                                            disabled={isLoading}
                                            placeholder="••••••••"
                                            minLength={8}
                                        />
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="px-8 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                                <Button type="submit" disabled={isLoading || !passwords.current || !passwords.newPass || !passwords.confirm}>
                                    {isLoading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <KeyRound className="mr-2 h-4 w-4" />
                                    )}
                                    Mettre à jour le mot de passe
                                </Button>
                            </CardFooter>
                        </form>
                    </Card>
                </div>
            </main>
        </div>
    )
}
