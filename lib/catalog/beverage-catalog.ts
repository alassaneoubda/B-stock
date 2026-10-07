/**
 * Catalogue boissons Côte d’Ivoire — identités prédéfinies, sans prix.
 *
 * Le stock est géré par CONDITIONNEMENT (casier, pack, carton), pas à la bouteille :
 * un produit (ex. « Bock ») a plusieurs formats, chacun avec son conditionnement réel
 * (66 cl → casier de 12 bouteilles, 100 cl → casier de 6). Le contenu de chaque
 * conditionnement est propre au format et modifiable par le dépôt.
 * Les prix d’achat / vente sont saisis par chaque dépôt, POUR UN CONDITIONNEMENT.
 */

export const CATALOG_CATEGORIES = [
  'Boissons gazeuses',
  'Bières',
  'Vins',
  'Jus et malts',
  'Eaux minérales',
  'Energy',
] as const

export const CATALOG_BRANDS = [
  'Awa',
  'Brassivoire',
  'Castel',
  'Céleste',
  'Coca-Cola',
  'Délifruit',
  'Fanta',
  'Guinness',
  'Heineken',
  'Olgane',
  'Red Bull',
  'Schweppes',
  'Solibra',
  'Sprite',
  'Tampico',
  'Valpierre',
  'XXL',
  'Youki',
] as const

/** Conditionnements : l'unité dans laquelle le stock est compté et vendu. */
export const PACK_KINDS = ['Casier', 'Pack', 'Carton'] as const
/** Ce que contient un conditionnement (sert uniquement à le décrire). */
export const CONTENT_UNITS = ['bouteilles', 'canettes', 'briques'] as const

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number]
export type CatalogBrand = (typeof CATALOG_BRANDS)[number]
export type PackKind = (typeof PACK_KINDS)[number]
export type ContentUnit = (typeof CONTENT_UNITS)[number]

/** Bornes du contenu d'un conditionnement (casier de 1 à 100 unités). */
export const MIN_UNITS_PER_PACK = 1
export const MAX_UNITS_PER_PACK = 100

export type CatalogVariation = {
  sku: string
  /** Contenance d'une unité, ex. « 66 cl », « 1,5 L ». */
  volume: string
  packKind: PackKind
  unitsPerPack: number
  contentUnit: ContentUnit
}

export type CatalogProduct = {
  /** Référence du produit (stockée dans products.sku). */
  key: string
  name: string
  brand: CatalogBrand
  category: CatalogCategory
  variations: CatalogVariation[]
}

/** Nom de l'emballage d'une variante — c'est aussi son libellé partout (ventes, stock, caisse). */
export function packagingLabel(v: { volume: string; packKind: string; unitsPerPack: number }): string {
  const volume = v.volume.trim()
  const pack = `${v.packKind} de ${v.unitsPerPack}`
  return volume ? `${volume} · ${pack}` : pack
}

/** Description lisible : « Casier de 12 bouteilles de 66 cl ». */
export function packagingDescription(v: {
  volume: string
  packKind: string
  unitsPerPack: number
  contentUnit: string
}): string {
  const volume = v.volume.trim()
  return `${v.packKind} de ${v.unitsPerPack} ${v.contentUnit}${volume ? ` de ${volume}` : ''}`
}

/** Seul un casier (verre consigné) est un emballage retournable ; packs et cartons sont perdus. */
export function isReturnablePack(packKind: string): boolean {
  return packKind.toLowerCase() === 'casier'
}

/**
 * Unités par conditionnement déduites d'un ancien libellé (« Casier 24 », « Pack 6 »).
 * Uniquement en repli quand aucun contenu explicite n'est fourni (création manuelle ancienne).
 */
export function unitsPerCase(unit: string): number {
  const match = unit.match(/(\d+)/)
  return match ? Math.max(1, Number(match[1])) : 1
}

const v = (
  sku: string,
  volume: string,
  packKind: PackKind,
  unitsPerPack: number,
  contentUnit: ContentUnit = 'bouteilles'
): CatalogVariation => ({ sku, volume, packKind, unitsPerPack, contentUnit })

export const BEVERAGE_CATALOG: CatalogProduct[] = [
  // Gazeuses
  { key: 'COCA', name: 'Coca-Cola', brand: 'Coca-Cola', category: 'Boissons gazeuses', variations: [
    v('COCA-33-C24', '33 cl', 'Casier', 24),
    v('COCA-33-CAN-CT24', '33 cl', 'Carton', 24, 'canettes'),
    v('COCA-1L-P6', '1 L', 'Pack', 6),
  ] },
  { key: 'COCAZ', name: 'Coca-Cola Zero', brand: 'Coca-Cola', category: 'Boissons gazeuses', variations: [
    v('COCAZ-33-C24', '33 cl', 'Casier', 24),
  ] },
  { key: 'FANTA', name: 'Fanta Orange', brand: 'Fanta', category: 'Boissons gazeuses', variations: [
    v('FANTA-33-C24', '33 cl', 'Casier', 24),
    v('FANTA-1L-P6', '1 L', 'Pack', 6),
  ] },
  { key: 'SPR', name: 'Sprite', brand: 'Sprite', category: 'Boissons gazeuses', variations: [
    v('SPR-33-C24', '33 cl', 'Casier', 24),
    v('SPR-1L-P6', '1 L', 'Pack', 6),
  ] },
  { key: 'SCHW', name: 'Schweppes Tonic', brand: 'Schweppes', category: 'Boissons gazeuses', variations: [
    v('SCHW-33-C24', '33 cl', 'Casier', 24),
  ] },
  { key: 'YOUKI', name: 'Youki', brand: 'Youki', category: 'Boissons gazeuses', variations: [
    v('YOUKI-33-C24', '33 cl', 'Casier', 24),
  ] },
  { key: 'YOUKIA', name: 'Youki Ananas', brand: 'Youki', category: 'Boissons gazeuses', variations: [
    v('YOUKIA-33-C24', '33 cl', 'Casier', 24),
  ] },

  // Bières
  { key: 'FLAG', name: 'Flag Spéciale', brand: 'Solibra', category: 'Bières', variations: [
    v('FLAG-33-C24', '33 cl', 'Casier', 24),
    v('FLAG-60-C12', '60 cl', 'Casier', 12),
  ] },
  { key: 'FLAGP', name: 'Flag Pils', brand: 'Solibra', category: 'Bières', variations: [
    v('FLAGP-60-C12', '60 cl', 'Casier', 12),
  ] },
  { key: 'BEAU', name: 'Beaufort', brand: 'Solibra', category: 'Bières', variations: [
    v('BEAU-60-C12', '60 cl', 'Casier', 12),
  ] },
  { key: 'BOCK', name: 'Bock', brand: 'Solibra', category: 'Bières', variations: [
    v('BOCK-66-C12', '66 cl', 'Casier', 12),
    v('BOCK-100-C6', '100 cl', 'Casier', 6),
  ] },
  { key: 'CAST', name: 'Castel Beer', brand: 'Castel', category: 'Bières', variations: [
    v('CAST-65-C12', '65 cl', 'Casier', 12),
  ] },
  { key: 'IVOI', name: 'Ivoire', brand: 'Brassivoire', category: 'Bières', variations: [
    v('IVOI-60-C12', '60 cl', 'Casier', 12),
  ] },
  { key: 'AWOO', name: 'Awooyo', brand: 'Brassivoire', category: 'Bières', variations: [
    v('AWOO-60-C12', '60 cl', 'Casier', 12),
  ] },
  { key: 'DOPP', name: 'Doppel Munich', brand: 'Brassivoire', category: 'Bières', variations: [
    v('DOPP-65-C12', '65 cl', 'Casier', 12),
  ] },
  { key: 'HEIN', name: 'Heineken', brand: 'Heineken', category: 'Bières', variations: [
    v('HEIN-33-C24', '33 cl', 'Casier', 24),
    v('HEIN-65-C12', '65 cl', 'Casier', 12),
  ] },
  { key: 'DESP', name: 'Desperados', brand: 'Heineken', category: 'Bières', variations: [
    v('DESP-33-C24', '33 cl', 'Casier', 24),
  ] },
  { key: 'GUI', name: 'Guinness', brand: 'Guinness', category: 'Bières', variations: [
    v('GUI-33-C24', '33 cl', 'Casier', 24),
    v('GUI-60-C12', '60 cl', 'Casier', 12),
  ] },

  // Vins
  { key: 'VALP', name: 'Valpierre', brand: 'Valpierre', category: 'Vins', variations: [
    v('VALP-50-C12', '50 cl', 'Casier', 12),
    v('VALP-100-C12', '100 cl', 'Casier', 12),
  ] },

  // Jus et malts
  { key: 'MALTA', name: 'Malta Guinness', brand: 'Guinness', category: 'Jus et malts', variations: [
    v('MALTA-33-C24', '33 cl', 'Casier', 24),
  ] },
  { key: 'DELI', name: 'Délifruit Cocktail', brand: 'Délifruit', category: 'Jus et malts', variations: [
    v('DELI-1L-CT12', '1 L', 'Carton', 12),
  ] },
  { key: 'TAMP', name: 'Tampico', brand: 'Tampico', category: 'Jus et malts', variations: [
    v('TAMP-1L-P6', '1 L', 'Pack', 6),
  ] },
  { key: 'MM', name: 'Minute Maid', brand: 'Coca-Cola', category: 'Jus et malts', variations: [
    v('MM-1L-P6', '1 L', 'Pack', 6),
  ] },

  // Eaux
  { key: 'AWA', name: 'Awa', brand: 'Awa', category: 'Eaux minérales', variations: [
    v('AWA-50-P12', '50 cl', 'Pack', 12),
    v('AWA-15-P6', '1,5 L', 'Pack', 6),
  ] },
  { key: 'CEL', name: 'Céleste', brand: 'Céleste', category: 'Eaux minérales', variations: [
    v('CEL-50-P12', '50 cl', 'Pack', 12),
    v('CEL-15-P6', '1,5 L', 'Pack', 6),
  ] },
  { key: 'OLG', name: 'Olgane', brand: 'Olgane', category: 'Eaux minérales', variations: [
    v('OLG-15-P6', '1,5 L', 'Pack', 6),
  ] },

  // Energy
  { key: 'XXL', name: 'XXL Energy', brand: 'XXL', category: 'Energy', variations: [
    v('XXL-25-C24', '25 cl', 'Casier', 24),
    v('XXL-50-CT24', '50 cl', 'Carton', 24, 'canettes'),
  ] },
  { key: 'RB', name: 'Red Bull', brand: 'Red Bull', category: 'Energy', variations: [
    v('RB-25-CT24', '25 cl', 'Carton', 24, 'canettes'),
  ] },
]

const CATALOG_BY_KEY = new Map(BEVERAGE_CATALOG.map((p) => [p.key, p]))

export function getCatalogProduct(key: string): CatalogProduct | undefined {
  return CATALOG_BY_KEY.get(key)
}
