import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOwner } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { badRequest, handleRouteError } from '@/lib/errors'
import {
  ACCOUNT_KEYS,
  ACCOUNT_NUMBER_RE,
  DEFAULT_SETTINGS,
  JOURNAL_CODE_RE,
  JOURNAL_KEYS,
  settingsOverrides,
  type AccountKey,
  type AccountingSettings,
  type JournalKey,
} from '@/lib/accounting/chart'
import { loadAccountingSettings } from '@/lib/accounting/source'

// GET /api/accounting/settings — plan de comptes de l'entreprise (valeurs SYSCOHADA par défaut)
export async function GET() {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    const settings = await loadAccountingSettings(authz.companyId)
    return NextResponse.json({ success: true, data: { settings, defaults: DEFAULT_SETTINGS } })
  } catch (error) {
    return handleRouteError(error, 'accounting.settings.get')
  }
}

const accountNumber = z
  .string()
  .trim()
  .regex(ACCOUNT_NUMBER_RE, 'Numéro de compte invalide (2 à 13 chiffres)')
const journalCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(JOURNAL_CODE_RE, 'Code journal invalide (1 à 6 lettres ou chiffres)')
const prefix = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{0,6}$/, 'Préfixe invalide (6 lettres ou chiffres au plus)')

const settingsSchema = z.object({
  accounts: z.record(z.string(), accountNumber),
  journals: z.record(z.string(), journalCode),
  useAuxiliary: z.boolean(),
  clientAuxPrefix: prefix,
  supplierAuxPrefix: prefix,
})

// PUT /api/accounting/settings — enregistre le plan de comptes (propriétaire uniquement)
export async function PUT(request: NextRequest) {
  try {
    const authz = await requireOwner()
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const data = settingsSchema.parse(await request.json())
    const settings: AccountingSettings = {
      accounts: { ...DEFAULT_SETTINGS.accounts },
      journals: { ...DEFAULT_SETTINGS.journals },
      useAuxiliary: data.useAuxiliary,
      clientAuxPrefix: data.clientAuxPrefix,
      supplierAuxPrefix: data.supplierAuxPrefix,
    }
    for (const key of ACCOUNT_KEYS) {
      if (data.accounts[key]) settings.accounts[key as AccountKey] = data.accounts[key]
    }
    for (const key of JOURNAL_KEYS) {
      if (data.journals[key]) settings.journals[key as JournalKey] = data.journals[key]
    }
    const codes = JOURNAL_KEYS.map((k) => settings.journals[k])
    if (new Set(codes).size !== codes.length) {
      throw badRequest('Deux journaux ne peuvent pas avoir le même code')
    }
    if (settings.useAuxiliary && settings.clientAuxPrefix && settings.clientAuxPrefix === settings.supplierAuxPrefix) {
      throw badRequest('Les préfixes clients et fournisseurs doivent être différents')
    }

    const overrides = settingsOverrides(settings)
    await sql`
      INSERT INTO accounting_settings (
        company_id, accounts, journals, use_auxiliary, client_aux_prefix, supplier_aux_prefix, updated_by, updated_at
      ) VALUES (
        ${companyId}, ${JSON.stringify(overrides.accounts)}::jsonb, ${JSON.stringify(overrides.journals)}::jsonb,
        ${settings.useAuxiliary}, ${settings.clientAuxPrefix}, ${settings.supplierAuxPrefix}, ${userId}, NOW()
      )
      ON CONFLICT (company_id) DO UPDATE SET
        accounts = EXCLUDED.accounts,
        journals = EXCLUDED.journals,
        use_auxiliary = EXCLUDED.use_auxiliary,
        client_aux_prefix = EXCLUDED.client_aux_prefix,
        supplier_aux_prefix = EXCLUDED.supplier_aux_prefix,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `
    await sql`
      INSERT INTO audit_logs (company_id, user_id, action, entity_type, details)
      VALUES (${companyId}, ${userId}, 'update', 'accounting_settings', ${JSON.stringify(overrides)}::jsonb)
    `
    return NextResponse.json({ success: true, data: { settings }, message: 'Plan de comptes enregistré' })
  } catch (error) {
    return handleRouteError(error, 'accounting.settings.put')
  }
}
