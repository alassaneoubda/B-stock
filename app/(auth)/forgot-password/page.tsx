import Link from 'next/link'
import { ArrowLeft, KeyRound, Building2, LifeBuoy, Mail, Phone } from 'lucide-react'
import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { DEFAULT_SETTINGS, getSettings } from '@/lib/settings'

export const metadata = {
    title: 'Mot de passe oublié — B-Stock',
}

// Contacts lus dans la configuration plateforme : on ne fige pas la valeur du build
export const revalidate = 60

export default async function ForgotPasswordPage() {
    // Repli : l'email de support par défaut, pour toujours proposer un contact
    let supportEmail = DEFAULT_SETTINGS.support_email
    let supportPhone = ''
    try {
        const settings = await getSettings()
        supportEmail = settings.support_email?.trim() || DEFAULT_SETTINGS.support_email
        supportPhone = settings.support_phone?.trim() || ''
    } catch {
        // getSettings retombe déjà sur les valeurs par défaut ; ceinture et bretelles
    }

    return (
        <AuthSplitLayout
            headline="Retrouvez l’accès à votre espace en toute sécurité."
            subline="Les mots de passe sont réinitialisés par une personne habilitée, jamais par un lien envoyé au hasard."
            footer={
                <Link
                    href="/login"
                    className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Retour à la connexion
                </Link>
            }
        >
            <div className="mb-8 space-y-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <KeyRound className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-1.5">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Mot de passe oublié</h1>
                    <p className="text-sm text-muted-foreground">Voici comment récupérer l’accès à votre compte.</p>
                </div>
            </div>

            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
                <section className="flex gap-3 p-5">
                    <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="text-sm">
                        <h2 className="font-semibold text-foreground">Vous êtes un employé ?</h2>
                        <p className="mt-1 leading-relaxed text-muted-foreground">
                            Demandez au propriétaire (ou à un administrateur) de votre entreprise de
                            réinitialiser votre mot de passe depuis{' '}
                            <span className="font-medium text-foreground">Paramètres → Utilisateurs</span>.
                            Il vous communiquera un mot de passe temporaire à utiliser à la prochaine connexion.
                        </p>
                    </div>
                </section>

                <section className="flex gap-3 p-5">
                    <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="text-sm">
                        <h2 className="font-semibold text-foreground">Vous êtes le propriétaire du compte ?</h2>
                        <p className="mt-1 leading-relaxed text-muted-foreground">
                            La réinitialisation en libre-service n’est pas encore disponible.
                            Contactez le support B-Stock pour réinitialiser votre accès :
                        </p>
                        <div className="mt-3 space-y-1.5">
                            {supportEmail && (
                                <a
                                    href={`mailto:${supportEmail}`}
                                    className="flex items-center gap-2 font-medium text-foreground underline-offset-4 hover:underline"
                                >
                                    <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {supportEmail}
                                </a>
                            )}
                            {supportPhone && (
                                <a
                                    href={`tel:${supportPhone}`}
                                    className="tabular flex items-center gap-2 font-medium text-foreground underline-offset-4 hover:underline"
                                >
                                    <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> {supportPhone}
                                </a>
                            )}
                        </div>
                    </div>
                </section>
            </div>
        </AuthSplitLayout>
    )
}
