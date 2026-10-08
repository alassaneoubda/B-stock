/**
 * File locale des ventes saisies hors ligne — fonctions PURES (testables sans navigateur).
 *
 * Une vente en file :
 * - porte sa clé d'idempotence `id` (UUID généré sur l'appareil), renvoyée à
 *   chaque tentative : le serveur ne crée jamais deux ventes pour une même clé ;
 * - appartient à un compte (`owner` = entreprise:utilisateur) : elle n'est envoyée
 *   qu'avec la session de ce compte ;
 * - est `pending` (à envoyer) ou `rejected` (refusée par le serveur, motif
 *   conservé : « Ventes à vérifier »). Une vente acceptée est retirée de la file.
 *
 * Ordre d'envoi : chronologique (createdAt puis id), une à la fois.
 */

export type OfflineSaleKind = 'pos' | 'sale'
export type OfflineSaleStatus = 'pending' | 'rejected'

export type OfflineLine = {
  variantId: string
  name: string
  quantity: number
  unitPrice: number
}

/** Corps envoyé à POST /api/pos/offline-sales. */
export type PosSalePayload = {
  clientRequestId: string
  depotId: string
  posOrderId?: string | null
  label?: string | null
  paymentMethod: 'cash' | 'mobile_money'
  soldAt: string
  acceptCurrentPrices?: boolean
  items: { variantId: string; quantity: number; unitPrice: number }[]
}

/** Corps envoyé à POST /api/sales (Nouvelle vente). */
export type SalePayload = {
  clientRequestId: string
  offlineSoldAt: string
  clientId: string
  depotId: string
  orderSource?: string
  paymentMethod: 'cash' | 'mobile_money'
  paidAmount: number
  notes?: string
  items: { productVariantId: string; quantity: number; unitPrice: number }[]
  packagingItems?: { packagingTypeId: string; quantityOut: number; quantityIn: number; unitPrice: number }[]
}

export type OfflineSale = {
  id: string
  owner: string
  kind: OfflineSaleKind
  createdAt: string
  status: OfflineSaleStatus
  attempts: number
  /** Erreurs serveur (5xx) consécutives : au-delà d'un seuil, la vente passe « à vérifier ». */
  serverErrors?: number
  lastAttemptAt?: string
  /** Dernière erreur passagère (réseau, serveur indisponible) : la vente reste en attente. */
  lastError?: string
  /** Refus définitif du serveur (stock insuffisant, mois clôturé, prix modifiés…). */
  rejection?: { code: string | null; message: string; status: number; at: string }
  /** Résumé lisible (affichage de la file, ticket). */
  summary: {
    label: string
    depotId: string
    depotName?: string | null
    clientName?: string | null
    paymentMethod: 'cash' | 'mobile_money'
    total: number
    lines: OfflineLine[]
  }
  payload: PosSalePayload | SalePayload
}

export function compareSales(a: OfflineSale, b: OfflineSale): number {
  return a.createdAt === b.createdAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.createdAt < b.createdAt ? -1 : 1
}

/** Ajoute (ou remplace, même clé) une vente ; la file reste triée. */
export function enqueue(queue: OfflineSale[], sale: OfflineSale): OfflineSale[] {
  return [...queue.filter((s) => s.id !== sale.id), sale].sort(compareSales)
}

export function ownedBy(queue: OfflineSale[], owner: string | null | undefined): OfflineSale[] {
  return owner ? queue.filter((s) => s.owner === owner) : []
}

export function pendingSales(queue: OfflineSale[], owner: string): OfflineSale[] {
  return ownedBy(queue, owner).filter((s) => s.status === 'pending').sort(compareSales)
}

export function rejectedSales(queue: OfflineSale[], owner: string): OfflineSale[] {
  return ownedBy(queue, owner).filter((s) => s.status === 'rejected').sort(compareSales)
}

/** Prochaine vente à envoyer (la plus ancienne en attente du compte), ou null. */
export function nextPending(queue: OfflineSale[], owner: string): OfflineSale | null {
  return pendingSales(queue, owner)[0] ?? null
}

/** Vente acceptée par le serveur (ou déjà enregistrée) : retirée de la file. */
export function markSent(queue: OfflineSale[], id: string): OfflineSale[] {
  return queue.filter((s) => s.id !== id)
}

export function markAttemptFailed(
  queue: OfflineSale[],
  id: string,
  message: string,
  options: { serverError?: boolean; at?: string } = {}
): OfflineSale[] {
  const at = options.at ?? new Date().toISOString()
  return queue.map((s) =>
    s.id === id
      ? {
          ...s,
          attempts: s.attempts + 1,
          serverErrors: options.serverError ? (s.serverErrors ?? 0) + 1 : 0,
          lastAttemptAt: at,
          lastError: message,
        }
      : s
  )
}

export function markRejected(
  queue: OfflineSale[],
  id: string,
  rejection: { code?: string | null; message: string; status: number },
  at = new Date().toISOString()
): OfflineSale[] {
  return queue.map((s) =>
    s.id === id
      ? {
          ...s,
          status: 'rejected' as const,
          attempts: s.attempts + 1,
          lastAttemptAt: at,
          lastError: undefined,
          rejection: { code: rejection.code ?? null, message: rejection.message, status: rejection.status, at },
        }
      : s
  )
}

/** « Réessayer » depuis Ventes à vérifier : la vente repart en attente (même clé). */
export function retrySale(queue: OfflineSale[], id: string, patch?: Partial<Pick<OfflineSale, 'payload' | 'summary'>>): OfflineSale[] {
  return queue.map((s) =>
    s.id === id ? { ...s, ...patch, status: 'pending' as const, rejection: undefined, lastError: undefined, serverErrors: 0 } : s
  )
}

/** « Abandonner » : la vente est retirée (elle n'a jamais été enregistrée par le serveur). */
export function discardSale(queue: OfflineSale[], id: string): OfflineSale[] {
  return queue.filter((s) => s.id !== id)
}

/**
 * Correction d'une vente refusée : nouvelles quantités (0 = ligne retirée).
 * Recalcule le total, le montant payé et le corps de la requête.
 */
export function correctSaleLines(sale: OfflineSale, quantities: Record<string, number>): OfflineSale {
  const lines = sale.summary.lines
    .map((l) => ({ ...l, quantity: Math.max(0, Math.floor(quantities[l.variantId] ?? l.quantity)) }))
    .filter((l) => l.quantity > 0)
  const productsTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
  if (sale.kind === 'pos') {
    const payload = sale.payload as PosSalePayload
    return {
      ...sale,
      summary: { ...sale.summary, lines, total: round(productsTotal) },
      payload: {
        ...payload,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
      },
    }
  }
  const payload = sale.payload as SalePayload
  const packagingNet = (payload.packagingItems ?? []).reduce((s, p) => s + (p.quantityOut - p.quantityIn) * p.unitPrice, 0)
  const total = round(Math.max(0, productsTotal + packagingNet))
  return {
    ...sale,
    summary: { ...sale.summary, lines, total },
    payload: {
      ...payload,
      paidAmount: total,
      items: lines.map((l) => ({ productVariantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
    },
  }
}

/** Quantités déjà vendues hors ligne (en attente) par variante, pour un dépôt. */
export function pendingQuantities(queue: OfflineSale[], owner: string, depotId: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of pendingSales(queue, owner)) {
    if (s.summary.depotId !== depotId) continue
    for (const l of s.summary.lines) map.set(l.variantId, (map.get(l.variantId) ?? 0) + l.quantity)
  }
  return map
}

/** Stock affiché hors ligne : stock connu au dernier chargement − ventes en attente − panier en cours. */
export function localAvailable(known: number, pending = 0, inCart = 0): number {
  return Math.max(0, Math.floor(known) - pending - inCart)
}

export type SendOutcome =
  | { type: 'sent' }
  /** Problème passager : la vente reste en attente, on réessaiera. */
  | { type: 'retry'; message: string }
  /** Refus du serveur : la vente passe dans « Ventes à vérifier ». */
  | { type: 'reject'; code: string | null; message: string; status: number }
  /** Session expirée / abonnement : on arrête la synchronisation sans toucher à la file. */
  | { type: 'stop'; message: string }

/** Classe la réponse (ou l'échec réseau, status 0) d'un envoi. */
export function classifyResponse(status: number, body?: { error?: string; code?: string } | null): SendOutcome {
  if (status >= 200 && status < 300) return { type: 'sent' }
  const message = body?.error || (status === 0 ? 'Réseau indisponible' : `Erreur ${status}`)
  if (status === 0 || status === 408 || status === 429 || status >= 500) return { type: 'retry', message }
  if (status === 401) return { type: 'stop', message: 'Session expirée : reconnectez-vous pour envoyer les ventes en attente.' }
  if (status === 402) return { type: 'stop', message: body?.error || 'Abonnement expiré : les ventes restent en attente.' }
  return { type: 'reject', code: body?.code ?? null, message, status }
}

export function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function ownerKey(user: { companyId?: string | null; id?: string | null } | null | undefined): string | null {
  return user?.companyId && user?.id ? `${user.companyId}:${user.id}` : null
}

/** Clé d'idempotence (UUID v4) générée sur l'appareil. */
export function newRequestId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  c.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
