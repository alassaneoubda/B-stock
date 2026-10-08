/**
 * TVA optionnelle par entreprise.
 *
 * Beaucoup de petits dépôts ne sont pas assujettis : la TVA est DÉSACTIVÉE par
 * défaut et, tant qu'elle l'est, rien ne change (aucune colonne TVA écrite,
 * documents « TVA non applicable »).
 *
 * Règles (entreprise assujettie) :
 *  - Taux : celui du produit (products.vat_rate, 0 = exonéré) sinon le taux
 *    standard de l'entreprise (18 % en Côte d'Ivoire par défaut).
 *  - Le prix de vente et les paiements restent TOUJOURS en TTC : seule la
 *    décomposition HT / TVA est ajoutée, figée sur chaque ligne au moment de
 *    l'opération (vente, facture, retour, avoir).
 *  - Arrondi au franc PAR LIGNE : TTC de la ligne = quantité × prix TTC ;
 *    HT = arrondi(TTC / (1 + taux)) ; TVA = TTC − HT. Les totaux sont la somme
 *    des lignes (jamais recalculés sur le total), donc toujours cohérents.
 *  - Prix du catalogue saisis TTC (défaut, prix de boissons affichés TTC) ou
 *    HT : en mode HT, le prix de vente TTC d'une unité = arrondi(HT × (1 + taux)) ;
 *    c'est ce prix TTC qui est proposé par le point de vente et l'écran de vente.
 *  - Consignes d'emballage : jamais soumises à la TVA (dette envers le client,
 *    pas une vente).
 */

export type VatSettings = {
  enabled: boolean
  /** Taux standard en % (ex. 18). */
  standardRate: number
  /** Prix du catalogue saisis TTC (true) ou HT (false). */
  pricesIncludeTax: boolean
  /** Numéro de compte contribuable (NCC). */
  taxId: string | null
}

export const DEFAULT_VAT_RATE = 18

export const DISABLED_VAT: VatSettings = {
  enabled: false,
  standardRate: DEFAULT_VAT_RATE,
  pricesIncludeTax: true,
  taxId: null,
}

/** Mention imprimée sur les documents d'une entreprise non assujettie. */
export const VAT_NOT_APPLICABLE = 'TVA non applicable'

export type VatSplit = { rate: number; ht: number; vat: number; ttc: number }

const franc = (v: number) => Math.round(Number(v) || 0)
const cents = (v: number) => Math.round((Number(v) || 0) * 100) / 100

/** Taux effectif d'un produit (0 si l'entreprise n'est pas assujettie). */
export function effectiveRate(settings: VatSettings, productRate?: number | string | null): number {
  if (!settings.enabled) return 0
  if (productRate !== null && productRate !== undefined && productRate !== '') {
    const r = Number(productRate)
    if (Number.isFinite(r) && r >= 0 && r <= 100) return r
  }
  return settings.standardRate
}

/**
 * Décompose un montant TTC (arrondi au franc) : HT = arrondi(TTC / (1 + taux)),
 * TVA = TTC − HT. Un montant TTC négatif est décomposé symétriquement.
 */
export function splitTtc(ttc: number, rate: number): VatSplit {
  const t = cents(ttc)
  if (!(rate > 0) || t === 0) return { rate: rate > 0 ? rate : 0, ht: t, vat: 0, ttc: t }
  const sign = t < 0 ? -1 : 1
  const abs = Math.abs(t)
  const ht = franc(abs / (1 + rate / 100))
  return { rate, ht: sign * ht, vat: sign * cents(abs - ht), ttc: t }
}

/** Prix unitaire TTC d'un prix saisi HT (arrondi au franc). */
export function ttcFromHt(ht: number, rate: number): number {
  if (!(rate > 0)) return cents(ht)
  return franc(Number(ht) * (1 + rate / 100))
}

/**
 * Prix de vente TTC d'un prix du catalogue : inchangé si l'entreprise n'est
 * pas assujettie ou si les prix sont saisis TTC ; sinon HT × (1 + taux).
 */
export function catalogPriceTtc(settings: VatSettings, price: number, productRate?: number | string | null): number {
  const p = Number(price) || 0
  if (!settings.enabled || settings.pricesIncludeTax) return p
  return ttcFromHt(p, effectiveRate(settings, productRate))
}

/**
 * Ligne de facture saisie à la main : le prix saisi suit le mode de
 * l'entreprise (TTC par défaut, HT sinon). Renvoie le total TTC de la ligne et
 * sa décomposition (null : pas de TVA — entreprise non assujettie ou consigne).
 * Les lignes « service » prennent le taux standard.
 */
export function invoiceLineVat(
  settings: VatSettings,
  line: { itemType: 'product' | 'packaging' | 'service'; quantity: number; unitPrice: number; productRate?: number | null }
): { total: number; split: VatSplit | null } {
  const amount = cents(line.quantity * line.unitPrice)
  if (!settings.enabled || line.itemType === 'packaging') return { total: amount, split: null }
  const rate = line.itemType === 'service' ? settings.standardRate : effectiveRate(settings, line.productRate)
  if (settings.pricesIncludeTax) return { total: amount, split: splitTtc(amount, rate) }
  const ht = franc(amount)
  const vat = franc((ht * rate) / 100)
  return { total: ht + vat, split: { rate, ht, vat, ttc: ht + vat } }
}

export type VatSummaryLine ={ rate: number; base: number; vat: number; ttc: number }

export type VatSummary = {
  /** Récapitulatif par taux (taux décroissant), lignes taxables uniquement. */
  byRate: VatSummaryLine[]
  totalHt: number
  totalVat: number
  totalTtc: number
}

/** Totaux = somme des lignes (déjà arrondies), regroupés par taux. */
export function summarizeVat(lines: { rate: number | null | undefined; ht: number; vat: number; ttc: number }[]): VatSummary {
  const map = new Map<number, VatSummaryLine>()
  let totalHt = 0
  let totalVat = 0
  let totalTtc = 0
  for (const l of lines) {
    const rate = Number(l.rate ?? 0) || 0
    const g = map.get(rate) ?? { rate, base: 0, vat: 0, ttc: 0 }
    g.base = cents(g.base + Number(l.ht))
    g.vat = cents(g.vat + Number(l.vat))
    g.ttc = cents(g.ttc + Number(l.ttc))
    map.set(rate, g)
    totalHt = cents(totalHt + Number(l.ht))
    totalVat = cents(totalVat + Number(l.vat))
    totalTtc = cents(totalTtc + Number(l.ttc))
  }
  return {
    byRate: [...map.values()].sort((a, b) => b.rate - a.rate),
    totalHt,
    totalVat,
    totalTtc,
  }
}

/** Libellé d'un taux : « 18 % », « 9,5 % ». */
export function formatRate(rate: number): string {
  return `${String(Number(rate)).replace('.', ',')} %`
}

// ---------------------------------------------------------------------------
// Chargement (serveur)
// ---------------------------------------------------------------------------

type QueryFn = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<any[]>

/**
 * Paramètres TVA de l'entreprise. Lus via to_jsonb : sans la migration 035
 * (colonnes absentes), la TVA est simplement désactivée — sans erreur SQL,
 * donc utilisable dans une transaction en cours.
 */
export async function loadVatSettings(q: QueryFn, companyId: string): Promise<VatSettings> {
  const [row] = await q`
    SELECT to_jsonb(c) ->> 'vat_enabled' AS enabled,
           to_jsonb(c) ->> 'vat_rate' AS rate,
           to_jsonb(c) ->> 'vat_prices_include_tax' AS include_tax,
           to_jsonb(c) ->> 'tax_id' AS tax_id
    FROM companies c WHERE c.id = ${companyId}
  `
  if (!row) return DISABLED_VAT
  const rate = Number(row.rate)
  return {
    enabled: row.enabled === 'true',
    standardRate: Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : DEFAULT_VAT_RATE,
    pricesIncludeTax: row.include_tax !== 'false',
    taxId: row.tax_id || null,
  }
}

/**
 * Taux propres par identifiant de PRODUIT ou de VARIANTE (les lignes de facture
 * acceptent les deux). Absent / null = taux standard.
 */
export async function loadProductRates(
  q: QueryFn,
  ids: (string | null | undefined)[]
): Promise<Map<string, number | null>> {
  const list = [...new Set(ids.filter((v): v is string => !!v))]
  if (list.length === 0) return new Map()
  const rows = await q`
    SELECT p.id, to_jsonb(p) ->> 'vat_rate' AS vat_rate FROM products p WHERE p.id = ANY(${list}::uuid[])
    UNION ALL
    SELECT pv.id, to_jsonb(p) ->> 'vat_rate' AS vat_rate
    FROM product_variants pv JOIN products p ON p.id = pv.product_id
    WHERE pv.id = ANY(${list}::uuid[])
  `
  return new Map(rows.map((r) => [r.id as string, r.vat_rate == null ? null : Number(r.vat_rate)]))
}

/** Taux propres des produits des variantes données (NULL = taux standard). */
export async function loadVariantRates(q: QueryFn, variantIds: string[]): Promise<Map<string, number | null>> {
  if (variantIds.length === 0) return new Map()
  const rows = await q`
    SELECT pv.id, to_jsonb(p) ->> 'vat_rate' AS vat_rate
    FROM product_variants pv JOIN products p ON p.id = pv.product_id
    WHERE pv.id = ANY(${variantIds}::uuid[])
  `
  return new Map(rows.map((r) => [r.id as string, r.vat_rate == null ? null : Number(r.vat_rate)]))
}
