import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// POST /api/init-db — Initialize database (OWNER ONLY, dev environment)
export async function POST() {
    try {
        // Only allow in development
        if (process.env.NODE_ENV === 'production') {
            return NextResponse.json(
                { error: 'This endpoint is disabled in production' },
                { status: 403 }
            )
        }

        // Require authentication with owner role
        const session = await auth()
        if (!session?.user || session.user.role !== 'owner') {
            return NextResponse.json(
                { error: 'Non autorisé. Accès propriétaire requis.' },
                { status: 403 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Database initialization must be done via migration scripts. Run: psql $DATABASE_URL -f scripts/001-create-tables.sql',
        })
    } catch (error) {
        console.error('Init DB error:', error)
        return NextResponse.json(
            { error: 'Erreur lors de l\'initialisation' },
            { status: 500 }
        )
    }
}

// Block GET requests entirely
export async function GET() {
    return NextResponse.json(
        { error: 'Method not allowed' },
        { status: 405 }
    )
}
