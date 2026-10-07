'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Loader2, KeyRound, MonitorSmartphone } from 'lucide-react'
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
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Sécurité et accès"
                description="Gérez la sécurité de votre compte"
            />
            <PageShell>
                <div>
                    <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground hover:text-foreground">
                        <Link href="/dashboard/settings">
                            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Paramètres
                        </Link>
                    </Button>
                </div>

                <div className="max-w-3xl space-y-6">
                    <Card className="gap-0 overflow-hidden pb-0">
                        <CardHeader className="border-b border-border">
                            <CardTitle className="text-[15px]">Mot de passe</CardTitle>
                            <CardDescription>
                                Au moins 8 caractères, avec au moins une lettre et un chiffre.
                            </CardDescription>
                        </CardHeader>
                        <form onSubmit={handleUpdatePassword}>
                            <CardContent className="space-y-4 py-5">
                                <div className="space-y-2">
                                    <Label htmlFor="current">Mot de passe actuel</Label>
                                    <Input
                                        type="password"
                                        id="current"
                                        className="h-10 md:max-w-[calc(50%-0.5rem)]"
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
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="newPass">Nouveau mot de passe</Label>
                                        <Input
                                            type="password"
                                            id="newPass"
                                            className="h-10"
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
                                        <Label htmlFor="confirm">Confirmer le nouveau mot de passe</Label>
                                        <Input
                                            type="password"
                                            id="confirm"
                                            className="h-10"
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
                            <CardFooter className="flex flex-wrap justify-end gap-2 border-t border-border py-4">
                                <Button type="button" variant="outline" asChild>
                                    <Link href="/dashboard/settings">Annuler</Link>
                                </Button>
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

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-[15px]">Sessions</CardTitle>
                            <CardDescription>Appareils connectés à votre compte.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-start gap-3 rounded-lg bg-muted px-4 py-3">
                                <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <p className="text-sm text-muted-foreground">
                                    Après un changement de mot de passe, toutes vos sessions (sur tous vos appareils) sont
                                    fermées et vous devrez vous reconnecter.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </PageShell>
        </div>
    )
}
