'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, WifiOff } from 'lucide-react'
import { BrandMonogram } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { getMeta, loadPosSnapshot, type OfflineMeta, type PosSnapshot } from '@/lib/offline/store'
import { OfflineRegister } from './offline-register'
import { OfflineSaleForm } from './offline-sale-form'
import { OfflineReviewDialog, OfflineStatusBar } from './offline-status'
import { useOfflineSales } from './use-offline-sales'

/**
 * Coquille hors ligne servie par le service worker quand /pos ou
 * /dashboard/sales/new ne répondent pas. Le HTML ne contient AUCUNE donnée :
 * tout vient d'IndexedDB, et seulement pour le dernier compte connecté sur
 * l'appareil (effacé à la déconnexion).
 */
export function OfflineShell({ mode }: { mode: 'pos' | 'sale' }) {
  const [meta, setMeta] = useState<OfflineMeta | null | undefined>(undefined)
  const [snapshot, setSnapshot] = useState<PosSnapshot | null | undefined>(undefined)
  const [reviewOpen, setReviewOpen] = useState(false)
  const owner = meta?.owner ?? null
  const sales = useOfflineSales(owner)

  useEffect(() => {
    void getMeta().then(setMeta)
  }, [])
  useEffect(() => {
    if (mode === 'pos' && owner) void loadPosSnapshot(owner).then(setSnapshot)
  }, [mode, owner])

  const onlineHref = mode === 'pos' ? '/pos' : '/dashboard/sales/new'
  const title = mode === 'pos' ? 'Point de vente' : 'Nouvelle vente'

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
        <BrandMonogram size={30} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-foreground">{title} · hors ligne</p>
          <p className="truncate text-xs text-muted-foreground">{meta?.companyName ?? ''}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!sales.offline && (
            <Button size="sm" variant="outline" asChild>
              <Link href={onlineHref}>
                Revenir en ligne <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </header>

      <OfflineStatusBar state={sales} onReview={() => setReviewOpen(true)} />

      <main className="min-h-0 flex-1 overflow-y-auto">
        {meta === undefined || (mode === 'pos' && owner && snapshot === undefined) ? null : !owner ? (
          <NoData />
        ) : mode === 'pos' ? (
          snapshot ? (
            <OfflineRegister owner={owner} snapshot={snapshot} sales={sales} cashierName={meta?.userName ?? ''} />
          ) : (
            <NoData />
          )
        ) : (
          <OfflineSaleForm owner={owner} sales={sales} />
        )}
      </main>

      <OfflineReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} state={sales} />
    </div>
  )
}

function NoData() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <WifiOff className="h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-semibold text-foreground">Aucune donnée hors ligne sur cet appareil</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Pour vendre sans réseau, connectez-vous et ouvrez une fois le point de vente (ou « Nouvelle vente ») avec du réseau.
        Les données sont effacées à la déconnexion.
      </p>
    </div>
  )
}
