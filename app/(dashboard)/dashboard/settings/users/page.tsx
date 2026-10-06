'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Users, UserPlus, Shield } from 'lucide-react'
import Link from 'next/link'
import { apiFetch, errorMessage } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/permissions'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'

interface User {
    id: string
    full_name: string
    email: string
    role: string
    is_active: boolean
    last_login_at: string | null
    created_at: string
}

const roleLabels: Record<string, string> = ROLE_LABELS

const roleColors: Record<string, string> = {
    owner: 'bg-indigo-50 text-indigo-600',
    manager: 'bg-blue-50 text-blue-600',
    cashier: 'bg-emerald-50 text-emerald-600',
    warehouse_keeper: 'bg-amber-50 text-amber-600',
}

export default function UsersSettingsPage() {
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)

    const fetchUsers = useCallback(async () => {
        setLoading(true)
        setLoadError(null)
        try {
            const data = await apiFetch<{ data: User[] }>('/api/users')
            setUsers(Array.isArray(data.data) ? data.data : [])
        } catch (e) {
            setLoadError(errorMessage(e))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchUsers() }, [fetchUsers])

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Gestion des utilisateurs"
                description="Gérez les accès et rôles de votre équipe"
                actions={
                    <Button className="rounded-md h-11 px-6 bg-blue-600 hover:bg-blue-700 font-bold" asChild>
                        <Link href="/dashboard/settings/users/new">
                            <UserPlus className="h-5 w-5 mr-2" aria-hidden="true" /> Ajouter un utilisateur
                        </Link>
                    </Button>
                }
            />
            <main className="flex-1 p-4 lg:p-6 ">
                <Card className="rounded-lg border-slate-200/60 shadow-sm overflow-hidden">
                    <CardHeader className="px-8 py-8 border-b border-slate-100">
                        <CardTitle className="text-xl font-semibold text-slate-950 flex items-center gap-3">
                            <Users className="h-5 w-5 text-blue-600" aria-hidden="true" /> Membres de l&apos;équipe{!loading && !loadError ? ` (${users.length})` : ''}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className={loading || loadError || users.length === 0 ? 'p-6' : 'p-0'}>
                        {loading ? (
                            <TableSkeleton rows={4} columns={5} />
                        ) : loadError ? (
                            <ErrorState description={loadError} onRetry={fetchUsers} />
                        ) : users.length === 0 ? (
                            <EmptyState
                                icon={Users}
                                title="Aucun membre"
                                description="Ajoutez vos caissiers, magasiniers et gérants pour qu'ils aient leur propre accès."
                                action={{ label: 'Ajouter un utilisateur', href: '/dashboard/settings/users/new' }}
                            />
                        ) : (
                            <Table>
                                <TableHeader className="bg-slate-50/50">
                                    <TableRow className="border-none hover:bg-transparent">
                                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pl-8">Nom</TableHead>
                                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Email</TableHead>
                                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Rôle</TableHead>
                                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400">Dernière connexion</TableHead>
                                        <TableHead className="py-5 font-semibold uppercase text-[10px] tracking-wider text-slate-400 pr-8">Statut</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <TableCell className="py-5 pl-8">
                                                <Link href={`/dashboard/settings/users/${user.id}`} className="font-semibold text-slate-950 hover:text-blue-600 transition-colors">
                                                    {user.full_name}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="py-5 font-medium text-slate-600">{user.email}</TableCell>
                                            <TableCell className="py-5">
                                                <Badge className={`rounded-xl px-4 py-1 font-semibold text-[10px] uppercase tracking-wider border-none ${roleColors[user.role] || 'bg-slate-100 text-slate-600'}`}>
                                                    <Shield className="h-3 w-3 mr-1" aria-hidden="true" />
                                                    {roleLabels[user.role] || user.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-5 text-sm text-slate-500">
                                                {user.last_login_at ? formatDateTime(user.last_login_at) : 'Jamais'}
                                            </TableCell>
                                            <TableCell className="py-5 pr-8">
                                                <Badge className={`rounded-xl px-4 py-1 font-semibold text-[10px] uppercase tracking-wider border-none ${user.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                                                    {user.is_active ? 'Actif' : 'Inactif'}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </main>
        </div>
    )
}
