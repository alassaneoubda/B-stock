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
import { signOut } from 'next-auth/react'
import { apiFetch, toastError } from '@/lib/api-client'
import { passwordPolicyError } from '@/lib/permissions'

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
        if (isLoading) return

        // Même règle que le serveur, pour un retour immédiat
        const policyError = passwordPolicyError(passwords.newPass)
        if (policyError) {
            toast.error('Mot de passe trop faible', { description: policyError })
            return
        }

        if (passwords.newPass !== passwords.confirm) {
            toast.error('Les mots de passe ne correspondent pas', {
                description: "Veuillez vérifier le nouveau mot de passe et sa confirmation."
            })
            return
        }

        setIsLoading(true)
        try {
            await apiFetch('/api/profile/password', {
                method: 'POST',
                body: {
                    currentPassword: passwords.current || undefined,
                    newPassword: passwords.newPass,
                },
            })

            setPasswords({ current: '', newPass: '', confirm: '' })
            toast.success('Mot de passe mis à jour', {
                description: 'Reconnectez-vous avec votre nouveau mot de passe.',
            })
            // Toutes les sessions ont été invalidées côté serveur
            await signOut({ redirect: false })
            router.push('/login')
        } catch (err) {
            toastError(err, 'Modification impossible')
        } finally {
            setIsLoading(false)
        }
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
                            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                            Retour aux paramètres
                        </Link>
                    </Button>
                </div>

                <div className="max-w-2xl space-y-6">
                    <Card className="rounded-lg border-border shadow-sm overflow-hidden">
                        <CardHeader className="px-8 py-8 border-b border-border flex flex-row items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-brand-soft flex items-center justify-center text-brand-strong">
                                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                            </div>
                            <div>
                                <CardTitle className="text-xl font-semibold text-foreground">Changer le mot de passe</CardTitle>
                                <CardDescription>
                                    Au moins 8 caractères, avec au moins une lettre et un chiffre. Après le changement,
                                    toutes vos sessions (sur tous vos appareils) sont fermées et vous devrez vous reconnecter.
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <form onSubmit={handleUpdatePassword}>
                            <CardContent className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="current">Mot de passe actuel</Label>
                                    <Input
                                        type="password"
                                        id="current"
                                        autoComplete="current-password"
                                        aria-describedby="current-hint"
                                        value={passwords.current}
                                        onChange={handleChange}
                                        disabled={isLoading}
                                        placeholder="••••••••"
                                    />
                                    <p id="current-hint" className="text-xs text-muted-foreground">
                                        Laissez vide si vous vous connectez uniquement avec Google et n&apos;avez jamais défini de mot de passe.
                                    </p>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="newPass">Nouveau mot de passe</Label>
                                        <Input
                                            type="password"
                                            id="newPass"
                                            autoComplete="new-password"
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
                                            autoComplete="new-password"
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
                            <CardFooter className="px-8 py-4 border-t border-border bg-muted/50 flex justify-end">
                                <Button type="submit" disabled={isLoading || !passwords.newPass || !passwords.confirm}>
                                    {isLoading ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                                    ) : (
                                        <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
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
