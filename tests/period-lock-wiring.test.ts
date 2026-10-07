import { describe, expect, it } from 'vitest'
import { actAs, json, req } from './route-helpers'
import { sql } from '@/lib/db'
import { createTenant } from './helpers'
import * as credits from '@/app/api/credits/route'
import * as cashMovements from '@/app/api/cash/movements/route'
import * as cashClose from '@/app/api/cash/close/route'

/** Clôture le mois en cours pour l'entreprise (comme après un export comptable). */
async function lockCurrentMonth(companyId: string) {
  await sql`
    INSERT INTO accounting_period_locks (company_id, period_start)
    VALUES (${companyId}, date_trunc('month', CURRENT_DATE)::date)
    ON CONFLICT DO NOTHING
  `
}

describe('Mois clôturé : opérations de trésorerie et créances refusées', () => {
  it('créance manuelle, mouvement de caisse et clôture de caisse → 409 PERIOD_LOCKED', async () => {
    const t = await createTenant()
    actAs(t)
    await sql`
      INSERT INTO cash_sessions (company_id, depot_id, opened_by, opening_amount, status)
      VALUES (${t.companyId}, ${t.depotId}, ${t.userId}, 10000, 'open')
    `
    await lockCurrentMonth(t.companyId)

    const credit = await json(await credits.POST(req('POST', {
      client_id: t.clientId, total_amount: 5000,
    })))
    expect(credit.status).toBe(409)
    expect(credit.body.code).toBe('PERIOD_LOCKED')

    const movement = await json(await cashMovements.POST(req('POST', {
      movement_type: 'cash_in', category: 'deposit', amount: 2000, description: 'Apport',
    })))
    expect(movement.status).toBe(409)

    const close = await json(await cashClose.POST(req('POST', { closing_amount: 10000 })))
    expect(close.status).toBe(409)
  })
})
