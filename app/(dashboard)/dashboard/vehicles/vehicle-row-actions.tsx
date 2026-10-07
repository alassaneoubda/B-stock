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
    DropdownMenuSeparator,
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
                        className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                    >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href={`/dashboard/vehicles/${vehicleId}/edit`}>
                            <Edit aria-hidden="true" />
                            Modifier
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href={`/dashboard/deliveries/new?vehicle=${vehicleId}`}>
                            <Plus aria-hidden="true" />
                            Nouvelle tournée
                        </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        variant="destructive"
                        className="cursor-pointer"
                        onSelect={() => setConfirmOpen(true)}
                    >
                        <Trash2 aria-hidden="true" />
                        Retirer du parc
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
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => {
                                e.preventDefault()
                                handleDelete()
                            }}
                        >
                            {isDeleting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                            Retirer du parc
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
