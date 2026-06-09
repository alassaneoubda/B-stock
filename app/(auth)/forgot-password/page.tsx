import Link from 'next/link'
import { ArrowLeft, KeyRound, Building2, LifeBuoy, Mail, Phone } from 'lucide-react'
import { getSettings } from '@/lib/settings'

export const metadata = {
    title: 'Mot de passe oublié — B-Stock',
}

export default async function ForgotPasswordPage() {
    let supportEmail = ''
    let supportPhone = ''
    try {
        const settings = await getSettings()
        supportEmail = settings.support_email || ''
        supportPhone = settings.support_phone || ''
    } catch {
        // valeurs par défaut vides : on affiche quand même les instructions
    }

    return (
        <div className="min-h-screen flex flex-col justify-center items-center px-6 py-12 bg-zinc-50">
            <div className="w-full max-w-[440px] space-y-8">
                <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-zinc-950 flex items-center justify-center">
                        <span className="text-white text-sm font-bold">B</span>
                    </div>
                    <span className="text-lg font-bold text-zinc-950">B-Stock</span>
                </div>

                <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm p-8 space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                            <KeyRound className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-zinc-950">Mot de passe oublié</h1>
                            <p className="text-sm text-zinc-500">Voici comment récupérer l&apos;accès à votre compte.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex gap-3 rounded-lg border border-zinc-200 p-4">
                            <Building2 className="h-5 w-5 text-zinc-400 shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-semibold text-zinc-900">Vous êtes un employé ?</p>
                                <p className="text-zinc-500 mt-1">
                                    Demandez au propriétaire (ou à un administrateur) de votre entreprise de
                                    réinitialiser votre mot de passe depuis <span className="font-medium text-zinc-700">Paramètres → Utilisateurs</span>.
                                    Il vous communiquera un mot de passe temporaire à utiliser à la prochaine connexion.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 rounded-lg border border-zinc-200 p-4">
                            <LifeBuoy className="h-5 w-5 text-zinc-400 shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <p className="font-semibold text-zinc-900">Vous êtes le propriétaire du compte ?</p>
                                <p className="text-zinc-500 mt-1">
                                    Contactez le support B-Stock pour réinitialiser votre accès :
                                </p>
                                <div className="mt-2 space-y-1">
                                    {supportEmail && (
                                        <a href={`mailto:${supportEmail}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                                            <Mail className="h-4 w-4" /> {supportEmail}
                                        </a>
                                    )}
                                    {supportPhone && (
                                        <a href={`tel:${supportPhone}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                                            <Phone className="h-4 w-4" /> {supportPhone}
                                        </a>
                                    )}
                                    {!supportEmail && !supportPhone && (
                                        <p className="text-zinc-500">Contactez votre interlocuteur B-Stock habituel.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <Link
                        href="/login"
                        className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-950"
                    >
                        <ArrowLeft className="h-4 w-4" /> Retour à la connexion
                    </Link>
                </div>
            </div>
        </div>
    )
}
