import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

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
