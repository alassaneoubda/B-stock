import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { badRequest, handleRouteError, notFound } from '@/lib/errors'
import { assertOwned, isUuid } from '@/lib/tenant'

/**
 * Export « PDF » (HTML imprimable servi en ligne sur l'origine de l'app).
 *
 * SÉCURITÉ : toutes les valeurs dynamiques (noms de clients, téléphones,
 * adresses, produits, notes, nom de l'entreprise, nombres…) passent par
 * `h()` (échappement HTML) — sans cela, un nom de client contenant du HTML
 * devenait un XSS stocké exécuté sur l'origine de l'application. La réponse
 * porte en plus une CSP interdisant tout script.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
}

/** Échappe une valeur quelconque pour une insertion dans du HTML (texte ou attribut entre guillemets). */
function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[&<>"'`]/g, (c) => HTML_ESCAPES[c])
}
const h = escapeHtml

const EXPORT_TYPES = ['invoice', 'delivery_note', 'inventory', 'stock', 'cash_report'] as const
type ExportType = (typeof EXPORT_TYPES)[number]
const TYPES_WITH_ID: ExportType[] = ['invoice', 'delivery_note', 'inventory', 'cash_report']

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; script-src 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'private, no-store',
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'decimal', minimumFractionDigits: 0 }).format(amount) + ' FCFA'
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Nom de fichier sûr pour Content-Disposition (ASCII lettres, chiffres, - et _). */
function safeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80) || 'export'
}

function generateHTMLHeader(title: string, companyName: string, subtitle?: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 40px; color: #1a1a1a; font-size: 12px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #111; padding-bottom: 15px; }
  .company { font-size: 18px; font-weight: bold; }
  .doc-title { font-size: 22px; font-weight: bold; text-align: right; }
  .doc-subtitle { font-size: 12px; color: #666; text-align: right; }
  .section { margin: 20px 0; }
  .section-title { font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th { background: #f5f5f5; padding: 8px 10px; text-align: left; font-size: 11px; font-weight: 600; border-bottom: 2px solid #ddd; }
  td { padding: 7px 10px; border-bottom: 1px solid #eee; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .total-row td { font-weight: bold; border-top: 2px solid #333; background: #fafafa; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 15px 0; }
  .info-box { background: #f9f9f9; padding: 12px; border-radius: 4px; }
  .info-label { font-size: 10px; text-transform: uppercase; color: #888; margin-bottom: 3px; }
  .info-value { font-size: 13px; font-weight: 600; }
  .footer { margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddd; font-size: 10px; color: #888; text-align: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-red { background: #fef2f2; color: #991b1b; }
  .badge-yellow { background: #fefce8; color: #854d0e; }
  @media print { body { margin: 20px; } }
</style></head><body>
<div class="header">
  <div><div class="company">${h(companyName)}</div><div style="font-size:11px;color:#666;">Gestion de Distribution</div></div>
  <div><div class="doc-title">${h(title)}</div>${subtitle ? `<div class="doc-subtitle">${h(subtitle)}</div>` : ''}<div class="doc-subtitle">Généré le ${h(formatDate(new Date()))}</div></div>
</div>`
}

// GET /api/export/pdf?type=invoice|delivery_note|inventory|stock|cash_report&id=xxx
export async function GET(request: NextRequest) {
  try {
    const authz = await requirePermission('reports.export')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const { searchParams } = new URL(request.url)
    const rawType = searchParams.get('type')
    const id = searchParams.get('id')

    if (!rawType || !(EXPORT_TYPES as readonly string[]).includes(rawType)) {
      throw badRequest("Type d'export invalide. Types: invoice, delivery_note, inventory, stock, cash_report")
    }
    const type = rawType as ExportType
    if (TYPES_WITH_ID.includes(type)) {
      if (!id) throw badRequest('ID requis')
      if (!isUuid(id)) throw notFound('Document')
    }

    const companies = await sql`SELECT name FROM companies WHERE id = ${companyId}`
    const companyName = String(companies[0]?.name ?? '')

    let html = ''

    switch (type) {
      case 'invoice': {
        const orders = await sql`
          SELECT so.*, c.name AS client_name, c.phone AS client_phone, c.address AS client_address, d.name AS depot_name
          FROM sales_orders so
          LEFT JOIN clients c ON so.client_id = c.id AND c.company_id = so.company_id
          LEFT JOIN depots d ON so.depot_id = d.id AND d.company_id = so.company_id
          WHERE so.id = ${id} AND so.company_id = ${companyId}
        `
        if (orders.length === 0) throw notFound('Commande')
        const order = orders[0]

        const items = await sql`
          SELECT soi.*, p.name AS product_name, pt.name AS packaging_name
          FROM sales_order_items soi
          LEFT JOIN product_variants pv ON soi.product_variant_id = pv.id
          LEFT JOIN products p ON pv.product_id = p.id
          LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
          WHERE soi.sales_order_id = ${id}
        `

        html = generateHTMLHeader('FACTURE', companyName, `N° ${order.order_number ?? ''}`)
        html += `<div class="info-grid">
          <div class="info-box"><div class="info-label">Client</div><div class="info-value">${h(order.client_name || 'Client comptoir')}</div><div>${h(order.client_phone)}</div><div>${h(order.client_address)}</div></div>
          <div class="info-box"><div class="info-label">Détails</div><div>Date: ${h(formatDate(order.created_at))}</div><div>Dépôt: ${h(order.depot_name || '-')}</div><div>Paiement: ${h(order.payment_method || '-')}</div></div>
        </div>`
        html += `<table><thead><tr><th>Produit</th><th>Format</th><th class="text-center">Qté</th><th class="text-right">P.U.</th><th class="text-right">Remise</th><th class="text-right">Total</th></tr></thead><tbody>`
        for (const item of items) {
          const discount = Number(item.discount_amount || 0)
          html += `<tr><td>${h(item.product_name)}</td><td>${h(item.packaging_name || '-')}</td><td class="text-center">${h(item.quantity)}</td><td class="text-right">${h(formatCurrency(Number(item.unit_price)))}</td><td class="text-right">${discount > 0 ? '-' + h(formatCurrency(discount)) : '-'}</td><td class="text-right">${h(formatCurrency(Number(item.total_price)))}</td></tr>`
        }
        const discountTotal = Number(order.discount_amount || 0)
        const remaining = Number(order.total_amount) - Number(order.paid_amount)
        html += `</tbody></table>`
        html += `<div style="margin-top:15px;text-align:right;">
          <div>Sous-total: ${h(formatCurrency(Number(order.subtotal || order.total_amount)))}</div>
          ${discountTotal > 0 ? `<div style="color:#991b1b;">Remise: -${h(formatCurrency(discountTotal))}</div>` : ''}
          <div style="font-size:16px;font-weight:bold;margin-top:5px;">Total: ${h(formatCurrency(Number(order.total_amount)))}</div>
          <div style="color:#166534;">Payé: ${h(formatCurrency(Number(order.paid_amount)))}</div>
          ${remaining > 0 ? `<div style="color:#991b1b;font-weight:bold;">Reste: ${h(formatCurrency(remaining))}</div>` : ''}
        </div>`
        break
      }

      case 'delivery_note': {
        const orders = await sql`
          SELECT so.*, c.name AS client_name, c.phone AS client_phone, c.address AS client_address, d.name AS depot_name
          FROM sales_orders so
          LEFT JOIN clients c ON so.client_id = c.id AND c.company_id = so.company_id
          LEFT JOIN depots d ON so.depot_id = d.id AND d.company_id = so.company_id
          WHERE so.id = ${id} AND so.company_id = ${companyId}
        `
        if (orders.length === 0) throw notFound('Commande')
        const order = orders[0]

        const items = await sql`
          SELECT soi.*, p.name AS product_name, pt.name AS packaging_name
          FROM sales_order_items soi
          LEFT JOIN product_variants pv ON soi.product_variant_id = pv.id
          LEFT JOIN products p ON pv.product_id = p.id
          LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
          WHERE soi.sales_order_id = ${id}
        `

        const pkgItems = await sql`
          SELECT sopi.*, pt.name AS packaging_name
          FROM sales_order_packaging_items sopi
          LEFT JOIN packaging_types pt ON sopi.packaging_type_id = pt.id
          WHERE sopi.sales_order_id = ${id}
        `

        html = generateHTMLHeader('BON DE LIVRAISON', companyName, `Commande ${order.order_number ?? ''}`)
        html += `<div class="info-grid">
          <div class="info-box"><div class="info-label">Client</div><div class="info-value">${h(order.client_name || 'Client comptoir')}</div><div>${h(order.client_phone)}</div><div>${h(order.client_address)}</div></div>
          <div class="info-box"><div class="info-label">Livraison</div><div>Date: ${h(formatDate(order.created_at))}</div><div>Dépôt: ${h(order.depot_name || '-')}</div></div>
        </div>`
        html += `<div class="section"><div class="section-title">Produits</div><table><thead><tr><th>Produit</th><th>Format</th><th class="text-center">Quantité</th></tr></thead><tbody>`
        for (const item of items) {
          html += `<tr><td>${h(item.product_name)}</td><td>${h(item.packaging_name || '-')}</td><td class="text-center">${h(item.quantity)}</td></tr>`
        }
        html += `</tbody></table></div>`
        if (pkgItems.length > 0) {
          html += `<div class="section"><div class="section-title">Emballages</div><table><thead><tr><th>Type</th><th class="text-center">Sortie</th><th class="text-center">Retour</th></tr></thead><tbody>`
          for (const item of pkgItems) {
            html += `<tr><td>${h(item.packaging_name)}</td><td class="text-center">${h(item.quantity_out)}</td><td class="text-center">${h(item.quantity_in)}</td></tr>`
          }
          html += `</tbody></table></div>`
        }
        html += `<div style="margin-top:40px;display:flex;justify-content:space-between;"><div style="border-top:1px solid #333;width:200px;padding-top:5px;text-align:center;">Signature livreur</div><div style="border-top:1px solid #333;width:200px;padding-top:5px;text-align:center;">Signature client</div></div>`
        break
      }

      case 'inventory': {
        const sessions = await sql`
          SELECT is2.*, d.name AS depot_name, u.full_name AS started_by_name
          FROM inventory_sessions is2
          LEFT JOIN depots d ON is2.depot_id = d.id AND d.company_id = is2.company_id
          LEFT JOIN users u ON is2.started_by = u.id AND u.company_id = is2.company_id
          WHERE is2.id = ${id} AND is2.company_id = ${companyId}
        `
        if (sessions.length === 0) throw notFound('Inventaire')
        const inv = sessions[0]

        const items = await sql`
          SELECT ii.*, p.name AS product_name, pt.name AS packaging_name, ptv.name AS variant_packaging
          FROM inventory_items ii
          LEFT JOIN product_variants pv ON ii.product_variant_id = pv.id
          LEFT JOIN products p ON pv.product_id = p.id
          LEFT JOIN packaging_types ptv ON pv.packaging_type_id = ptv.id
          LEFT JOIN packaging_types pt ON ii.packaging_type_id = pt.id
          WHERE ii.inventory_session_id = ${id}
          ORDER BY ii.item_type, p.name
        `

        html = generateHTMLHeader("RAPPORT D'INVENTAIRE", companyName, `${inv.session_number ?? ''} — ${inv.depot_name ?? ''}`)
        html += `<div class="info-grid">
          <div class="info-box"><div class="info-label">Dépôt</div><div class="info-value">${h(inv.depot_name)}</div></div>
          <div class="info-box"><div class="info-label">Réalisé par</div><div class="info-value">${h(inv.started_by_name)}</div><div>Le ${h(formatDate(inv.started_at))}</div></div>
        </div>`
        html += `<table><thead><tr><th>Article</th><th>Type</th><th class="text-center">Stock système</th><th class="text-center">Compté</th><th class="text-center">Écart</th><th class="text-right">Valeur écart</th></tr></thead><tbody>`
        for (const item of items) {
          const name = item.product_name ? `${item.product_name} ${item.variant_packaging || ''}` : item.packaging_name
          const counted = item.counted_quantity != null
          const variance = Number(item.counted_quantity || 0) - Number(item.system_quantity)
          const cls = variance < 0 ? 'style="color:#991b1b;"' : variance > 0 ? 'style="color:#166534;"' : ''
          html += `<tr><td>${h(name)}</td><td>${item.item_type === 'product' ? 'Produit' : 'Emballage'}</td><td class="text-center">${h(item.system_quantity)}</td><td class="text-center">${counted ? h(item.counted_quantity) : '-'}</td><td class="text-center" ${cls}>${counted ? h((variance > 0 ? '+' : '') + variance) : '-'}</td><td class="text-right" ${cls}>${counted ? h(formatCurrency(Number(item.variance_value || 0))) : '-'}</td></tr>`
        }
        html += `<tr class="total-row"><td colspan="5">Total écarts</td><td class="text-right">${h(formatCurrency(Number(inv.total_variance_value || 0)))}</td></tr></tbody></table>`
        break
      }

      case 'stock': {
        const depotId = searchParams.get('depot_id') || null
        if (depotId) await assertOwned(sql, companyId, { depots: [depotId] })

        const stockItems = await sql`
          SELECT s.quantity, s.min_stock_alert,
            p.name AS product_name, p.category, p.brand,
            pt.name AS packaging_name,
            pv.price, pv.cost_price,
            d.name AS depot_name
          FROM stock s
          JOIN product_variants pv ON s.product_variant_id = pv.id
          JOIN products p ON pv.product_id = p.id AND p.company_id = ${companyId}
          LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
          JOIN depots d ON s.depot_id = d.id
          WHERE d.company_id = ${companyId}
            AND (${depotId}::uuid IS NULL OR s.depot_id = ${depotId}::uuid)
          ORDER BY d.name, p.name
        `

        html = generateHTMLHeader('ÉTAT DU STOCK', companyName)
        html += `<table><thead><tr><th>Dépôt</th><th>Produit</th><th>Format</th><th>Marque</th><th class="text-center">Quantité</th><th class="text-center">Seuil alerte</th><th class="text-right">Valeur</th></tr></thead><tbody>`
        let totalValue = 0
        for (const item of stockItems) {
          const value = Number(item.quantity) * Number(item.cost_price || item.price)
          totalValue += value
          const isLow = Number(item.quantity) <= Number(item.min_stock_alert)
          html += `<tr><td>${h(item.depot_name)}</td><td>${h(item.product_name)}</td><td>${h(item.packaging_name || '-')}</td><td>${h(item.brand || '-')}</td><td class="text-center" ${isLow ? 'style="color:#991b1b;font-weight:bold;"' : ''}>${h(item.quantity)}</td><td class="text-center">${h(item.min_stock_alert)}</td><td class="text-right">${h(formatCurrency(value))}</td></tr>`
        }
        html += `<tr class="total-row"><td colspan="6">Valeur totale du stock</td><td class="text-right">${h(formatCurrency(totalValue))}</td></tr></tbody></table>`
        break
      }

      case 'cash_report': {
        const sessions = await sql`
          SELECT cs.*, ou.full_name AS opened_by_name, cu.full_name AS closed_by_name, d.name AS depot_name
          FROM cash_sessions cs
          LEFT JOIN users ou ON cs.opened_by = ou.id AND ou.company_id = cs.company_id
          LEFT JOIN users cu ON cs.closed_by = cu.id AND cu.company_id = cs.company_id
          LEFT JOIN depots d ON cs.depot_id = d.id AND d.company_id = cs.company_id
          WHERE cs.id = ${id} AND cs.company_id = ${companyId}
        `
        if (sessions.length === 0) throw notFound('Session')
        const cs = sessions[0]

        const movements = await sql`
          SELECT cm.*, u.full_name AS created_by_name
          FROM cash_movements cm
          LEFT JOIN users u ON cm.created_by = u.id AND u.company_id = ${companyId}
          WHERE cm.cash_session_id = ${id}
          ORDER BY cm.created_at ASC
        `

        html = generateHTMLHeader('RAPPORT DE CAISSE', companyName, `Session du ${formatDate(cs.opened_at)}`)
        html += `<div class="info-grid">
          <div class="info-box"><div class="info-label">Ouverture</div><div class="info-value">${h(formatCurrency(Number(cs.opening_amount)))}</div><div>Par ${h(cs.opened_by_name)} le ${h(formatDate(cs.opened_at))}</div></div>
          <div class="info-box"><div class="info-label">Clôture</div><div class="info-value">${cs.closing_amount != null ? h(formatCurrency(Number(cs.closing_amount))) : 'En cours'}</div>${cs.closed_by_name ? `<div>Par ${h(cs.closed_by_name)} le ${h(formatDate(cs.closed_at))}</div>` : ''}</div>
        </div>`
        html += `<div class="info-grid">
          <div class="info-box"><div class="info-label">Total entrées</div><div class="info-value" style="color:#166534;">${h(formatCurrency(Number(cs.total_cash_in)))}</div></div>
          <div class="info-box"><div class="info-label">Total sorties</div><div class="info-value" style="color:#991b1b;">${h(formatCurrency(Number(cs.total_cash_out)))}</div></div>
        </div>`
        if (cs.variance != null) {
          const varianceNum = Number(cs.variance)
          const varianceColor = varianceNum < 0 ? '#991b1b' : varianceNum > 0 ? '#166534' : '#333'
          html += `<div class="info-grid">
            <div class="info-box"><div class="info-label">Montant attendu</div><div class="info-value">${h(formatCurrency(Number(cs.expected_amount)))}</div></div>
            <div class="info-box"><div class="info-label">Écart</div><div class="info-value" style="color:${varianceColor};">${varianceNum > 0 ? '+' : ''}${h(formatCurrency(varianceNum))}</div></div>
          </div>`
        }
        html += `<div class="section"><div class="section-title">Mouvements</div><table><thead><tr><th>Heure</th><th>Type</th><th>Catégorie</th><th>Description</th><th>Par</th><th class="text-right">Montant</th></tr></thead><tbody>`
        for (const m of movements) {
          const isIn = m.movement_type === 'cash_in'
          const time = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          html += `<tr><td>${h(time)}</td><td><span class="badge ${isIn ? 'badge-green' : 'badge-red'}">${isIn ? 'Entrée' : 'Sortie'}</span></td><td>${h(m.category)}</td><td>${h(m.description || '-')}</td><td>${h(m.created_by_name || '-')}</td><td class="text-right" style="color:${isIn ? '#166534' : '#991b1b'};">${isIn ? '+' : '-'}${h(formatCurrency(Number(m.amount)))}</td></tr>`
        }
        html += `</tbody></table></div>`
        break
      }
    }

    html += `<div class="footer">Document généré par B-Stock — ${h(companyName)} — ${h(formatDate(new Date()))}</div></body></html>`

    await sql`
      INSERT INTO audit_logs (company_id, user_id, action, entity_type, entity_id, details)
      VALUES (${companyId}, ${userId}, 'export', ${type}, ${id && isUuid(id) ? id : null}, ${JSON.stringify({ format: 'pdf' })}::jsonb)
    `

    const filename = `${safeFilenamePart(type)}-${safeFilenamePart(id || 'export')}.html`
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${filename}"`,
        ...SECURITY_HEADERS,
      },
    })
  } catch (error) {
    return handleRouteError(error, 'export.pdf')
  }
}
