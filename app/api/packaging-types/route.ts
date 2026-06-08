import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { sql } from '@/lib/db'

export async function GET() {
    try {
        const authz = await requirePermission('packaging.read')
        if (!authz.ok) return authz.response
        const { session } = authz

        const packagingTypes = await sql`
      SELECT * FROM packaging_types 
      WHERE company_id = ${session.user.companyId}
      ORDER BY name ASC
    `

        return NextResponse.json({ success: true, data: packagingTypes })
    } catch (error) {
        console.error('Error fetching packaging types:', error)
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
    }
}
