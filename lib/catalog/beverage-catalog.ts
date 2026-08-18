/**
 * Catalogue boissons Côte d’Ivoire — identités prédéfinies, sans prix.
 * Les prix d’achat / vente sont saisis par chaque dépôt.
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

export const CATALOG_UNITS = [
  'Casier 24',
  'Casier 12',
  'Bouteille',
  'Canette',
  'Pack 6',
  'Pack 12',
  'Carton',
] as const

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number]
export type CatalogBrand = (typeof CATALOG_BRANDS)[number]
export type CatalogUnit = (typeof CATALOG_UNITS)[number]

export type CatalogItem = {
  sku: string
  name: string
  brand: CatalogBrand
  category: CatalogCategory
  baseUnit: CatalogUnit
}

export function unitsPerCase(unit: string): number {
  switch (unit) {
    case 'Casier 24':
      return 24
    case 'Casier 12':
      return 12
    case 'Pack 6':
      return 6
    case 'Pack 12':
      return 12
    default:
      return 1
  }
}

export const BEVERAGE_CATALOG: CatalogItem[] = [
  // Gazeuses
  { sku: 'COCA-33-C24', name: 'Coca-Cola 33cl casier 24', brand: 'Coca-Cola', category: 'Boissons gazeuses', baseUnit: 'Casier 24' },
  { sku: 'COCA-33', name: 'Coca-Cola 33cl', brand: 'Coca-Cola', category: 'Boissons gazeuses', baseUnit: 'Bouteille' },
  { sku: 'COCA-33-CAN', name: 'Coca-Cola 33cl canette', brand: 'Coca-Cola', category: 'Boissons gazeuses', baseUnit: 'Canette' },
  { sku: 'COCA-1L', name: 'Coca-Cola 1L', brand: 'Coca-Cola', category: 'Boissons gazeuses', baseUnit: 'Bouteille' },
  { sku: 'COCAZ-33-C24', name: 'Coca-Cola Zero 33cl casier 24', brand: 'Coca-Cola', category: 'Boissons gazeuses', baseUnit: 'Casier 24' },
  { sku: 'FANTA-33-C24', name: 'Fanta Orange 33cl casier 24', brand: 'Fanta', category: 'Boissons gazeuses', baseUnit: 'Casier 24' },
  { sku: 'FANTA-1L', name: 'Fanta Orange 1L', brand: 'Fanta', category: 'Boissons gazeuses', baseUnit: 'Bouteille' },
  { sku: 'SPR-33-C24', name: 'Sprite 33cl casier 24', brand: 'Sprite', category: 'Boissons gazeuses', baseUnit: 'Casier 24' },
  { sku: 'SPR-1L', name: 'Sprite 1L', brand: 'Sprite', category: 'Boissons gazeuses', baseUnit: 'Bouteille' },
  { sku: 'SCHW-33-C24', name: 'Schweppes Tonic 33cl casier 24', brand: 'Schweppes', category: 'Boissons gazeuses', baseUnit: 'Casier 24' },
  { sku: 'YOUKI-33-C24', name: 'Youki 33cl casier 24', brand: 'Youki', category: 'Boissons gazeuses', baseUnit: 'Casier 24' },
  { sku: 'YOUKIA-33-C24', name: 'Youki Ananas 33cl casier 24', brand: 'Youki', category: 'Boissons gazeuses', baseUnit: 'Casier 24' },

  // Bières
  { sku: 'FLAG-60-C12', name: 'Flag Spéciale 60cl casier 12', brand: 'Solibra', category: 'Bières', baseUnit: 'Casier 12' },
  { sku: 'FLAG-33-C24', name: 'Flag Spéciale 33cl casier 24', brand: 'Solibra', category: 'Bières', baseUnit: 'Casier 24' },
  { sku: 'FLAG-60', name: 'Flag Spéciale 60cl', brand: 'Solibra', category: 'Bières', baseUnit: 'Bouteille' },
  { sku: 'FLAGP-60-C12', name: 'Flag Pils 60cl casier 12', brand: 'Solibra', category: 'Bières', baseUnit: 'Casier 12' },
  { sku: 'BEAU-60-C12', name: 'Beaufort 60cl casier 12', brand: 'Solibra', category: 'Bières', baseUnit: 'Casier 12' },
  { sku: 'BOCK-60-C12', name: 'Bock 60cl casier 12', brand: 'Solibra', category: 'Bières', baseUnit: 'Casier 12' },
  { sku: 'BOCK-100-C12', name: 'Bock 100cl casier 12', brand: 'Solibra', category: 'Bières', baseUnit: 'Casier 12' },
  { sku: 'BOCK-100', name: 'Bock 100cl', brand: 'Solibra', category: 'Bières', baseUnit: 'Bouteille' },
  { sku: 'CAST-65-C12', name: 'Castel Beer 65cl casier 12', brand: 'Castel', category: 'Bières', baseUnit: 'Casier 12' },
  { sku: 'CAST-65', name: 'Castel Beer 65cl', brand: 'Castel', category: 'Bières', baseUnit: 'Bouteille' },
  { sku: 'IVOI-60-C12', name: 'Ivoire 60cl casier 12', brand: 'Brassivoire', category: 'Bières', baseUnit: 'Casier 12' },
  { sku: 'AWOO-60-C12', name: 'Awooyo 60cl casier 12', brand: 'Brassivoire', category: 'Bières', baseUnit: 'Casier 12' },
  { sku: 'DOPP-65-C12', name: 'Doppel Munich 65cl casier 12', brand: 'Brassivoire', category: 'Bières', baseUnit: 'Casier 12' },
  { sku: 'HEIN-33-C24', name: 'Heineken 33cl casier 24', brand: 'Heineken', category: 'Bières', baseUnit: 'Casier 24' },
  { sku: 'HEIN-65', name: 'Heineken 65cl', brand: 'Heineken', category: 'Bières', baseUnit: 'Bouteille' },
  { sku: 'DESP-33-C24', name: 'Desperados 33cl casier 24', brand: 'Heineken', category: 'Bières', baseUnit: 'Casier 24' },
  { sku: 'GUI-33-C24', name: 'Guinness 33cl casier 24', brand: 'Guinness', category: 'Bières', baseUnit: 'Casier 24' },
  { sku: 'GUI-60-C12', name: 'Guinness 60cl casier 12', brand: 'Guinness', category: 'Bières', baseUnit: 'Casier 12' },

  // Vins
  { sku: 'VALP-100-C12', name: 'Valpierre 100cl casier 12', brand: 'Valpierre', category: 'Vins', baseUnit: 'Casier 12' },
  { sku: 'VALP-100', name: 'Valpierre 100cl', brand: 'Valpierre', category: 'Vins', baseUnit: 'Bouteille' },
  { sku: 'VALP-50-C12', name: 'Valpierre 50cl casier 12', brand: 'Valpierre', category: 'Vins', baseUnit: 'Casier 12' },
  { sku: 'VALP-50', name: 'Valpierre 50cl', brand: 'Valpierre', category: 'Vins', baseUnit: 'Bouteille' },

  // Jus et malts
  { sku: 'MALTA-33-C24', name: 'Malta Guinness 33cl casier 24', brand: 'Guinness', category: 'Jus et malts', baseUnit: 'Casier 24' },
  { sku: 'DELI-1L-CT', name: 'Délifruit Cocktail carton', brand: 'Délifruit', category: 'Jus et malts', baseUnit: 'Carton' },
  { sku: 'DELI-1L', name: 'Délifruit Cocktail 1L', brand: 'Délifruit', category: 'Jus et malts', baseUnit: 'Bouteille' },
  { sku: 'TAMP-1L', name: 'Tampico 1L', brand: 'Tampico', category: 'Jus et malts', baseUnit: 'Bouteille' },
  { sku: 'MM-1L', name: 'Minute Maid 1L', brand: 'Coca-Cola', category: 'Jus et malts', baseUnit: 'Bouteille' },

  // Eaux
  { sku: 'AWA-15-P6', name: 'Awa 1,5L pack 6', brand: 'Awa', category: 'Eaux minérales', baseUnit: 'Pack 6' },
  { sku: 'AWA-50-P12', name: 'Awa 50cl pack 12', brand: 'Awa', category: 'Eaux minérales', baseUnit: 'Pack 12' },
  { sku: 'AWA-15', name: 'Awa 1,5L', brand: 'Awa', category: 'Eaux minérales', baseUnit: 'Bouteille' },
  { sku: 'CEL-15-P6', name: 'Céleste 1,5L pack 6', brand: 'Céleste', category: 'Eaux minérales', baseUnit: 'Pack 6' },
  { sku: 'CEL-50-P12', name: 'Céleste 50cl pack 12', brand: 'Céleste', category: 'Eaux minérales', baseUnit: 'Pack 12' },
  { sku: 'OLG-15-P6', name: 'Olgane 1,5L pack 6', brand: 'Olgane', category: 'Eaux minérales', baseUnit: 'Pack 6' },

  // Energy
  { sku: 'XXL-50', name: 'XXL Energy 50cl', brand: 'XXL', category: 'Energy', baseUnit: 'Canette' },
  { sku: 'XXL-25-C24', name: 'XXL Energy 25cl casier 24', brand: 'XXL', category: 'Energy', baseUnit: 'Casier 24' },
  { sku: 'RB-25', name: 'Red Bull 25cl', brand: 'Red Bull', category: 'Energy', baseUnit: 'Canette' },
]

const CATALOG_BY_SKU = new Map(BEVERAGE_CATALOG.map((item) => [item.sku, item]))

export function getCatalogItem(sku: string): CatalogItem | undefined {
  return CATALOG_BY_SKU.get(sku)
}
