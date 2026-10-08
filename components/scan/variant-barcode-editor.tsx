'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Pencil, ScanBarcode, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { usePermissions } from '@/components/providers/permissions-provider'
import { apiFetch, toastError } from '@/lib/api-client'
import { normalizeBarcode } from './barcode-format'
import { BarcodeInput } from './barcode-input'

/**
 * Cellule « Code-barres » d'une variante sur la fiche produit : affichage, et
 * pour les utilisateurs ayant products.write, saisie / scan / retrait du code.
 */
export function VariantBarcodeEditor({
  variantId,
  barcode,
  variantLabel,
}: {
  variantId: string
  barcode: string | null
  variantLabel: string
}) {
  const router = useRouter()
  const { can } = usePermissions()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(barcode ?? '')
  const [saving, setSaving] = useState<'save' | 'remove' | null>(null)

  const canEdit = can('products.write')

  async function save(e: FormEvent) {
    e.preventDefault()
    const code = normalizeBarcode(value)
    if (!code) return
    if (code === barcode) {
      setOpen(false)
      return
    }
    setSaving('save')
    try {
      await apiFetch(`/api/products/barcode/${encodeURIComponent(code)}`, { method: 'POST', body: { variantId } })
      toast.success('Code-barres enregistré')
      setOpen(false)
      router.refresh()
    } catch (err) {
      toastError(err, 'Enregistrement impossible')
    } finally {
      setSaving(null)
    }
  }

  async function remove() {
    if (!barcode) return
    setSaving('remove')
    try {
      await apiFetch(`/api/products/barcode/${encodeURIComponent(barcode)}?variantId=${variantId}`, { method: 'DELETE' })
      toast.success('Code-barres retiré')
      setOpen(false)
      router.refresh()
    } catch (err) {
      toastError(err, 'Suppression impossible')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <span className="font-mono text-xs text-muted-foreground">{barcode || '—'}</span>
      {canEdit && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            setValue(barcode ?? '')
            setOpen(true)
          }}
          aria-label={barcode ? `Modifier le code-barres de ${variantLabel}` : `Ajouter un code-barres à ${variantLabel}`}
          title={barcode ? 'Modifier le code-barres' : 'Ajouter un code-barres'}
        >
          {barcode ? <Pencil /> : <ScanBarcode />}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={save} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Code-barres</DialogTitle>
              <DialogDescription>{variantLabel}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor={`barcode-${variantId}`}>Code (EAN-13, EAN-8, UPC, Code 128…)</Label>
              <BarcodeInput
                id={`barcode-${variantId}`}
                value={value}
                onChange={setValue}
                placeholder="Scannez ou saisissez le code"
                className="h-11"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Avec un lecteur USB ou Bluetooth, placez le curseur dans le champ puis scannez l’article.
              </p>
            </div>
            <DialogFooter className="gap-2">
              {barcode && (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
                  onClick={() => void remove()}
                  disabled={saving !== null}
                >
                  {saving === 'remove' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                  Retirer
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving !== null}>
                Annuler
              </Button>
              <Button type="submit" disabled={saving !== null || !normalizeBarcode(value)}>
                {saving === 'save' && <Loader2 className="animate-spin" aria-hidden="true" />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
