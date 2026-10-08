import { z } from 'zod'
import { JOURNAL_KEYS, type JournalKey } from './chart'
import { generateEntries, type AccountingResult } from './entries'
import { loadAccountingSettings, loadAccountingSource, loadAuxiliaryCodes } from './source'
import { badRequest } from '../errors'

/** Paramètres d'un export : période (incluse), journaux, format. */
export const exportQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de début invalide (AAAA-MM-JJ)'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de fin invalide (AAAA-MM-JJ)'),
    journals: z
      .string()
      .optional()
      .transform((v) =>
        (v ? v.split(',') : JOURNAL_KEYS).map((j) => j.trim().toUpperCase()).filter((j): j is JournalKey =>
          (JOURNAL_KEYS as string[]).includes(j)
        )
      ),
    format: z.enum(['csv', 'sage']).optional().default('csv'),
  })
  .superRefine((d, ctx) => {
    const from = Date.parse(d.from)
    const to = Date.parse(d.to)
    if (Number.isNaN(from) || Number.isNaN(to)) {
      ctx.addIssue({ code: 'custom', message: 'Période invalide', path: ['from'] })
      return
    }
    if (to < from) ctx.addIssue({ code: 'custom', message: 'La date de fin précède la date de début', path: ['to'] })
    if (to - from > 366 * 86_400_000) {
      ctx.addIssue({ code: 'custom', message: 'Période limitée à un an', path: ['to'] })
    }
  })

export type ExportQuery = z.infer<typeof exportQuerySchema>

export function parseExportQuery(searchParams: URLSearchParams): ExportQuery {
  const parsed = exportQuerySchema.safeParse({
    from: searchParams.get('from') ?? '',
    to: searchParams.get('to') ?? '',
    journals: searchParams.get('journals') ?? undefined,
    format: searchParams.get('format') ?? undefined,
  })
  if (!parsed.success) {
    throw badRequest(parsed.error.issues[0]?.message ?? 'Paramètres invalides')
  }
  if (parsed.data.journals.length === 0) throw badRequest('Choisissez au moins un journal')
  return parsed.data
}

/** Charge les documents de la période et produit écritures + contrôle. */
export async function buildAccountingExport(
  companyId: string,
  query: Pick<ExportQuery, 'from' | 'to' | 'journals'>
): Promise<AccountingResult> {
  const settings = await loadAccountingSettings(companyId)
  const [aux, source] = await Promise.all([
    settings.useAuxiliary ? loadAuxiliaryCodes(companyId, settings) : Promise.resolve(null),
    loadAccountingSource(companyId, query.from, query.to),
  ])
  return generateEntries(source, settings, {
    journals: query.journals,
    clientCodes: aux ? new Map(aux.clients.map((c) => [c.id, c.code])) : undefined,
    supplierCodes: aux ? new Map(aux.suppliers.map((s) => [s.id, s.code])) : undefined,
  })
}
