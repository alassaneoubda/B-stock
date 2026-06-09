import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { auth } from './auth'
import { sql } from './db'

type AdminSuccess = {
  ok: true
  session: Session
  adminId: string
  adminEmail: string
}
type AdminFailure = { ok: false; response: NextResponse }
export type AdminAuthResult = AdminSuccess | AdminFailure

/**
 * Guard for /api/admin/* routes — only platform super-admins pass.
 */
export async function requireSuperAdmin(): Promise<AdminAuthResult> {
  const session = await auth()
  if (!session?.user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }),
    }
  }
  if (!session.user.isPlatformAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Accès super-admin requis' },
        { status: 403 }
      ),
    }
  }
  return {
    ok: true,
    session,
    adminId: session.user.id,
    adminEmail: session.user.email,
  }
}

/**
 * Record a platform-level action in the audit trail. Best-effort (never throws).
 */
export async function logAdminAction(
  adminId: string,
  adminEmail: string,
  action: string,
  targetType?: string | null,
  targetId?: string | null,
  metadata?: Record<string, unknown> | null
): Promise<void> {
  try {
    await sql`
      INSERT INTO platform_audit_logs
        (admin_id, admin_email, action, target_type, target_id, metadata)
      VALUES
        (${adminId}, ${adminEmail}, ${action}, ${targetType ?? null},
         ${targetId ?? null}, ${metadata ? JSON.stringify(metadata) : null})
    `
  } catch (e) {
    console.error('[admin-audit] échec écriture log:', e)
  }
}
