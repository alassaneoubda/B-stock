/**
 * Plan de comptes de l'export comptable — valeurs par défaut SYSCOHADA
 * (Acte uniforme OHADA relatif au droit comptable, système comptable révisé
 * en vigueur depuis 2018).
 *
 * Chaque entreprise peut surcharger n'importe quel compte (table
 * accounting_settings) ; seules les valeurs modifiées sont stockées, si bien
 * qu'une clé ajoutée plus tard reçoit automatiquement sa valeur par défaut.
 *
 * Choix documentés :
 *  - Consignes d'emballages reçues des clients : 4194 « Clients, dettes pour
 *    emballages et matériels consignés ». La consigne facturée au client est
 *    une DETTE de l'entreprise (elle devra la rembourser au retour des vides) :
 *    elle est portée au crédit du 4194, jamais en chiffre d'affaires (701).
 *  - Consignes versées aux fournisseurs (emballages à rendre) : 4094
 *    « Fournisseurs, créances pour emballages et matériels à rendre » —
 *    utilisé pour les lignes « emballage » des factures fournisseurs manuelles.
 *  - Mobile Money (Orange Money, MTN MoMo, Wave, Moov) : compte de trésorerie
 *    dédié. Le SYSCOHADA n'a pas de compte normalisé : 5211 (sous-compte de
 *    521 « Banques locales ») est la pratique la plus courante ; certains
 *    cabinets préfèrent 585 ou 57x — d'où le paramétrage.
 *  - Avoirs / retours clients : 709 « Rabais, remises et ristournes accordés
 *    par l'entreprise ».
 *  - TVA (entreprise assujettie, cf. lib/vat.ts) : 4431 « État, TVA facturée sur
 *    ventes » (TVA collectée, au crédit à la vente, au débit sur les avoirs) et
 *    4452 « État, TVA récupérable sur achats » (achats portant une TVA).
 *  - Montants sans affectation certaine (encaissement sans mode de paiement,
 *    créance saisie à la main, mouvement de caisse « autre ») : 471
 *    « Débiteurs et créditeurs divers » (compte d'attente à ventiler par le
 *    comptable) — signalés dans le contrôle avant export.
 */

export type AccountKey =
  | 'sales'
  | 'services'
  | 'sales_returns'
  | 'clients'
  | 'suppliers'
  | 'purchases'
  | 'purchases_services'
  | 'cash'
  | 'bank'
  | 'mobile_money'
  | 'packaging_clients'
  | 'packaging_suppliers'
  | 'suspense'
  | 'vat_collected'
  | 'vat_deductible'
  | 'transfers'
  | 'cash_over'
  | 'cash_short'
  | 'expense_fuel'
  | 'expense_maintenance'
  | 'expense_salary'
  | 'expense_rent'
  | 'expense_utilities'
  | 'expense_supplies'
  | 'expense_transport'
  | 'expense_other'

export type AccountDefinition = {
  key: AccountKey
  /** Numéro SYSCOHADA par défaut. */
  number: string
  /** Libellé affiché dans l'écran de paramétrage. */
  label: string
  /** Groupe d'affichage. */
  group: 'tiers' | 'ventes' | 'achats' | 'tresorerie' | 'consignes' | 'fiscal' | 'charges' | 'divers'
  help?: string
}

export const ACCOUNT_DEFINITIONS: AccountDefinition[] = [
  // Tiers
  { key: 'clients', number: '411', label: 'Clients', group: 'tiers' },
  { key: 'suppliers', number: '401', label: 'Fournisseurs', group: 'tiers' },
  // Ventes
  { key: 'sales', number: '701', label: 'Ventes de marchandises', group: 'ventes' },
  { key: 'services', number: '706', label: 'Services vendus (factures manuelles)', group: 'ventes' },
  {
    key: 'sales_returns',
    number: '709',
    label: 'Rabais, remises et ristournes accordés (avoirs, retours)',
    group: 'ventes',
  },
  // Achats
  { key: 'purchases', number: '601', label: 'Achats de marchandises', group: 'achats' },
  {
    key: 'purchases_services',
    number: '605',
    label: 'Autres achats (lignes « service » des factures fournisseurs)',
    group: 'achats',
  },
  // Trésorerie
  { key: 'cash', number: '571', label: 'Caisse', group: 'tresorerie' },
  { key: 'bank', number: '521', label: 'Banque (virements, chèques)', group: 'tresorerie' },
  {
    key: 'mobile_money',
    number: '5211',
    label: 'Mobile Money (Orange Money, MTN, Wave, Moov)',
    group: 'tresorerie',
    help: 'Compte de trésorerie dédié, sans numéro normalisé : adaptez-le à la pratique de votre cabinet.',
  },
  { key: 'transfers', number: '585', label: 'Virements de fonds (dépôts / retraits de caisse)', group: 'tresorerie' },
  // Consignes
  {
    key: 'packaging_clients',
    number: '4194',
    label: 'Clients, dettes pour emballages consignés',
    group: 'consignes',
    help: 'Consignes facturées aux clients : dette envers le client, remboursable au retour des vides.',
  },
  {
    key: 'packaging_suppliers',
    number: '4094',
    label: 'Fournisseurs, créances pour emballages à rendre',
    group: 'consignes',
  },
  // TVA
  {
    key: 'vat_collected',
    number: '4431',
    label: 'État, TVA facturée sur ventes (TVA collectée)',
    group: 'fiscal',
    help: 'Utilisé uniquement si l’entreprise est assujettie à la TVA.',
  },
  {
    key: 'vat_deductible',
    number: '4452',
    label: 'État, TVA récupérable sur achats',
    group: 'fiscal',
    help: 'Achats saisis avec un taux de TVA (prix d’achat hors taxe).',
  },
  // Charges (dépenses de caisse, par catégorie)
  { key: 'expense_fuel', number: '6053', label: 'Dépenses — Carburant (autres énergies)', group: 'charges' },
  { key: 'expense_maintenance', number: '624', label: 'Dépenses — Entretien et réparations', group: 'charges' },
  { key: 'expense_salary', number: '661', label: 'Dépenses — Salaires', group: 'charges' },
  { key: 'expense_rent', number: '622', label: 'Dépenses — Loyers', group: 'charges' },
  { key: 'expense_utilities', number: '605', label: 'Dépenses — Eau, électricité, téléphone', group: 'charges' },
  { key: 'expense_supplies', number: '604', label: 'Dépenses — Fournitures', group: 'charges' },
  { key: 'expense_transport', number: '618', label: 'Dépenses — Transport', group: 'charges' },
  { key: 'expense_other', number: '658', label: 'Dépenses — Autres (charges diverses)', group: 'charges' },
  // Divers
  { key: 'suspense', number: '471', label: "Compte d'attente (débiteurs et créditeurs divers)", group: 'divers' },
  { key: 'cash_over', number: '758', label: 'Excédents de caisse (produits divers)', group: 'divers' },
  { key: 'cash_short', number: '658', label: 'Manquants de caisse (charges diverses)', group: 'divers' },
]

export const ACCOUNT_GROUP_LABELS: Record<AccountDefinition['group'], string> = {
  tiers: 'Comptes de tiers',
  ventes: 'Ventes',
  achats: 'Achats',
  tresorerie: 'Trésorerie',
  consignes: 'Consignes d’emballages',
  fiscal: 'TVA',
  charges: 'Charges (dépenses par catégorie)',
  divers: 'Divers',
}

export const DEFAULT_ACCOUNTS: Record<AccountKey, string> = Object.fromEntries(
  ACCOUNT_DEFINITIONS.map((a) => [a.key, a.number])
) as Record<AccountKey, string>

export const ACCOUNT_KEYS = ACCOUNT_DEFINITIONS.map((a) => a.key)

/** Catégories de dépenses de B-Stock → compte de charge. */
export const EXPENSE_CATEGORY_ACCOUNT: Record<string, AccountKey> = {
  fuel: 'expense_fuel',
  maintenance: 'expense_maintenance',
  salary: 'expense_salary',
  rent: 'expense_rent',
  utilities: 'expense_utilities',
  supplies: 'expense_supplies',
  transport: 'expense_transport',
  other: 'expense_other',
}

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  fuel: 'Carburant',
  maintenance: 'Entretien',
  salary: 'Salaires',
  rent: 'Loyer',
  utilities: 'Eau / électricité',
  supplies: 'Fournitures',
  transport: 'Transport',
  other: 'Autres',
}

// ---------------------------------------------------------------------------
// Journaux
// ---------------------------------------------------------------------------

export type JournalKey = 'VT' | 'AC' | 'CA' | 'BQ' | 'MM' | 'OD'

export const JOURNAL_KEYS: JournalKey[] = ['VT', 'AC', 'CA', 'BQ', 'MM', 'OD']

export const JOURNAL_LABELS: Record<JournalKey, string> = {
  VT: 'Ventes',
  AC: 'Achats',
  CA: 'Caisse',
  BQ: 'Banque',
  MM: 'Mobile Money',
  OD: 'Opérations diverses (consignes, avoirs)',
}

export const DEFAULT_JOURNALS: Record<JournalKey, string> = {
  VT: 'VT',
  AC: 'AC',
  CA: 'CA',
  BQ: 'BQ',
  MM: 'MM',
  OD: 'OD',
}

// ---------------------------------------------------------------------------
// Formats de fichier (détail dans formats.ts — ce module reste importable côté client)
// ---------------------------------------------------------------------------

export type ExportFormat = 'csv' | 'sage'

export const EXPORT_FORMATS: { value: ExportFormat; label: string; description: string }[] = [
  {
    value: 'csv',
    label: 'CSV générique (Excel)',
    description: 'UTF-8 avec BOM, séparateur « ; », décimales à virgule.',
  },
  {
    value: 'sage',
    label: 'Sage 100 Comptabilité',
    description: 'Import paramétrable : journal, date JJMMAA, pièce, compte, tiers, libellé (35 car.), débit, crédit.',
  },
]

// ---------------------------------------------------------------------------
// Paramètres complets
// ---------------------------------------------------------------------------

export type AccountingSettings = {
  accounts: Record<AccountKey, string>
  journals: Record<JournalKey, string>
  useAuxiliary: boolean
  clientAuxPrefix: string
  supplierAuxPrefix: string
}

export const DEFAULT_SETTINGS: AccountingSettings = {
  accounts: { ...DEFAULT_ACCOUNTS },
  journals: { ...DEFAULT_JOURNALS },
  useAuxiliary: true,
  clientAuxPrefix: 'C',
  supplierAuxPrefix: 'F',
}

/** Numéro de compte valide : 2 à 13 chiffres (longueur max d'un compte Sage 100). */
export const ACCOUNT_NUMBER_RE = /^[0-9]{2,13}$/
/** Code journal : 1 à 6 caractères alphanumériques majuscules. */
export const JOURNAL_CODE_RE = /^[A-Z0-9]{1,6}$/
/** Code auxiliaire : 1 à 17 caractères (longueur max d'un compte tiers Sage 100). */
export const AUX_CODE_RE = /^[A-Z0-9]{1,17}$/

/** Fusionne les surcharges stockées avec les valeurs par défaut (clés inconnues ignorées). */
export function mergeSettings(row?: {
  accounts?: Record<string, unknown> | null
  journals?: Record<string, unknown> | null
  use_auxiliary?: boolean | null
  client_aux_prefix?: string | null
  supplier_aux_prefix?: string | null
} | null): AccountingSettings {
  const accounts = { ...DEFAULT_ACCOUNTS }
  for (const key of ACCOUNT_KEYS) {
    const v = row?.accounts?.[key]
    if (typeof v === 'string' && ACCOUNT_NUMBER_RE.test(v)) accounts[key] = v
  }
  const journals = { ...DEFAULT_JOURNALS }
  for (const key of JOURNAL_KEYS) {
    const v = row?.journals?.[key]
    if (typeof v === 'string' && JOURNAL_CODE_RE.test(v)) journals[key] = v
  }
  return {
    accounts,
    journals,
    useAuxiliary: row?.use_auxiliary ?? DEFAULT_SETTINGS.useAuxiliary,
    clientAuxPrefix: row?.client_aux_prefix ?? DEFAULT_SETTINGS.clientAuxPrefix,
    supplierAuxPrefix: row?.supplier_aux_prefix ?? DEFAULT_SETTINGS.supplierAuxPrefix,
  }
}

/** Surcharges à stocker : uniquement ce qui diffère des valeurs par défaut. */
export function settingsOverrides(settings: AccountingSettings): {
  accounts: Partial<Record<AccountKey, string>>
  journals: Partial<Record<JournalKey, string>>
} {
  const accounts: Partial<Record<AccountKey, string>> = {}
  for (const key of ACCOUNT_KEYS) {
    if (settings.accounts[key] !== DEFAULT_ACCOUNTS[key]) accounts[key] = settings.accounts[key]
  }
  const journals: Partial<Record<JournalKey, string>> = {}
  for (const key of JOURNAL_KEYS) {
    if (settings.journals[key] !== DEFAULT_JOURNALS[key]) journals[key] = settings.journals[key]
  }
  return { accounts, journals }
}

/** Diacritiques (U+0300 à U+036F) laissés par la normalisation NFD. */
export const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g')

/** Texte sans accents (« Dépôt » → « Depot »). */
export function stripAccents(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '')
}

/**
 * Code auxiliaire dérivé du nom (« Maquis Le Baobab » → « MAQUISLEBA »),
 * utilisé quand aucun code n'a été saisi. Les doublons sont suffixés
 * (voir `buildAuxiliaryCodes`).
 */
export function slugAuxiliary(name: string, max = 10): string {
  const s = (name || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  return (s || 'TIERS').slice(0, max)
}

/**
 * Codes auxiliaires stables d'une liste de tiers (triés par date de création
 * puis id par l'appelant) : code saisi s'il existe, sinon préfixe + nom
 * normalisé, suffixé 2, 3… en cas de doublon (le plus ancien garde le code nu).
 */
export function buildAuxiliaryCodes(
  entities: { id: string; name: string; code?: string | null }[],
  prefix: string
): Map<string, string> {
  const result = new Map<string, string>()
  const used = new Set<string>()
  // Les codes saisis sont réservés en premier
  for (const e of entities) {
    if (e.code) {
      result.set(e.id, e.code)
      used.add(e.code)
    }
  }
  for (const e of entities) {
    if (result.has(e.id)) continue
    const base = (prefix + slugAuxiliary(e.name)).slice(0, 15)
    let code = base
    for (let n = 2; used.has(code); n++) code = `${base}${n}`
    result.set(e.id, code)
    used.add(code)
  }
  return result
}
