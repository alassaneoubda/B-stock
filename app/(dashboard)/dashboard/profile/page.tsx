'use client'

import { useSession } from 'next-auth/react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserCircle, Mail, Shield, Building2, Calendar } from 'lucide-react'

const roleLabels: Record<string, string> = {
    owner: 'Propriétaire',
    manager: 'Gérant',
    cashier: 'Caissier',
    warehouse_keeper: 'Magasinier',
}

export default function ProfilePage() {
    const { data: session } = useSession()
    const user = session?.user

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Mon profil"
                description="Informations de votre compte"
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <Card className="rounded-lg border-slate-200/60 shadow-sm max-w-2xl">
                    <CardHeader className="px-8 py-8 border-b border-slate-100">
                        <div className="flex items-center gap-6">
                            <div className="h-20 w-20 rounded-lg bg-blue-600 flex items-center justify-center text-white text-3xl font-semibold shadow-md shadow-blue-500/20">
                                {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-semibold text-slate-950">{user?.name || 'Utilisateur'}</CardTitle>
                                <Badge className="mt-2 rounded-xl px-4 py-1 bg-blue-50 text-blue-600 border-none font-semibold text-[10px] uppercase tracking-wider">
                                    <Shield className="h-3 w-3 mr-1" />
                                    {roleLabels[user?.role || ''] || 'Utilisateur'}
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="px-8 py-8 space-y-6">
                        <div className="flex items-center gap-4 p-4 rounded-md bg-slate-50">
                            <Mail className="h-5 w-5 text-slate-400" />
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Email</p>
                                <p className="font-bold text-slate-950">{user?.email}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 p-4 rounded-md bg-slate-50">
                            <Building2 className="h-5 w-5 text-slate-400" />
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Entreprise</p>
                                <p className="font-bold text-slate-950">{user?.companyName || 'N/A'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 p-4 rounded-md bg-slate-50">
                            <Shield className="h-5 w-5 text-slate-400" />
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Rôle</p>
                                <p className="font-bold text-slate-950">{roleLabels[user?.role || ''] || user?.role}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
