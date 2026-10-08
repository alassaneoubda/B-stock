'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Panel } from '@/components/app/blocks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { apiFetch, toastError } from '@/lib/api-client'
import { DEFAULT_VAT_RATE, VAT_NOT_APPLICABLE } from '@/lib/vat'

type Initial = {
  vatEnabled: boolean
  vatRate: number
  pricesIncludeTax: boolean
  taxId: string | null
  alertExpiryDays: number
  posAutoUnpack: boolean
}

/**
 * Réglages métier de la page Paramètres :
 *  - TVA (propriétaire) : assujettissement, taux standard, prix saisis TTC/HT, NCC ;
 *  - alertes de péremption (propriétaire) ;
 *  - ouverture automatique des casiers au point de vente (gérant / propriétaire).
 */
export function BusinessSettings({
  initial,
  isOwner,
  canManagePos,
}: {
  initial: Initial
  isOwner: boolean
  canManagePos: boolean
}) {
  const [vatEnabled, setVatEnabled] = useState(initial.vatEnabled)
  const [vatRate, setVatRate] = useState(String(initial.vatRate ?? DEFAULT_VAT_RATE))
  const [pricesIncludeTax, setPricesIncludeTax] = useState(initial.pricesIncludeTax)
  const [taxId, setTaxId] = useState(initial.taxId ?? '')
  const [expiryDays, setExpiryDays] = useState(String(initial.alertExpiryDays ?? 30))
  const [autoUnpack, setAutoUnpack] = useState(initial.posAutoUnpack)
  const [saving, setSaving] = useState(false)
  const [savingPos, setSavingPos] = useState(false)

  async function saveCompany() {
    const rate = Number(vatRate.replace(',', '.'))
    const days = Number(expiryDays)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast.error('Taux de TVA invalide (entre 0 et 100 %)')
      return
    }
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      toast.error('Délai de péremption invalide (1 à 365 jours)')
      return
    }
    setSaving(true)
    try {
      await apiFetch('/api/company', {
        method: 'PATCH',
        body: {
          vat_enabled: vatEnabled,
          vat_rate: rate,
          vat_prices_include_tax: pricesIncludeTax,
          tax_id: taxId.trim(),
          alert_expiry_days: days,
        },
      })
      toast.success('Réglages enregistrés')
    } catch (e) {
      toastError(e, 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  async function togglePos(next: boolean) {
    setSavingPos(true)
    try {
      await apiFetch('/api/pos/settings', { method: 'PATCH', body: { autoUnpack: next } })
      setAutoUnpack(next)
      toast.success(next ? 'Ouverture automatique activée' : 'Ouverture automatique désactivée')
    } catch (e) {
      toastError(e, 'Enregistrement impossible')
    } finally {
      setSavingPos(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {isOwner && (
        <Panel
          title="TVA et alertes"
          description="Beaucoup de dépôts ne sont pas assujettis : laissez la TVA désactivée si c'est votre cas."
        >
          <div className="space-y-4 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="vat-enabled">Entreprise assujettie à la TVA</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {vatEnabled
                    ? 'Factures, tickets et export comptable détaillent HT / TVA / TTC.'
                    : `Vos documents portent la mention « ${VAT_NOT_APPLICABLE} ».`}
                </p>
              </div>
              <Switch id="vat-enabled" checked={vatEnabled} onCheckedChange={setVatEnabled} />
            </div>

            {vatEnabled && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="vat-rate">Taux standard (%)</Label>
                    <Input
                      id="vat-rate"
                      inputMode="decimal"
                      value={vatRate}
                      onChange={(e) => setVatRate(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      18 % en Côte d&apos;Ivoire. Un taux propre (ou 0 %) peut être fixé par produit.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tax-id">Numéro de compte contribuable (NCC)</Label>
                    <Input id="tax-id" value={taxId} maxLength={50} onChange={(e) => setTaxId(e.target.value)} />
                    <p className="text-xs text-muted-foreground">Imprimé sur les factures et les tickets.</p>
                  </div>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label htmlFor="vat-ttc">Prix du catalogue saisis TTC</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {pricesIncludeTax
                        ? 'Le prix affiché est celui payé par le client ; la TVA en est extraite.'
                        : 'Les prix saisis sont hors taxe : le prix de vente TTC = HT + TVA, arrondi au franc.'}
                    </p>
                  </div>
                  <Switch id="vat-ttc" checked={pricesIncludeTax} onCheckedChange={setPricesIncludeTax} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Les consignes d&apos;emballages ne sont jamais soumises à la TVA. Le calcul est figé sur chaque
                  document au moment de l&apos;opération : un changement de réglage ne modifie pas les documents passés.
                </p>
              </>
            )}

            <div className="space-y-1.5 border-t border-border pt-4">
              <Label htmlFor="expiry-days">Alerte péremption (jours)</Label>
              <Input
                id="expiry-days"
                inputMode="numeric"
                className="w-28"
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Signale les lots qui périment dans ce délai.</p>
            </div>

            <div className="flex justify-end">
              <Button variant="brand" onClick={saveCompany} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Enregistrer
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {canManagePos && (
        <Panel title="Point de vente" description="Vente à la bouteille dans les maquis et bars">
          <div className="flex items-start justify-between gap-4 px-5 py-4">
            <div>
              <Label htmlFor="pos-auto-unpack">Ouverture automatique des casiers</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Quand le stock à l&apos;unité est épuisé, un casier lié est ouvert sans demander de confirmation
                au serveur.
              </p>
            </div>
            <Switch
              id="pos-auto-unpack"
              checked={autoUnpack}
              disabled={savingPos}
              onCheckedChange={(v) => void togglePos(v)}
            />
          </div>
        </Panel>
      )}
    </div>
  )
}
