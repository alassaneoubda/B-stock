'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { ArrowLeft, ChevronRight, Users, UserPlus } from 'lucide-react'
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

type RoleVariant = 'info' | 'brand' | 'success' | 'warning' | 'muted'

const roleVariants: Record<string, RoleVariant> = {
    owner: 'info',
    manager: 'brand',
    cashier: 'success',
    warehouse_keeper: 'warning',
}

function initials(name: string): string {
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'
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

    const showBodyPadding = loading || !!loadError || users.length === 0

    return (
        <div className="flex min-h-screen flex-col">
            <DashboardHeader
                title="Utilisateurs"
                description="Gérez les accès et rôles de votre équipe"
                actions={
                    <Button size="sm" className="h-9 rounded-lg" asChild>
                        <Link href="/dashboard/settings/users/new">
                            <UserPlus className="h-4 w-4 sm:mr-1.5" aria-hidden="true" />
                            <span className="hidden sm:inline">Ajouter un utilisateur</span>
                            <span className="sr-only sm:hidden">Ajouter un utilisateur</span>
                        </Link>
                    </Button>
                }
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

                <Panel
                    title="Membres de l'équipe"
                    description={!loading && !loadError ? `${users.length} membre${users.length > 1 ? 's' : ''}` : undefined}
                    bodyClassName={showBodyPadding ? 'p-5' : undefined}
                >
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
                        <>
                            {/* Mobile : liste de cartes */}
                            <ul className="divide-y divide-border md:hidden">
                                {users.map((user) => (
                                    <li key={user.id}>
                                        <Link
                                            href={`/dashboard/settings/users/${user.id}`}
                                            className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                                        >
                                            <span
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
                                                aria-hidden="true"
                                            >
                                                {initials(user.full_name)}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-foreground">{user.full_name}</p>
                                                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                    <Badge variant={roleVariants[user.role] ?? 'muted'}>{roleLabels[user.role] || user.role}</Badge>
                                                    <StatusBadge label={user.is_active ? 'Actif' : 'Inactif'} tone={user.is_active ? 'success' : 'default'} />
                                                </div>
                                            </div>
                                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                        </Link>
                                    </li>
                                ))}
                            </ul>

                            {/* Bureau : tableau */}
                            <div className="hidden md:block">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="pl-5">Nom</TableHead>
                                            <TableHead>E-mail</TableHead>
                                            <TableHead>Rôle</TableHead>
                                            <TableHead>Dernière connexion</TableHead>
                                            <TableHead className="pr-5">Statut</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {users.map((user) => (
                                            <TableRow key={user.id}>
                                                <TableCell className="pl-5">
                                                    <Link
                                                        href={`/dashboard/settings/users/${user.id}`}
                                                        className="flex items-center gap-2.5 rounded-md font-medium text-foreground transition-colors hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                    >
                                                        <span
                                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
                                                            aria-hidden="true"
                                                        >
                                                            {initials(user.full_name)}
                                                        </span>
                                                        {user.full_name}
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                                                <TableCell>
                                                    <Badge variant={roleVariants[user.role] ?? 'muted'}>{roleLabels[user.role] || user.role}</Badge>
                                                </TableCell>
                                                <TableCell className="tabular text-sm text-muted-foreground">
                                                    {user.last_login_at ? formatDateTime(user.last_login_at) : 'Jamais'}
                                                </TableCell>
                                                <TableCell className="pr-5">
                                                    <StatusBadge label={user.is_active ? 'Actif' : 'Inactif'} tone={user.is_active ? 'success' : 'default'} />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </>
                    )}
                </Panel>
            </PageShell>
        </div>
    )
}
