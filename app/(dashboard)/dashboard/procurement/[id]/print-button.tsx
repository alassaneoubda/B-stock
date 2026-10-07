'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Bouton « Imprimer » (le bouton précédent n'avait aucune action). */
export function PrintButton() {
    return (
        <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimer
        </Button>
    )
}
