/**
 * Libellés et liens partagés par les écrans Mobile Money (utilisable côté
 * navigateur : aucun import serveur).
 */

export type MobileMoneyTone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

export const MOBILE_MONEY_STATUS: Record<string, { label: string; tone: MobileMoneyTone }> = {
  creating: { label: 'En création', tone: 'default' },
  pending: { label: 'En attente', tone: 'warning' },
  paid: { label: 'Payé', tone: 'success' },
  failed: { label: 'Échoué', tone: 'danger' },
  expired: { label: 'Expiré', tone: 'default' },
  cancelled: { label: 'Annulé', tone: 'default' },
}

export const PROVIDER_METHOD_LABELS: Record<string, string> = {
  wave: 'Wave',
  orange_money: 'Orange Money',
  orange: 'Orange Money',
  mtn_money: 'MTN MoMo',
  mtn: 'MTN MoMo',
  momo: 'MTN MoMo',
  moov_money: 'Moov Money',
  moov: 'Moov Money',
}

export function providerMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null
  return PROVIDER_METHOD_LABELS[method.toLowerCase()] ?? method
}

function fcfa(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(amount))} FCFA`
}

/** Message prérempli envoyé au client. */
export function paymentMessage(input: {
  clientName?: string | null
  companyName?: string | null
  description?: string | null
  amount: number
  url: string
}): string {
  const hello = input.clientName ? `Bonjour ${input.clientName},` : 'Bonjour,'
  const from = input.companyName ? ` à ${input.companyName}` : ''
  const what = input.description ? ` (${input.description})` : ''
  return (
    `${hello} voici votre lien pour régler ${fcfa(input.amount)}${from}${what} par Mobile Money ` +
    `(Wave, Orange Money, MTN MoMo, Moov) :\n${input.url}\nMerci !`
  )
}

/**
 * Lien WhatsApp « cliquer pour discuter » avec message prérempli.
 * Sans numéro : WhatsApp propose de choisir le destinataire.
 */
export function whatsappLink(phone: string | null | undefined, message: string): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const normalized = digits.length === 10 ? `225${digits}` : digits
  const base = normalized.length >= 8 ? `https://wa.me/${normalized}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(message)}`
}
