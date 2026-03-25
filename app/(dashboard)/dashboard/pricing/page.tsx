'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Percent, Tag, Plus, Edit, Trash2, Calendar, DollarSign } from 'lucide-react'

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

function fmt(n: number) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0 }).format(n) + ' FCFA' }

export default function PricingPage() {
  const [priceRules, setPriceRules] = useState<PriceRule[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState('rules')
  const [openRule, setOpenRule] = useState(false)
  const [openPromo, setOpenPromo] = useState(false)
  const [products, setProducts] = useState<any[]>([])
  const [depots, setDepots] = useState<any[]>([])
  const [editingRule, setEditingRule] = useState<PriceRule | null>(null)
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null)

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
    try {
      const [priceRes, promoRes, prodRes] = await Promise.all([
        fetch('/api/pricing'),
        fetch('/api/products'),
        fetch('/api/depots'),
      ])
      if (!priceRes.ok || !promoRes.ok || !prodRes.ok) {
        throw new Error('Failed to fetch data')
      }
      const priceJson = await priceRes.json()
      const promoJson = await promoRes.json()
      const prodJson = await prodRes.json()
      setPriceRules(priceJson.data?.priceRules || [])
      setPromotions(promoJson.data?.promotions || [])
      setProducts(Array.isArray(prodJson.data) ? prodJson.data : Array.isArray(prodJson) ? prodJson : [])
      setDepots([])
    } catch (e) { 
      console.error('Error fetching pricing data:', e)
      setProducts([])
      setDepots([])
    }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleSaveRule() {
    const body = {
      type: 'price_rule',
      product_variant_id: ruleProductId,
      client_type: ruleClientType,
      price: Number(rulePrice),
      min_quantity: Number(ruleMinQty),
    }
    await fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setOpenRule(false); setEditingRule(null)
    setRuleProductId(''); setRuleClientType('retail'); setRulePrice(''); setRuleMinQty('1')
    fetchData()
  }

  async function handleSavePromo() {
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
    await fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setOpenPromo(false); setEditingPromo(null)
    setPromoName(''); setPromoDiscountType('percentage'); setPromoDiscountValue('')
    setPromoAppliesTo('all'); setPromoProductId(''); setPromoCategory('')
    setPromoClientType(''); setPromoMinQty('1'); setPromoMinOrder(''); setPromoActive(true)
    fetchData()
  }

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Tarification" />
        <div className="flex-1 flex items-center justify-center text-sm text-zinc-400">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Tarification" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        <Tabs value={tab} onValueChange={setTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="rules">Règles de prix ({priceRules.length})</TabsTrigger>
              <TabsTrigger value="promotions">Promotions ({promotions.length})</TabsTrigger>
            </TabsList>
            {tab === 'rules' && (
              <Button size="sm" onClick={() => setOpenRule(true)}>
                <Tag className="h-4 w-4 mr-2" /> Nouvelle règle
              </Button>
            )}
            {tab === 'promotions' && (
              <Button size="sm" onClick={() => setOpenPromo(true)}>
                <Percent className="h-4 w-4 mr-2" /> Nouvelle promotion
              </Button>
            )}
          </div>

          {/* Price Rules */}
          <TabsContent value="rules" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Règles de prix par client</CardTitle></CardHeader>
              <CardContent className="p-0">
                {priceRules.length === 0 ? (
                  <div className="p-8 text-center text-sm text-zinc-400">Aucune règle de prix</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produit</TableHead>
                        <TableHead>Type client</TableHead>
                        <TableHead className="text-center">Qté min</TableHead>
                        <TableHead className="text-right">Prix</TableHead>
                        <TableHead>Validité</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priceRules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="text-sm">{rule.product_name} {rule.packaging_name}</TableCell>
                          <TableCell className="text-sm capitalize">{rule.client_type}</TableCell>
                          <TableCell className="text-center text-sm">{rule.min_quantity}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmt(Number(rule.price))}</TableCell>
                          <TableCell className="text-sm text-zinc-500">
                            {rule.valid_from && rule.valid_until
                              ? `${new Date(rule.valid_from).toLocaleDateString('fr-FR')} - ${new Date(rule.valid_until).toLocaleDateString('fr-FR')}`
                              : rule.valid_from
                              ? `À partir du ${new Date(rule.valid_from).toLocaleDateString('fr-FR')}`
                              : 'Illimitée'
                            }
                          </TableCell>
                          <TableCell>
                            <Badge variant={rule.is_active ? 'default' : 'secondary'}>
                              {rule.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="h-7 text-xs">
                              <Edit className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Promotions */}
          <TabsContent value="promotions" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Promotions et remises</CardTitle></CardHeader>
              <CardContent className="p-0">
                {promotions.length === 0 ? (
                  <div className="p-8 text-center text-sm text-zinc-400">Aucune promotion</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Valeur</TableHead>
                        <TableHead>Applique à</TableHead>
                        <TableHead>Conditions</TableHead>
                        <TableHead>Validité</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {promotions.map((promo) => (
                        <TableRow key={promo.id}>
                          <TableCell className="text-sm font-medium">{promo.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={promo.discount_type === 'percentage' ? 'border-blue-200 text-blue-700' : 'border-green-200 text-green-700'}>
                              {promo.discount_type === 'percentage' ? '%' : 'FCFA'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {promo.discount_type === 'percentage' ? `${promo.discount_value}%` : fmt(Number(promo.discount_value))}
                          </TableCell>
                          <TableCell className="text-sm">
                            {promo.applies_to === 'all' ? 'Tous' : promo.applies_to === 'category' ? promo.category : promo.product_name}
                          </TableCell>
                          <TableCell className="text-sm text-zinc-500">
                            {promo.min_quantity > 1 && `Min ${promo.min_quantity} pcs`}
                            {promo.min_order_amount && ` • Min ${fmt(Number(promo.min_order_amount))}`}
                            {promo.client_type && ` • ${promo.client_type}`}
                          </TableCell>
                          <TableCell className="text-sm text-zinc-500">
                            {promo.valid_from && promo.valid_until
                              ? `${new Date(promo.valid_from).toLocaleDateString('fr-FR')} - ${new Date(promo.valid_until).toLocaleDateString('fr-FR')}`
                              : promo.valid_from
                              ? `À partir du ${new Date(promo.valid_from).toLocaleDateString('fr-FR')}`
                              : 'Illimitée'
                            }
                          </TableCell>
                          <TableCell>
                            <Badge variant={promo.is_active ? 'default' : 'secondary'}>
                              {promo.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" className="h-7 text-xs">
                              <Edit className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Price Rule Dialog */}
        <Dialog open={openRule} onOpenChange={setOpenRule}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouvelle règle de prix</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Produit *</Label>
                <Select value={ruleProductId} onValueChange={setRuleProductId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type client *</Label>
                  <Select value={ruleClientType} onValueChange={setRuleClientType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retail">Détail</SelectItem>
                      <SelectItem value="wholesale">Gros</SelectItem>
                      <SelectItem value="semi_wholesale">Semi-gros</SelectItem>
                      <SelectItem value="depot">Dépôt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Quantité min</Label>
                  <Input type="number" value={ruleMinQty} onChange={(e) => setRuleMinQty(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Prix (FCFA) *</Label>
                <Input type="number" value={rulePrice} onChange={(e) => setRulePrice(e.target.value)} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
              <Button onClick={handleSaveRule} disabled={!ruleProductId || !rulePrice}>
                <Tag className="h-4 w-4 mr-2" /> Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Promotion Dialog */}
        <Dialog open={openPromo} onOpenChange={setOpenPromo}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Nouvelle promotion</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label>Nom *</Label>
                <Input value={promoName} onChange={(e) => setPromoName(e.target.value)} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Type de remise</Label>
                  <Select value={promoDiscountType} onValueChange={setPromoDiscountType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Pourcentage (%)</SelectItem>
                      <SelectItem value="fixed_amount">Montant fixe (FCFA)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valeur *</Label>
                  <Input type="number" value={promoDiscountValue} onChange={(e) => setPromoDiscountValue(e.target.value)} className="mt-1" />
                </div>
              </div>
              <div>
                <Label>Applique à</Label>
                <Select value={promoAppliesTo} onValueChange={setPromoAppliesTo}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les produits</SelectItem>
                    <SelectItem value="category">Catégorie</SelectItem>
                    <SelectItem value="product">Produit spécifique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {promoAppliesTo === 'product' && (
                <div>
                  <Label>Produit</Label>
                  <Select value={promoProductId} onValueChange={setPromoProductId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                    <SelectContent>
                      {products.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {promoAppliesTo === 'category' && (
                <div>
                  <Label>Catégorie</Label>
                  <Input value={promoCategory} onChange={(e) => setPromoCategory(e.target.value)} placeholder="ex: Boissons gazeuses" className="mt-1" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantité min</Label>
                  <Input type="number" value={promoMinQty} onChange={(e) => setPromoMinQty(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Montant min commande</Label>
                  <Input type="number" value={promoMinOrder} onChange={(e) => setPromoMinOrder(e.target.value)} placeholder="FCFA" className="mt-1" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={promoActive} onCheckedChange={setPromoActive} />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Annuler</Button></DialogClose>
              <Button onClick={handleSavePromo} disabled={!promoName || !promoDiscountValue}>
                <Percent className="h-4 w-4 mr-2" /> Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
