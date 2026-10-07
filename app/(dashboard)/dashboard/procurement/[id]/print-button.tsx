'use client'

import { Button } from '@/components/ui/button'

/** Bouton « Imprimer » (le bouton précédent n'avait aucune action). */
export function PrintButton() {
    return (
        <Button
            variant="outline"
            className="rounded-xl border-border font-bold h-10"
            onClick={() => window.print()}
        >
            Imprimer
        </Button>
    )
}
