'use client'

import { createStore, del, get, keys, set, update, type UseStore } from 'idb-keyval'
import type { PosCatalogItem, PosTable } from '@/components/pos/types'
import type { OfflineSale } from './queue'

/**
 * Stockage local (IndexedDB, via idb-keyval) des données nécessaires pour vendre
 * sans réseau. Strict nécessaire, rafraîchi à chaque chargement en ligne :
 * - catalogue de vente par dépôt (produits, prix, stock connu), tables du POS ;
 * - clients récents (nom, téléphone, zone, plafond) pour « Nouvelle vente » ;
 * - file des ventes en attente d'envoi.
 *
 * Sécurité (appareil partagé) : tout est rattaché à un compte (`owner`). À la
 * déconnexion ou quand un autre compte se connecte, le cache est effacé
 * (voir components/pwa/offline-data-guard.tsx). Les ventes en attente d'un
 * compte sont conservées jusqu'à leur envoi par CE compte (sinon elles seraient
 * perdues), mais ne sont jamais affichées ni envoyées pour un autre compte.
 * Aucun jeton, mot de passe ni cookie n'est stocké ici.
 */

const DB_NAME = 'bstock-offline'
let storeRef: UseStore | null = null
function store(): UseStore {
  if (!storeRef) storeRef = createStore(DB_NAME, 'kv')
  return storeRef
}

export function offlineStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

const QUEUE_KEY = 'queue'
const META_KEY = 'meta'

export type OfflineMeta = {
  owner: string
  userName?: string | null
  companyName?: string | null
  updatedAt: string
}

export type PosSnapshot = {
  savedAt: string
  depotId: string
  depots: { id: string; name: string; is_main: boolean }[]
  tables: PosTable[]
  catalog: PosCatalogItem[]
}

export type SaleVariant = {
  id: string
  product_id: string
  product_name: string
  volume: string | null
  selling_price: number
  available_stock: number
  depot_id: string
}

export type SaleClient = {
  id: string
  name: string
  phone: string | null
  zone: string | null
  client_type?: string
  credit_limit: number
  packaging_credit_limit: number
  product_balance: number
  packaging_balance: number
}

export type SalePackaging = { id: string; name: string; deposit_price: number; is_returnable?: boolean }

// ---------------------------------------------------------------------------
// Notifications entre composants et entre onglets
// ---------------------------------------------------------------------------

const CHANGE_EVENT = 'bstock-offline-change'
let channel: BroadcastChannel | null = null
function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel('bstock-offline')
  return channel
}

export function notifyChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CHANGE_EVENT))
  getChannel()?.postMessage('change')
}

export function onOfflineChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const ch = getChannel()
  const onMsg = () => cb()
  window.addEventListener(CHANGE_EVENT, cb)
  ch?.addEventListener('message', onMsg)
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb)
    ch?.removeEventListener('message', onMsg)
  }
}

// ---------------------------------------------------------------------------
// Propriétaire du cache
// ---------------------------------------------------------------------------

export async function getMeta(): Promise<OfflineMeta | null> {
  if (!offlineStorageAvailable()) return null
  return (await get<OfflineMeta>(META_KEY, store()).catch(() => undefined)) ?? null
}

/**
 * Rattache le cache au compte connecté. Si un AUTRE compte l'occupait, ses
 * données (catalogue, clients) sont effacées avant toute écriture.
 */
export async function claimOwner(owner: string, info: { userName?: string | null; companyName?: string | null } = {}) {
  if (!offlineStorageAvailable()) return
  const meta = await getMeta()
  if (meta && meta.owner !== owner) await clearCachedData()
  await set(META_KEY, { owner, ...info, updatedAt: new Date().toISOString() } satisfies OfflineMeta, store())
}

/** Efface tout sauf la file des ventes en attente (qui n'est jamais perdue). */
export async function clearCachedData() {
  if (!offlineStorageAvailable()) return
  const all = await keys(store()).catch(() => [] as IDBValidKey[])
  await Promise.all(all.filter((k) => k !== QUEUE_KEY).map((k) => del(k, store())))
  notifyChange()
}

async function ownedValue<T>(owner: string, key: string): Promise<T | null> {
  if (!offlineStorageAvailable()) return null
  const meta = await getMeta()
  if (!meta || meta.owner !== owner) return null
  return (await get<T>(key, store()).catch(() => undefined)) ?? null
}

async function ownedSet(owner: string, key: string, value: unknown) {
  if (!offlineStorageAvailable()) return
  const meta = await getMeta()
  if (!meta || meta.owner !== owner) return
  await set(key, value, store()).catch(() => {})
}

// ---------------------------------------------------------------------------
// Point de vente
// ---------------------------------------------------------------------------

export async function savePosSnapshot(owner: string, snapshot: Omit<PosSnapshot, 'savedAt'>) {
  // Strict nécessaire : pas de tickets ouverts, pas de noms de serveurs
  const catalog = snapshot.catalog.map((c) => ({
    variant_id: c.variant_id,
    product_id: c.product_id,
    product_name: c.product_name,
    category: c.category,
    brand: c.brand,
    packaging_name: c.packaging_name,
    price: c.price,
    stock: c.stock,
    reserved: c.reserved,
    available: c.available,
    openable: 0,
  }))
  const tables = snapshot.tables.map((t) => ({ id: t.id, name: t.name, area: t.area, seats: t.seats, sort_order: t.sort_order }))
  await ownedSet(owner, `pos:${snapshot.depotId}`, { ...snapshot, catalog, tables, savedAt: new Date().toISOString() })
  await ownedSet(owner, 'pos:last', snapshot.depotId)
}

export async function loadPosSnapshot(owner: string, depotId?: string | null): Promise<PosSnapshot | null> {
  const id = depotId || (await ownedValue<string>(owner, 'pos:last'))
  if (!id) return null
  return ownedValue<PosSnapshot>(owner, `pos:${id}`)
}

// ---------------------------------------------------------------------------
// Nouvelle vente
// ---------------------------------------------------------------------------

export async function saveSaleDepots(owner: string, depots: { id: string; name: string; is_main?: boolean }[]) {
  await ownedSet(owner, 'sale:depots', depots.map((d) => ({ id: d.id, name: d.name, is_main: Boolean(d.is_main) })))
}
export async function loadSaleDepots(owner: string) {
  return ownedValue<{ id: string; name: string; is_main: boolean }[]>(owner, 'sale:depots')
}

export async function saveSaleCatalog(owner: string, depotId: string, variants: SaleVariant[]) {
  await ownedSet(owner, `sale:catalog:${depotId}`, { savedAt: new Date().toISOString(), variants })
}
export async function loadSaleCatalog(owner: string, depotId: string) {
  return ownedValue<{ savedAt: string; variants: SaleVariant[] }>(owner, `sale:catalog:${depotId}`)
}

const MAX_CLIENTS = 300
/** Ajoute des clients au cache des clients récents (les derniers vus en tête). */
export async function rememberClients(owner: string, clients: SaleClient[]) {
  if (clients.length === 0) return
  const current = (await ownedValue<SaleClient[]>(owner, 'sale:clients')) ?? []
  const slim = clients.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone ?? null,
    zone: c.zone ?? null,
    client_type: c.client_type,
    credit_limit: Number(c.credit_limit || 0),
    packaging_credit_limit: Number(c.packaging_credit_limit || 0),
    product_balance: Number(c.product_balance || 0),
    packaging_balance: Number(c.packaging_balance || 0),
  }))
  const ids = new Set(slim.map((c) => c.id))
  await ownedSet(owner, 'sale:clients', [...slim, ...current.filter((c) => !ids.has(c.id))].slice(0, MAX_CLIENTS))
}
export async function loadClients(owner: string) {
  return (await ownedValue<SaleClient[]>(owner, 'sale:clients')) ?? []
}

export async function savePackaging(owner: string, types: SalePackaging[]) {
  await ownedSet(owner, 'sale:packaging', types.map((t) => ({ id: t.id, name: t.name, deposit_price: Number(t.deposit_price || 0), is_returnable: t.is_returnable })))
}
export async function loadPackaging(owner: string) {
  return (await ownedValue<SalePackaging[]>(owner, 'sale:packaging')) ?? []
}

// ---------------------------------------------------------------------------
// File des ventes (mise à jour atomique : une transaction IndexedDB par update)
// ---------------------------------------------------------------------------

export async function readQueue(): Promise<OfflineSale[]> {
  if (!offlineStorageAvailable()) return []
  return (await get<OfflineSale[]>(QUEUE_KEY, store()).catch(() => undefined)) ?? []
}

export async function updateQueue(fn: (queue: OfflineSale[]) => OfflineSale[]): Promise<OfflineSale[]> {
  if (!offlineStorageAvailable()) throw new Error('Stockage local indisponible sur ce navigateur')
  let result: OfflineSale[] = []
  await update<OfflineSale[]>(
    QUEUE_KEY,
    (current) => {
      result = fn(current ?? [])
      return result
    },
    store()
  )
  notifyChange()
  return result
}
