'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Edit, Loader2, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { apiFetch, toastError } from '@/lib/api-client'

/**
 * Menu d'actions d'une ligne véhicule. « Retirer du parc » n'avait aucune action :
 * il appelle désormais DELETE /api/vehicles/[id] après confirmation
 * (suppression, ou désactivation si le véhicule a déjà servi en tournée).
 */
export function VehicleRowActions({
    vehicleId,
    label,
    toursCount,
}: {
    vehicleId: string
    label: string
    toursCount: number
}) {
    const router = useRouter()
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    async function handleDelete() {
        if (isDeleting) return
        setIsDeleting(true)
        try {
            const res = await apiFetch<{ message?: string }>(`/api/vehicles/${vehicleId}`, { method: 'DELETE' })
            toast.success(res.message || 'Véhicule retiré du parc')
            setConfirmOpen(false)
            router.refresh()
        } catch (e) {
            toastError(e, 'Retrait impossible')
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions pour le véhicule ${label}`}
                        className="h-10 w-10 rounded-xl hover:bg-card hover:shadow-md border border-transparent hover:border-border transition-all"
                    >
                        <MoreHorizontal className="h-5 w-5 text-muted-foreground/70 group-hover:text-foreground" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60 p-2 rounded-md border-border shadow-lg">
                    <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-muted/50 focus:bg-muted/50 transition-colors">
                        <Link href={`/dashboard/vehicles/${vehicleId}/edit`} className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                                <Edit className="h-4 w-4" />
                            </div>
                            <span className="font-bold text-sm">Modifier Détails</span>
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-brand-soft focus:bg-brand-soft transition-colors">
                        <Link href={`/dashboard/deliveries/new?vehicle=${vehicleId}`} className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-brand-soft flex items-center justify-center text-brand-strong">
                                <Plus className="h-4 w-4" />
                            </div>
                            <span className="font-bold text-sm">Nouvelle Tournée</span>
                        </Link>
                    </DropdownMenuItem>
                    <div className="h-px bg-muted my-1 mx-2" />
                    <DropdownMenuItem
                        className="rounded-xl cursor-pointer py-3 hover:bg-destructive/10 focus:bg-destructive/10 text-destructive transition-colors"
                        onSelect={() => setConfirmOpen(true)}
                    >
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center text-destructive">
                                <Trash2 className="h-4 w-4" />
                            </div>
                            <span className="font-bold text-sm">Retirer du Parc</span>
                        </div>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog
                open={confirmOpen}
                onOpenChange={(open) => {
                    if (!open && !isDeleting) setConfirmOpen(false)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Retirer « {label} » du parc ?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {toursCount > 0
                                ? 'Ce véhicule a déjà été utilisé dans des tournées : il sera désactivé (historique conservé) et ne pourra plus être affecté à de nouvelles tournées.'
                                : 'Ce véhicule n’a jamais servi : il sera définitivement supprimé. Cette action est irréversible.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isDeleting}
                            className="bg-destructive text-white hover:bg-destructive/90"
                            onClick={(e) => {
                                e.preventDefault()
                                handleDelete()
                            }}
                        >
                            {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Retirer du parc
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
