'use client'

import { useSession } from 'next-auth/react'
import type { LucideIcon } from 'lucide-react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell } from '@/components/app/blocks'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Mail, Shield, Building2 } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/permissions'

const roleLabels: Record<string, string> = ROLE_LABELS

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center gap-4 px-6 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="truncate text-sm font-medium text-foreground">{value}</p>
            </div>
        </div>
    )
}

export default function ProfilePage() {
    const { data: session } = useSession()
    const user = session?.user

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Mon profil"
                description="Informations de votre compte"
            />
            <PageShell>
                <Card className="max-w-3xl gap-0 overflow-hidden py-0">
                    <CardHeader className="border-b border-border px-6 py-6">
                        <div className="flex items-center gap-4">
                            <div
                                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground"
                                aria-hidden="true"
                            >
                                {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                            </div>
                            <div className="min-w-0 space-y-1.5">
                                <CardTitle className="truncate text-lg font-semibold tracking-tight text-foreground">{user?.name || 'Utilisateur'}</CardTitle>
                                <Badge variant="brand">
                                    <Shield className="h-3 w-3" aria-hidden="true" />
                                    {roleLabels[user?.role || ''] || 'Utilisateur'}
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="divide-y divide-border px-0">
                        <DetailRow icon={Mail} label="E-mail" value={user?.email} />
                        <DetailRow icon={Building2} label="Entreprise" value={user?.companyName || 'N/A'} />
                        <DetailRow icon={Shield} label="Rôle" value={roleLabels[user?.role || ''] || user?.role} />
                    </CardContent>
                </Card>
            </PageShell>
        </div>
    )
}
