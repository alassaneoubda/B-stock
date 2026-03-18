import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'

// GET /api/packaging/stock — List packaging stock with depot info
export async function GET(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.companyId) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const depotId = searchParams.get('depotId')

        let stock
        if (depotId) {
            stock = await sql`
        SELECT ps.*, pt.name as packaging_name, pt.units_per_case,
               pt.is_returnable, pt.deposit_price, d.name as depot_name
        FROM packaging_stock ps
        JOIN packaging_types pt ON ps.packaging_type_id = pt.id
        JOIN depots d ON ps.depot_id = d.id
        WHERE d.company_id = ${session.user.companyId}
          AND ps.depot_id = ${depotId}
        ORDER BY pt.name
      `
        } else {
            stock = await sql`
        SELECT ps.*, pt.name as packaging_name, pt.units_per_case,
               pt.is_returnable, pt.deposit_price, d.name as depot_name
        FROM packaging_stock ps
        JOIN packaging_types pt ON ps.packaging_type_id = pt.id
        JOIN depots d ON ps.depot_id = d.id
        WHERE d.company_id = ${session.user.companyId}
        ORDER BY d.name, pt.name
      `
        }

        return NextResponse.json({ success: true, data: stock })
    } catch (error) {
        console.error('Error fetching packaging stock:', error)
        return NextResponse.json(
            { error: 'Erreur lors de la récupération du stock emballages' },
            { status: 500 }
        )
    }
}
