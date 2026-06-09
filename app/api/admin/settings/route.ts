import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin, logAdminAction } from '@/lib/admin-auth'
import { getSettings, updateSettings } from '@/lib/settings'

const schema = z.object({
  platform_name: z.string().min(1).max(100).optional(),
  support_email: z.string().email().or(z.literal('')).optional(),
  support_phone: z.string().max(40).optional(),
  default_currency: z.string().min(2).max(10).optional(),
  default_timezone: z.string().min(2).max(60).optional(),
  trial_days: z.number().int().min(0).max(365).optional(),
  registrations_open: z.boolean().optional(),
  google_oauth_enabled: z.boolean().optional(),
  maintenance_mode: z.boolean().optional(),
  maintenance_message: z.string().max(300).optional(),
})

// GET /api/admin/settings
export async function GET() {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const settings = await getSettings(true)
    return NextResponse.json({ success: true, data: settings })
  } catch (e) {
    console.error('admin settings get error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}

// PUT /api/admin/settings
export async function PUT(request: NextRequest) {
  const authz = await requireSuperAdmin()
  if (!authz.ok) return authz.response

  try {
    const partial = schema.parse(await request.json())
    const updated = await updateSettings(partial, authz.adminEmail)
    await logAdminAction(authz.adminId, authz.adminEmail, 'settings.update', 'platform', null, partial)
    return NextResponse.json({ success: true, data: updated })
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: 'Données invalides', details: e.errors }, { status: 400 })
    }
    console.error('admin settings put error:', e)
    return NextResponse.json({ error: 'Erreur' }, { status: 500 })
  }
}
