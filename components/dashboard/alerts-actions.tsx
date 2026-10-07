'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, CheckCheck } from 'lucide-react'
import { mutate } from 'swr'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'
import { UNREAD_ALERTS_KEY } from '@/components/dashboard/header'

export function GenerateAlertsButton() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    async function handleGenerate() {
        if (loading) return
        setLoading(true)
        try {
            const data = await apiFetch<{
                message?: string
                alertsCreated?: number
                alertsResolved?: number
                warnings?: string[]
            }>('/api/alerts/generate', { method: 'POST' })
            const resolved = Number(data?.alertsResolved || 0)
            toast.success(data?.message || 'Analyse terminée', {
                description: resolved > 0 ? `${resolved} alerte(s) résolue(s) automatiquement` : undefined,
            })
            toastWarnings(data?.warnings)
            router.refresh()
            mutate(UNREAD_ALERTS_KEY) // met à jour la pastille de la cloche
        } catch (e) {
            toastError(e, 'Analyse impossible')
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <Button
                onClick={handleGenerate}
                disabled={loading}
                variant="outline"
                size="sm"
                className="h-9"
            >
                {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                )}
                Analyser
            </Button>
        </>
    )
}

export function MarkAllReadButton({ hasUnread }: { hasUnread: boolean }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    async function handleMarkAll() {
        if (loading) return
        setLoading(true)
        try {
            await apiFetch('/api/alerts', {
                method: 'PATCH',
                body: { markAllRead: true },
            })
            toast.success('Toutes les alertes sont marquées comme lues')
            router.refresh()
            mutate(UNREAD_ALERTS_KEY) // met à jour la pastille de la cloche
        } catch (e) {
            toastError(e)
        } finally {
            setLoading(false)
        }
    }

    if (!hasUnread) return null

    return (
        <Button
            onClick={handleMarkAll}
            disabled={loading}
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground hover:text-foreground"
        >
            {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
                <CheckCheck className="h-4 w-4" aria-hidden="true" />
            )}
            Tout marquer comme lu
        </Button>
    )
}

/** Marque une seule alerte comme lue (PATCH /api/alerts { alertIds }). */
export function MarkAlertReadButton({ alertId }: { alertId: string }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    async function handleMark() {
        if (loading) return
        setLoading(true)
        try {
            await apiFetch('/api/alerts', {
                method: 'PATCH',
                body: { alertIds: [alertId] },
            })
            toast.success('Alerte marquée comme lue')
            router.refresh()
            mutate(UNREAD_ALERTS_KEY) // met à jour la pastille de la cloche
        } catch (e) {
            toastError(e)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={handleMark}
            disabled={loading}
            className="h-8 text-muted-foreground hover:text-foreground"
        >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Marquer comme lu
        </Button>
    )
}
