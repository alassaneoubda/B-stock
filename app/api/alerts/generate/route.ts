import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// POST /api/alerts/generate — Generate automatic alerts for the company
export async function POST() {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const companyId = session.user.companyId
        let alertsCreated = 0

        // 1. Low stock alerts
        const lowStockItems = await sql`
            SELECT s.id, s.quantity, s.min_stock_alert,
                   p.name as product_name, pt.name as packaging_name,
                   d.name as depot_name, pv.id as variant_id
            FROM stock s
            JOIN product_variants pv ON s.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN packaging_types pt ON pv.packaging_type_id = pt.id
            JOIN depots d ON s.depot_id = d.id
            WHERE p.company_id = ${companyId}
              AND s.quantity <= s.min_stock_alert
              AND s.min_stock_alert > 0
              AND p.is_active = true
        `

        for (const item of lowStockItems) {
            // Check if an unresolved alert already exists for this item
            const existing = await sql`
                SELECT id FROM alerts
                WHERE company_id = ${companyId}
                  AND alert_type = 'low_stock'
                  AND reference_id = ${item.variant_id}
                  AND is_resolved = false
            `
            if (existing.length === 0) {
                await sql`
                    INSERT INTO alerts (company_id, alert_type, severity, title, message, reference_type, reference_id)
                    VALUES (
                        ${companyId}, 'low_stock',
                        ${item.quantity === 0 ? 'critical' : 'high'},
                        ${`Stock bas : ${item.product_name}`},
                        ${`${item.product_name} (${item.packaging_name}) au dépôt ${item.depot_name} : ${item.quantity} restant(s), seuil d'alerte : ${item.min_stock_alert}`},
                        'product_variant', ${item.variant_id}
                    )
                `
                alertsCreated++
            }
        }

        // Auto-resolve low stock alerts that are no longer low
        await sql`
            UPDATE alerts SET is_resolved = true
            WHERE company_id = ${companyId}
              AND alert_type = 'low_stock'
              AND is_resolved = false
              AND reference_id NOT IN (
                  SELECT pv.id FROM stock s
                  JOIN product_variants pv ON s.product_variant_id = pv.id
                  JOIN products p ON pv.product_id = p.id
                  WHERE p.company_id = ${companyId}
                    AND s.quantity <= s.min_stock_alert
                    AND s.min_stock_alert > 0
              )
        `

        // 2. Expiring stock alerts (within 30 days)
        const expiringItems = await sql`
            SELECT s.id, s.expiry_date, s.lot_number, s.quantity,
                   p.name as product_name, d.name as depot_name,
                   pv.id as variant_id
            FROM stock s
            JOIN product_variants pv ON s.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            JOIN depots d ON s.depot_id = d.id
            WHERE p.company_id = ${companyId}
              AND s.expiry_date IS NOT NULL
              AND s.expiry_date <= NOW() + INTERVAL '30 days'
              AND s.expiry_date >= NOW()
              AND s.quantity > 0
        `

        for (const item of expiringItems) {
            const existing = await sql`
                SELECT id FROM alerts
                WHERE company_id = ${companyId}
                  AND alert_type = 'expiry'
                  AND reference_id = ${item.variant_id}
                  AND is_resolved = false
            `
            if (existing.length === 0) {
                const daysLeft = Math.ceil(
                    (new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                )
                await sql`
                    INSERT INTO alerts (company_id, alert_type, severity, title, message, reference_type, reference_id)
                    VALUES (
                        ${companyId}, 'expiry',
                        ${daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'high' : 'medium'},
                        ${`Expiration proche : ${item.product_name}`},
                        ${`${item.product_name} au dépôt ${item.depot_name} expire dans ${daysLeft} jour(s). Lot : ${item.lot_number || 'N/A'}, Qté : ${item.quantity}`},
                        'product_variant', ${item.variant_id}
                    )
                `
                alertsCreated++
            }
        }

        // 3. Client credit limit exceeded alerts
        const overCreditClients = await sql`
            SELECT c.id, c.name, c.credit_limit,
                   COALESCE(SUM(CASE WHEN ca.account_type = 'product' THEN ABS(ca.balance) ELSE 0 END), 0) as product_debt,
                   COALESCE(SUM(CASE WHEN ca.account_type = 'packaging' THEN ABS(ca.balance) ELSE 0 END), 0) as packaging_debt
            FROM clients c
            LEFT JOIN client_accounts ca ON ca.client_id = c.id AND ca.balance < 0
            WHERE c.company_id = ${companyId}
              AND c.is_active = true
              AND c.credit_limit > 0
            GROUP BY c.id, c.name, c.credit_limit
            HAVING COALESCE(SUM(CASE WHEN ca.account_type = 'product' THEN ABS(ca.balance) ELSE 0 END), 0) > c.credit_limit
        `

        for (const client of overCreditClients) {
            const existing = await sql`
                SELECT id FROM alerts
                WHERE company_id = ${companyId}
                  AND alert_type = 'credit_limit'
                  AND reference_id = ${client.id}
                  AND is_resolved = false
            `
            if (existing.length === 0) {
                await sql`
                    INSERT INTO alerts (company_id, alert_type, severity, title, message, reference_type, reference_id)
                    VALUES (
                        ${companyId}, 'credit_limit', 'high',
                        ${`Crédit dépassé : ${client.name}`},
                        ${`Le client ${client.name} a une dette produit de ${Number(client.product_debt).toLocaleString('fr-FR')} FCFA, dépassant sa limite de ${Number(client.credit_limit).toLocaleString('fr-FR')} FCFA`},
                        'client', ${client.id}
                    )
                `
                alertsCreated++
            }
        }

        // 4. Packaging debt alerts (clients with significant unreturned packaging)
        const packagingDebtClients = await sql`
            SELECT c.id, c.name, c.packaging_credit_limit,
                   ABS(ca.balance) as packaging_debt
            FROM clients c
            JOIN client_accounts ca ON ca.client_id = c.id AND ca.account_type = 'packaging'
            WHERE c.company_id = ${companyId}
              AND c.is_active = true
              AND ca.balance < 0
              AND c.packaging_credit_limit > 0
              AND ABS(ca.balance) > c.packaging_credit_limit
        `

        for (const client of packagingDebtClients) {
            const existing = await sql`
                SELECT id FROM alerts
                WHERE company_id = ${companyId}
                  AND alert_type = 'packaging_debt'
                  AND reference_id = ${client.id}
                  AND is_resolved = false
            `
            if (existing.length === 0) {
                await sql`
                    INSERT INTO alerts (company_id, alert_type, severity, title, message, reference_type, reference_id)
                    VALUES (
                        ${companyId}, 'packaging_debt', 'medium',
                        ${`Emballages non rendus : ${client.name}`},
                        ${`Le client ${client.name} a une dette emballage de ${Number(client.packaging_debt).toLocaleString('fr-FR')} FCFA, dépassant sa limite de ${Number(client.packaging_credit_limit).toLocaleString('fr-FR')} FCFA`},
                        'client', ${client.id}
                    )
                `
                alertsCreated++
            }
        }

        // 5. Overdue payment alerts
        const overdueOrders = await sql`
            SELECT so.id, so.order_number, so.total_amount, so.paid_amount,
                   c.name as client_name, c.payment_terms_days,
                   so.created_at
            FROM sales_orders so
            JOIN clients c ON so.client_id = c.id
            WHERE so.company_id = ${companyId}
              AND so.status != 'cancelled'
              AND so.paid_amount < so.total_amount
              AND c.payment_terms_days > 0
              AND so.created_at + (c.payment_terms_days || ' days')::INTERVAL < NOW()
        `

        for (const order of overdueOrders) {
            const existing = await sql`
                SELECT id FROM alerts
                WHERE company_id = ${companyId}
                  AND alert_type = 'payment_overdue'
                  AND reference_id = ${order.id}
                  AND is_resolved = false
            `
            if (existing.length === 0) {
                const overdue = Number(order.total_amount) - Number(order.paid_amount)
                const daysOverdue = Math.ceil(
                    (Date.now() - new Date(order.created_at).getTime()) / (1000 * 60 * 60 * 24)
                ) - Number(order.payment_terms_days)
                await sql`
                    INSERT INTO alerts (company_id, alert_type, severity, title, message, reference_type, reference_id)
                    VALUES (
                        ${companyId}, 'payment_overdue',
                        ${daysOverdue > 30 ? 'critical' : daysOverdue > 14 ? 'high' : 'medium'},
                        ${`Paiement en retard : ${order.client_name}`},
                        ${`Commande ${order.order_number} — ${order.client_name} : ${overdue.toLocaleString('fr-FR')} FCFA impayés, ${daysOverdue} jour(s) de retard`},
                        'sales_order', ${order.id}
                    )
                `
                alertsCreated++
            }
        }

        return NextResponse.json({
            success: true,
            alertsCreated,
            message: `${alertsCreated} nouvelle(s) alerte(s) générée(s)`,
        })
    } catch (error) {
        console.error('Error generating alerts:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la génération des alertes' },
            { status: 500 }
        )
    }
}
