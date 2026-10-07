'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Percent, Tag, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch, toastError } from '@/lib/api-client'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states'

interface PriceRule {
  id: string; product_name: string; packaging_name: string; client_type: string
  price: number; min_quantity: number; is_active: boolean
  valid_from: string | null; valid_until: string | null
}

interface Promotion {
  id: string; name: string; discount_type: string; discount_value: number
  applies_to: string; product_name: string | null; category: string | null
  client_type: string | null; min_quantity: number; min_order_amount: number | null
  is_active: boolean; valid_from: string | null; valid_until: string | null
}

const fmt = formatMoney

const clientTypeLabels: Record<string, string> = {
  retail: 'Détail',
  wholesale: 'Gros',
  semi_wholesale: 'Semi-gros',
  depot: 'Dépôt',
  restaurant: 'Restaurant',
  bar: 'Bar',
  subdepot: 'Sous-dépôt',
}

function validityLabel(from: string | null, until: string | null) {
  if (from && until) return `${formatDate(from)} - ${formatDate(until)}`
  if (from) return `À partir du ${formatDate(from)}`
  if (until) return `Jusqu'au ${formatDate(until)}`
  return 'Illimitée'
}

export default function PricingPage() {
  const [priceRules, setPriceRules] = useState<PriceRule[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState('rules')
  const [openRule, setOpenRule] = useState(false)
  const [openPromo, setOpenPromo] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [loadError, setLoadError] = useState(false)
  const [savingRule, setSavingRule] = useState(false)
  const [savingPromo, setSavingPromo] = useState(false)

  // Form states for price rule
  const [ruleProductId, setRuleProductId] = useState('')
  const [ruleClientType, setRuleClientType] = useState('retail')
  const [rulePrice, setRulePrice] = useState('')
  const [ruleMinQty, setRuleMinQty] = useState('1')

  // Form states for promotion
  const [promoName, setPromoName] = useState('')
  const [promoDiscountType, setPromoDiscountType] = useState('percentage')
  const [promoDiscountValue, setPromoDiscountValue] = useState('')
  const [promoAppliesTo, setPromoAppliesTo] = useState('all')
  const [promoProductId, setPromoProductId] = useState('')
  const [promoCategory, setPromoCategory] = useState('')
  const [promoClientType, setPromoClientType] = useState('')
  const [promoMinQty, setPromoMinQty] = useState('1')
  const [promoMinOrder, setPromoMinOrder] = useState('')
  const [promoActive, setPromoActive] = useState(true)

  const fetchData = useCallback(async () => {
    setLoadError(false)
    try {
      // Auparavant les promotions étaient lues dans la réponse produits (toujours vides)
      // et les produits dans la réponse dépôts.
      const [pricingJson, prodJson] = await Promise.all([
        apiFetch('/api/pricing'),
        apiFetch('/api/products?limit=500'),
      ])
      setPriceRules(pricingJson.data?.priceRules || [])
      setPromotions(pricingJson.data?.promotions || [])
      setProducts(Array.isArray(prodJson.data) ? prodJson.data : Array.isArray(prodJson) ? prodJson : [])
    } catch (e) {
      setLoadError(true)
      toastError(e, 'Impossible de charger la tarification')
    }
    finally { setIsLoading(false) }
  }, [])

  // Produits aplatis en variantes « Produit — Emballage » (l'API attend un id de variante)
  const variantOptions = useMemo(
    () =>
      products.flatMap((p: any) =>
        (Array.isArray(p.variants) ? p.variants : []).map((v: any) => ({
          id: v.id as string,
          label: v.packaging_name ? `${p.name} — ${v.packaging_name}` : (p.name as string),
          price: Number(v.price || 0),
        }))
      ),
    [products]
  )

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSaveRule() {
    if (savingRule) return
    const body = {
      type: 'price_rule',
      product_variant_id: ruleProductId,
      client_type: ruleClientType,
      price: Number(rulePrice),
      min_quantity: Number(ruleMinQty),
    }
    setSavingRule(true)
    try {
      await apiFetch('/api/pricing', { method: 'POST', body })
      toast.success('Règle de prix enregistrée')
      setOpenRule(false)
      setRuleProductId(''); setRuleClientType('retail'); setRulePrice(''); setRuleMinQty('1')
      fetchData()
    } catch (e) {
      toastError(e, 'Règle non enregistrée')
    } finally {
      setSavingRule(false)
    }
  }

  async function handleSavePromo() {
    if (savingPromo) return
    const body = {
      type: 'promotion',
      name: promoName,
      discount_type: promoDiscountType,
      discount_value: Number(promoDiscountValue),
      applies_to: promoAppliesTo,
      product_variant_id: promoProductId || undefined,
      category: promoCategory || undefined,
      client_type: promoClientType || undefined,
      min_quantity: Number(promoMinQty),
      min_order_amount: promoMinOrder ? Number(promoMinOrder) : undefined,
      is_active: promoActive,
    }
    setSavingPromo(true)
    try {
      await apiFetch('/api/pricing', { method: 'POST', body })
      toast.success('Promotion enregistrée')
      setOpenPromo(false)
      setPromoName(''); setPromoDiscountType('percentage'); setPromoDiscountValue('')
      setPromoAppliesTo('all'); setPromoProductId(''); setPromoCategory('')
      setPromoClientType(''); setPromoMinQty('1'); setPromoMinOrder(''); setPromoActive(true)
      fetchData()
    } catch (e) {
      toastError(e, 'Promotion non enregistrée')
    } finally {
      setSavingPromo(false)
    }
  }

  const ruleProduct = (rule: PriceRule) => `${rule.product_name}${rule.packaging_name ? ` — ${rule.packaging_name}` : ''}`
  const promoTarget = (promo: Promotion) =>
    promo.applies_to === 'all' ? 'Tous les produits' : promo.applies_to === 'category' ? promo.category : promo.product_name
  const promoValue = (promo: Promotion) =>
    promo.discount_type === 'percentage' ? `${formatNumber(promo.discount_value)} %` : fmt(Number(promo.discount_value))
  const promoConditions = (promo: Promotion) =>
    [
      promo.min_quantity > 1 ? `Min ${formatNumber(promo.min_quantity)} pcs` : null,
      promo.min_order_amount ? `Min ${fmt(Number(promo.min_order_amount))}` : null,
      promo.client_type ? clientTypeLabels[promo.client_type] || promo.client_type : null,
    ]
      .filter(Boolean)
      .join(' · ')

  if (isLoading) {
    return <PageSkeleton />
  }

  const description = 'Prix par type de client et promotions'

  if (loadError && priceRules.length === 0 && promotions.length === 0) {
    return (
      <div className="flex min-h-screen flex-col">
        <DashboardHeader title="Tarification" description={description} />
        <PageShell>
          <ErrorState title="Impossible de charger la tarification" onRetry={() => { setIsLoading(true); fetchData() }} />
        </PageShell>
      </div>
    )
  }

  const headerAction =
    tab === 'rules' ? (
      <Button variant="brand" size="sm" className="h-9" onClick={() => setOpenRule(true)}>
        <Tag className="h-4 w-4" aria-hidden="true" /> Nouvelle règle
      </Button>
    ) : (
      <Button variant="brand" size="sm" className="h-9" onClick={() => setOpenPromo(true)}>
        <Percent className="h-4 w-4" aria-hidden="true" /> Nouvelle promotion
      </Button>
    )

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Tarification" description={description} actions={headerAction} />
      <PageShell>
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="rules">
              Règles de prix <span className="tabular ml-1 text-muted-foreground">{priceRules.length}</span>
            </TabsTrigger>
            <TabsTrigger value="promotions">
              Promotions <span className="tabular ml-1 text-muted-foreground">{promotions.length}</span>
            </TabsTrigger>
          </TabsList>

          {/* Règles de prix */}
          <TabsContent value="rules">
            <Panel title="Règles de prix par client" description="Prix spécifique selon le type de client et la quantité">
              {priceRules.length === 0 ? (
                <EmptyState
                  icon={Tag}
                  className="m-4"
                  title="Aucune règle de prix"
                  description="Définissez un prix spécifique par type de client et quantité minimale."
                  action={{ label: 'Nouvelle règle', onClick: () => setOpenRule(true) }}
                />
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-5">Produit</TableHead>
                          <TableHead>Type client</TableHead>
                          <TableHead className="text-right">Qté min</TableHead>
                          <TableHead className="text-right">Prix</TableHead>
                          <TableHead>Validité</TableHead>
                          <TableHead className="pr-5">Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {priceRules.map((rule) => (
                          <TableRow key={rule.id}>
                            <TableCell className="pl-5 text-sm font-medium text-foreground">{ruleProduct(rule)}</TableCell>
                            <TableCell className="text-sm">{clientTypeLabels[rule.client_type] || rule.client_type}</TableCell>
                            <TableCell className="tabular text-right text-sm">{formatNumber(rule.min_quantity)}</TableCell>
                            <TableCell className="tabular text-right text-sm font-semibold">{fmt(Number(rule.price))}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{validityLabel(rule.valid_from, rule.valid_until)}</TableCell>
                            <TableCell className="pr-5">
                              <StatusBadge label={rule.is_active ? 'Active' : 'Inactive'} tone={rule.is_active ? 'success' : 'default'} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ul className="divide-y divide-border md:hidden">
                    {priceRules.map((rule) => (
                      <li key={rule.id} className="flex items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-medium text-foreground">{ruleProduct(rule)}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {clientTypeLabels[rule.client_type] || rule.client_type} · Min {formatNumber(rule.min_quantity)} · {validityLabel(rule.valid_from, rule.valid_until)}
                          </p>
                          <StatusBadge label={rule.is_active ? 'Active' : 'Inactive'} tone={rule.is_active ? 'success' : 'default'} />
                        </div>
                        <span className="tabular shrink-0 text-sm font-semibold text-foreground">{fmt(Number(rule.price))}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          </TabsContent>

          {/* Promotions */}
          <TabsContent value="promotions">
            <Panel title="Promotions et remises" description="Remises en pourcentage ou en montant fixe">
              {promotions.length === 0 ? (
                <EmptyState
                  icon={Percent}
                  className="m-4"
                  title="Aucune promotion"
                  description="Créez une remise en pourcentage ou en montant fixe."
                  action={{ label: 'Nouvelle promotion', onClick: () => setOpenPromo(true) }}
                />
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-5">Nom</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Valeur</TableHead>
                          <TableHead>S&apos;applique à</TableHead>
                          <TableHead>Conditions</TableHead>
                          <TableHead>Validité</TableHead>
                          <TableHead className="pr-5">Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {promotions.map((promo) => (
                          <TableRow key={promo.id}>
                            <TableCell className="pl-5 text-sm font-medium text-foreground">{promo.name}</TableCell>
                            <TableCell>
                              <Badge variant={promo.discount_type === 'percentage' ? 'brand' : 'info'}>
                                {promo.discount_type === 'percentage' ? 'Pourcentage' : 'Montant fixe'}
                              </Badge>
                            </TableCell>
                            <TableCell className="tabular text-right text-sm font-semibold">{promoValue(promo)}</TableCell>
                            <TableCell className="text-sm">{promoTarget(promo)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{promoConditions(promo) || '—'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{validityLabel(promo.valid_from, promo.valid_until)}</TableCell>
                            <TableCell className="pr-5">
                              <StatusBadge label={promo.is_active ? 'Active' : 'Inactive'} tone={promo.is_active ? 'success' : 'default'} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ul className="divide-y divide-border md:hidden">
                    {promotions.map((promo) => (
                      <li key={promo.id} className="flex items-start justify-between gap-3 px-4 py-3">
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-medium text-foreground">{promo.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {promoTarget(promo)}{promoConditions(promo) ? ` · ${promoConditions(promo)}` : ''}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{validityLabel(promo.valid_from, promo.valid_until)}</p>
                          <StatusBadge label={promo.is_active ? 'Active' : 'Inactive'} tone={promo.is_active ? 'success' : 'default'} />
                        </div>
                        <span className="tabular shrink-0 text-sm font-semibold text-foreground">−{promoValue(promo)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Panel>
          </TabsContent>
        </Tabs>

        {/* Nouvelle règle de prix */}
        <Dialog open={openRule} onOpenChange={(o) => { if (!savingRule) setOpenRule(o) }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouvelle règle de prix</DialogTitle>
              <DialogDescription>Ce prix remplace le prix catalogue pour le type de client choisi.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Produit *</Label>
                <Select value={ruleProductId} onValueChange={setRuleProductId}>
                  <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                  <SelectContent>
                    {variantOptions.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {ruleProductId && (
                  <p className="text-xs text-muted-foreground">
                    Prix catalogue : <span className="tabular">{fmt(variantOptions.find((v) => v.id === ruleProductId)?.price ?? 0)}</span>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Type client *</Label>
                <Select value={ruleClientType} onValueChange={setRuleClientType}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">Détail</SelectItem>
                    <SelectItem value="wholesale">Gros</SelectItem>
                    <SelectItem value="semi_wholesale">Semi-gros</SelectItem>
                    <SelectItem value="depot">Dépôt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-min-qty">Quantité min</Label>
                <Input id="rule-min-qty" type="number" min={1} value={ruleMinQty} onChange={(e) => setRuleMinQty(e.target.value)} className="tabular h-10" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="rule-price">Prix (FCFA) *</Label>
                <Input id="rule-price" type="number" min={1} value={rulePrice} onChange={(e) => setRulePrice(e.target.value)} className="tabular h-10" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
              <Button onClick={handleSaveRule} disabled={savingRule || !ruleProductId || !rulePrice}>
                {savingRule && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Créer la règle
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Nouvelle promotion */}
        <Dialog open={openPromo} onOpenChange={(o) => { if (!savingPromo) setOpenPromo(o) }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nouvelle promotion</DialogTitle>
              <DialogDescription>Remise appliquée automatiquement aux ventes qui remplissent les conditions.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="promo-name">Nom *</Label>
                <Input id="promo-name" value={promoName} onChange={(e) => setPromoName(e.target.value)} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Type de remise</Label>
                <Select value={promoDiscountType} onValueChange={setPromoDiscountType}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Pourcentage (%)</SelectItem>
                    <SelectItem value="fixed_amount">Montant fixe (FCFA)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-value">Valeur *</Label>
                <Input id="promo-value" type="number" value={promoDiscountValue} onChange={(e) => setPromoDiscountValue(e.target.value)} className="tabular h-10" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>S&apos;applique à</Label>
                <Select value={promoAppliesTo} onValueChange={setPromoAppliesTo}>
                  <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les produits</SelectItem>
                    <SelectItem value="category">Catégorie</SelectItem>
                    <SelectItem value="product">Produit spécifique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {promoAppliesTo === 'product' && (
                <div className="space-y-2 md:col-span-2">
                  <Label>Produit</Label>
                  <Select value={promoProductId} onValueChange={setPromoProductId}>
                    <SelectTrigger className="h-10 w-full"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                    <SelectContent>
                      {variantOptions.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {promoAppliesTo === 'category' && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="promo-category">Catégorie</Label>
                  <Input id="promo-category" value={promoCategory} onChange={(e) => setPromoCategory(e.target.value)} placeholder="ex. Boissons gazeuses" className="h-10" />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="promo-min-qty">Quantité min</Label>
                <Input id="promo-min-qty" type="number" value={promoMinQty} onChange={(e) => setPromoMinQty(e.target.value)} className="tabular h-10" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="promo-min-order">Montant min commande</Label>
                <Input id="promo-min-order" type="number" value={promoMinOrder} onChange={(e) => setPromoMinOrder(e.target.value)} placeholder="FCFA" className="tabular h-10" />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5 md:col-span-2">
                <div>
                  <Label htmlFor="promo-active">Active</Label>
                  <p className="text-xs text-muted-foreground">Une promotion inactive n&apos;est pas appliquée aux ventes.</p>
                </div>
                <Switch id="promo-active" checked={promoActive} onCheckedChange={setPromoActive} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
              <Button onClick={handleSavePromo} disabled={savingPromo || !promoName || !promoDiscountValue || (promoAppliesTo === 'product' && !promoProductId)}>
                {savingPromo && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Créer la promotion
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    </div>
  )
}
