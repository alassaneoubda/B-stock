'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { apiFetch, toastError, toastWarnings } from '@/lib/api-client'

/**
 * Suppression d'un produit avec confirmation.
 * L'API supprime définitivement un produit jamais utilisé ; sinon elle le
 * désactive (softDeleted) pour conserver l'historique — on affiche son message.
 */
export function DeleteProductButton({ productId, productName }: { productId: string; productName: string }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [deleting, setDeleting] = useState(false)

    async function handleDelete() {
        setDeleting(true)
        try {
            const res = await apiFetch<{ softDeleted?: boolean; message?: string; warnings?: unknown }>(
                `/api/products/${productId}`,
                { method: 'DELETE' }
            )
            setOpen(false)
            if (res?.softDeleted) {
                toast.info(res.message || 'Produit désactivé (historique conservé)', { duration: 8000 })
                router.refresh()
            } else {
                toast.success(res?.message || 'Produit supprimé')
                router.push('/dashboard/products')
                router.refresh()
            }
            toastWarnings(res?.warnings)
        } catch (e) {
            toastError(e, 'Suppression impossible')
        } finally {
            setDeleting(false)
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={(next) => !deleting && setOpen(next)}>
            <AlertDialogTrigger asChild>
                <Button
                    variant="outline"
                    className="rounded-md h-11 px-6 font-bold text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Supprimer
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer « {productName} » ?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Si ce produit n&apos;a jamais été utilisé, il sera supprimé définitivement avec ses
                        variantes. S&apos;il est lié à du stock, des mouvements ou des documents (ventes, achats,
                        inventaires), il sera seulement désactivé afin de conserver l&apos;historique.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={deleting}
                        onClick={(e) => {
                            e.preventDefault()
                            handleDelete()
                        }}
                        className="bg-destructive hover:bg-destructive"
                    >
                        {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Supprimer
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
