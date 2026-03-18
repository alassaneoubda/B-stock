'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, CheckCheck } from 'lucide-react'

export function GenerateAlertsButton() {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    async function handleGenerate() {
        setLoading(true)
        setMessage(null)
        try {
            const res = await fetch('/api/alerts/generate', { method: 'POST' })
            const data = await res.json()
            if (res.ok) {
                setMessage(data.message)
                router.refresh()
            } else {
                setMessage(data.error || 'Erreur')
            }
        } catch {
            setMessage('Erreur réseau')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex items-center gap-3">
            {message && (
                <span className="text-sm font-bold text-slate-500">{message}</span>
            )}
            <Button
                onClick={handleGenerate}
                disabled={loading}
                variant="outline"
                className="rounded-2xl h-11 px-6 border-slate-200 font-bold hover:bg-white hover:shadow-md transition-all"
            >
                {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Analyser
            </Button>
        </div>
    )
}

export function MarkAllReadButton({ hasUnread }: { hasUnread: boolean }) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)

    async function handleMarkAll() {
        setLoading(true)
        try {
            await fetch('/api/alerts', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ markAllRead: true }),
            })
            router.refresh()
        } catch {
            // ignore
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
            className="rounded-2xl h-11 px-6 font-bold text-blue-600 hover:bg-blue-50 transition-all"
        >
            {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
                <CheckCheck className="h-4 w-4 mr-2" />
            )}
            Tout marquer comme lu
        </Button>
    )
}
