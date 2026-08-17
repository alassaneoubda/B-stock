import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/api-auth'
import { sql } from '@/lib/db'

const onboardingSchema = z.object({
  companyName: z.string().min(2, "Le nom de l'entreprise est requis"),
  sector: z.string().optional(),
  phone: z.string().optional(),
})

// POST /api/onboarding — Finalize a freshly provisioned (e.g. Google) company
export async function POST(request: NextRequest) {
  try {
    const authz = await requireAuth({ skipSubscriptionCheck: true })
    if (!authz.ok) return authz.response
    const { session, companyId } = authz

    // Only the owner can set up the company identity
    if (session.user.role !== 'owner') {
      return NextResponse.json({ error: 'Accès propriétaire requis' }, { status: 403 })
    }

    const body = await request.json()
    const data = onboardingSchema.parse(body)

    const slug =
      data.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Date.now().toString(36)

    const companies = await sql`
      UPDATE companies SET
        name = ${data.companyName},
        slug = ${slug},
        sector = COALESCE(${data.sector ?? null}, sector),
        phone = COALESCE(${data.phone ?? null}, phone),
        onboarding_completed = true,
        updated_at = NOW()
      WHERE id = ${companyId}
      RETURNING name
    `

    if (companies.length === 0) {
      return NextResponse.json({ error: 'Entreprise introuvable' }, { status: 404 })
    }

    return NextResponse.json({ success: true, companyName: companies[0].name })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      )
    }
    console.error('Onboarding error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
