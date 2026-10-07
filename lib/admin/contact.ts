/**
 * Liens de contact client (back-office) : téléphone, WhatsApp, email.
 * Module sans dépendance serveur.
 */

/**
 * Numéro au format international (chiffres seuls) pour wa.me.
 * Côte d'Ivoire : numéro national à 10 chiffres commençant par 0 → préfixe 225
 * (le 0 fait partie du numéro depuis 2021 : 07 01 02 03 04 → 2250701020304).
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (phone.trim().startsWith('00')) digits = digits.replace(/^00/, '')
  if (!digits) return null
  if (digits.length === 10 && digits.startsWith('0')) return `225${digits}`
  if (digits.length < 8) return null
  return digits
}

export function whatsAppLink(phone: string | null | undefined, message: string): string | null {
  const number = toWhatsAppNumber(phone)
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null
}

export function telLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  const cleaned = phone.replace(/[^\d+]/g, '')
  return cleaned ? `tel:${cleaned}` : null
}

export function mailtoLink(email: string | null | undefined, subject: string, body: string): string | null {
  if (!email) return null
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Message (français) proposé pour relancer un essai qui se termine. */
export function trialEndingMessage(opts: { ownerName?: string | null; companyName: string; daysLeft: number }): string {
  const hello = opts.ownerName ? `Bonjour ${opts.ownerName},` : 'Bonjour,'
  const when =
    opts.daysLeft < 0
      ? `s'est terminé il y a ${Math.abs(opts.daysLeft)} jour${Math.abs(opts.daysLeft) > 1 ? 's' : ''}`
      : opts.daysLeft === 0
        ? "se termine aujourd'hui"
        : `se termine dans ${opts.daysLeft} jour${opts.daysLeft > 1 ? 's' : ''}`
  return (
    `${hello} c'est l'équipe B-Stock. La période d'essai de ${opts.companyName} ${when}. ` +
    `Avez-vous besoin d'aide pour bien démarrer ou pour choisir votre abonnement ? ` +
    `Nous pouvons en parler quand vous voulez.`
  )
}
