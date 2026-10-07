import Link from 'next/link'
import { ArrowLeft, KeyRound, LifeBuoy, Mail, Phone } from 'lucide-react'
import { AuthSplitLayout } from '@/components/auth/auth-split-layout'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'
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
            subline="Un lien personnel, valable 60 minutes et utilisable une seule fois, est envoyé à l’adresse de votre compte."
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
                    <p className="text-sm text-muted-foreground">
                        Saisissez l’adresse email de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe.
                    </p>
                </div>
            </div>

            <ForgotPasswordForm />

            <section className="mt-8 flex gap-3 rounded-xl border border-border bg-card p-5">
                <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="text-sm">
                    <h2 className="font-semibold text-foreground">Pas d’email reçu ?</h2>
                    <p className="mt-1 leading-relaxed text-muted-foreground">
                        Vérifiez vos courriers indésirables. Un employé peut aussi demander au propriétaire de son
                        entreprise de lui envoyer un lien depuis{' '}
                        <span className="font-medium text-foreground">Paramètres → Utilisateurs</span>. Sinon, contactez le support :
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
        </AuthSplitLayout>
    )
}
