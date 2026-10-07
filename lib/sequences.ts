import type { Tx } from './db'

/**
 * Numérotation des documents, séquentielle et propre à chaque entreprise.
 * L'incrément est atomique (INSERT ... ON CONFLICT DO UPDATE ... RETURNING) :
 * deux requêtes simultanées obtiennent toujours deux numéros différents.
 * À appeler dans la même transaction que l'insertion du document, pour qu'un
 * ROLLBACK ne consomme pas de numéro.
 */
export const DOCUMENT_TYPES = {
  sale: { prefix: 'VNT', digits: 6 },
  purchase: { prefix: 'ACH', digits: 6 },
  credit: { prefix: 'CR', digits: 5 },
  credit_note: { prefix: 'AV', digits: 5 },
  transfer: { prefix: 'TRF', digits: 5 },
  return: { prefix: 'RET', digits: 5 },
  inventory: { prefix: 'INV', digits: 5 },
  invoice_client: { prefix: 'FC', digits: 6 },
  invoice_supplier: { prefix: 'FF', digits: 6 },
  pos_ticket: { prefix: 'T', digits: 6 },
  supplier_payment: { prefix: 'RF', digits: 6 },
} as const

export type DocumentType = keyof typeof DOCUMENT_TYPES

export async function nextDocumentNumber(
  tx: Tx,
  companyId: string,
  type: DocumentType
): Promise<string> {
  const [row] = await tx.sql<{ last_value: string }>`
    INSERT INTO document_sequences (company_id, doc_type, last_value)
    VALUES (${companyId}, ${type}, 1)
    ON CONFLICT (company_id, doc_type)
    DO UPDATE SET last_value = document_sequences.last_value + 1, updated_at = NOW()
    RETURNING last_value
  `
  const { prefix, digits } = DOCUMENT_TYPES[type]
  return `${prefix}-${String(row.last_value).padStart(digits, '0')}`
}
