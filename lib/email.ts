/**
 * Envoi d'emails transactionnels via l'API REST de Resend (aucune dépendance).
 * Variables : RESEND_API_KEY, EMAIL_FROM (ex. « B-Stock <notifications@b-stock.ci> »).
 * Sans configuration, rien n'est envoyé et l'appelant reçoit { sent: false } :
 * chaque fonctionnalité prévoit un repli (lien à copier, notification in-app…).
 */

export type EmailResult = { sent: true; id: string } | { sent: false; reason: string }

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<EmailResult> {
  if (!isEmailConfigured()) return { sent: false, reason: 'not_configured' }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error('[email] envoi refusé', res.status, body)
      return { sent: false, reason: `provider_${res.status}` }
    }
    const json = (await res.json()) as { id?: string }
    return { sent: true, id: json.id ?? '' }
  } catch (e) {
    console.error('[email] envoi impossible', e)
    return { sent: false, reason: 'network' }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/**
 * Gabarit unique des emails (sobre, lisible sur mobile, sans image externe).
 * `paragraphs` sont du texte brut (échappé) ; `cta` optionnel.
 */
export function renderEmail(input: {
  title: string
  paragraphs: string[]
  cta?: { label: string; url: string }
  footer?: string
}): { html: string; text: string } {
  const p = input.paragraphs.map((t) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(t)}</p>`).join('')
  const button = input.cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(input.cta.url)}" style="background:#F58233;color:#1C1917;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;display:inline-block">${escapeHtml(input.cta.label)}</a></p>`
    : ''
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#FAF9F7;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1E2433">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
<p style="font-weight:700;font-size:18px;margin:0 0 24px">B-Stock</p>
<div style="background:#ffffff;border:1px solid #E8E5E0;border-radius:12px;padding:28px">
<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(input.title)}</h1>${p}${button}
</div>
<p style="font-size:12px;color:#6B6660;margin:20px 0 0">${escapeHtml(input.footer ?? 'Vous recevez cet email car vous utilisez B-Stock.')}</p>
</div></body></html>`
  const text = [input.title, '', ...input.paragraphs, input.cta ? `\n${input.cta.label} : ${input.cta.url}` : '', '', input.footer ?? ''].join('\n')
  return { html, text }
}

/** URL publique de l'application. */
export function appUrl(path = ''): string {
  return `${(process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '')}${path}`
}
