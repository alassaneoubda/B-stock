import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'
import { isUuid } from '@/lib/tenant'

const remindSchema = z.object({
  reminder_type: z.enum(['call', 'sms', 'whatsapp', 'email', 'visit', 'other']).optional().default('call'),
  message: z.string().max(2000).optional().nullable(),
})

// POST /api/credits/[id]/remind — Log a reminder for a credit note
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authz = await requirePermission('credits.write')
    if (!authz.ok) return authz.response
    const { companyId, userId } = authz

    const creditId = (await params).id
    if (!isUuid(creditId)) throw notFound('Créance')
    const data = remindSchema.parse(await request.json())

    // INSERT ... SELECT : la créance doit appartenir à l'entreprise
    const result = await sql`
      INSERT INTO credit_reminders (credit_note_id, reminder_type, message, sent_by)
      SELECT cn.id, ${data.reminder_type}, ${data.message || null}, ${userId}
      FROM credit_notes cn
      WHERE cn.id = ${creditId} AND cn.company_id = ${companyId}
      RETURNING *
    `
    if (result.length === 0) throw notFound('Créance')

    return NextResponse.json({ success: true, data: result[0] })
  } catch (error) {
    return handleRouteError(error, 'credits.remind')
  }
}
