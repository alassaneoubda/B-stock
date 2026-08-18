import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { compare } from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { sql, sqlRaw, transaction } from './db'
import { ensureCompaniesSchema } from './ensure-companies-schema'
import { ensureUsersFullNameColumn } from './ensure-users-schema'
import { verifyImpersonationToken } from './impersonation'
import { getSettings } from './settings'
import type { UserRole } from './types'

type NormalizedUser = {
  id: string
  email: string
  name: string
  role: UserRole
  permissions: string[]
  companyId: string
  companyName: string
  companySlug: string
  onboardingCompleted: boolean
  isPlatformAdmin?: boolean
  impersonatedBy?: string | null
}

function normalizePermissions(p: string[] | string | undefined | null): string[] {
  if (Array.isArray(p)) return p
  if (typeof p === 'string') {
    try {
      return JSON.parse(p)
    } catch {
      return []
    }
  }
  return []
}

/**
 * Map an OAuth (Google) account to a B-Stock user.
 * - Existing email -> returns that user (account linking by verified email).
 * - New email      -> provisions a company + owner user + main depot (30-day trial),
 *                     exactly like the email/password sign-up, so the multi-tenant
 *                     model stays consistent. The user can rename the company later.
 */
async function getOrCreateOAuthUser(
  email: string,
  name?: string | null,
  image?: string | null
): Promise<NormalizedUser | null> {
  // Respect the global toggle for Google sign-in
  const settings = await getSettings()
  if (!settings.google_oauth_enabled) {
    return null
  }

  const existing = await sql`
    SELECT u.*, c.name as company_name, c.slug as company_slug,
           c.onboarding_completed
    FROM users u
    JOIN companies c ON u.company_id = c.id
    WHERE u.email = ${email} AND u.is_active = true
  `

  if (existing[0]) {
    const u = existing[0] as any
    await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${u.id}`
    return {
      id: u.id,
      email: u.email,
      name: u.full_name,
      role: u.role,
      permissions: normalizePermissions(u.permissions),
      companyId: u.company_id,
      companyName: u.company_name,
      companySlug: u.company_slug,
      onboardingCompleted: u.onboarding_completed !== false,
    }
  }

  // First-time Google user -> provision a fresh tenant
  await ensureCompaniesSchema()
  await ensureUsersFullNameColumn()

  const companyId = randomUUID()
  const displayName = name?.trim() || email.split('@')[0]
  const slug =
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') +
    '-' +
    Date.now().toString(36)
  const trialEndsAt = new Date()
  trialEndsAt.setDate(trialEndsAt.getDate() + settings.trial_days)

  await transaction([
    sqlRaw`
      INSERT INTO companies (id, name, slug, email, subscription_status, trial_ends_at, onboarding_completed)
      VALUES (${companyId}, ${displayName}, ${slug}, ${email}, 'trialing', ${trialEndsAt.toISOString()}, false)
    `,
    sqlRaw`
      INSERT INTO users (company_id, email, name, full_name, role, auth_provider, avatar_url)
      VALUES (${companyId}, ${email}, ${displayName}, ${displayName}, 'owner', 'google', ${image || null})
    `,
    sqlRaw`
      INSERT INTO depots (company_id, name, is_main)
      VALUES (${companyId}, 'Depot Principal', true)
    `,
  ])

  const created = await sql`
    SELECT u.*, c.name as company_name, c.slug as company_slug,
           c.onboarding_completed
    FROM users u
    JOIN companies c ON u.company_id = c.id
    WHERE u.company_id = ${companyId} AND u.email = ${email}
  `
  const u = created[0] as any
  if (!u) return null
  return {
    id: u.id,
    email: u.email,
    name: u.full_name,
    role: u.role,
    permissions: normalizePermissions(u.permissions),
    companyId: u.company_id,
    companyName: u.company_name,
    companySlug: u.company_slug,
    onboardingCompleted: u.onboarding_completed !== false,
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    role?: UserRole
    permissions?: string[]
    companyId?: string
    companyName?: string
    companySlug?: string
    onboardingCompleted?: boolean
    isPlatformAdmin?: boolean
    impersonatedBy?: string | null
  }
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: UserRole
      permissions: string[]
      companyId: string
      companyName: string
      companySlug: string
      onboardingCompleted: boolean
      isPlatformAdmin: boolean
      impersonatedBy: string | null
    }
  }

  interface User {
    id: string
    email: string
    name: string
    role: UserRole
    permissions: string[]
    companyId: string
    companyName: string
    companySlug: string
    onboardingCompleted: boolean
    isPlatformAdmin?: boolean
    impersonatedBy?: string | null
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  debug: process.env.NODE_ENV !== 'production',
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email et mot de passe requis')
        }

        const email = (credentials.email as string).toLowerCase()

        // 1) Platform admin (back office /admin) — decoupled from tenants
        const admins = await sql`
          SELECT id, email, full_name, password_hash, role
          FROM platform_admins
          WHERE email = ${email} AND is_active = true
        `
        const admin = admins[0] as
          | { id: string; email: string; full_name: string; password_hash: string; role: string }
          | undefined

        if (admin) {
          const ok = await compare(credentials.password as string, admin.password_hash)
          if (!ok) throw new Error('Email ou mot de passe incorrect')
          await sql`UPDATE platform_admins SET last_login_at = NOW() WHERE id = ${admin.id}`
          return {
            id: admin.id,
            email: admin.email,
            name: admin.full_name,
            role: 'owner' as UserRole, // sentinel — platform admins bypass tenant RBAC
            permissions: [],
            companyId: '',
            companyName: 'Plateforme',
            companySlug: '',
            onboardingCompleted: true,
            isPlatformAdmin: true,
            impersonatedBy: null,
          }
        }

        // 2) Tenant user
        const users = await sql`
          SELECT u.*, c.name as company_name, c.slug as company_slug,
                 c.subscription_status, c.onboarding_completed, c.is_suspended
          FROM users u
          JOIN companies c ON u.company_id = c.id
          WHERE u.email = ${email}
          AND u.is_active = true
        `

        const user = users[0] as
          | {
            id: string
            email: string
            full_name: string
            password_hash: string
            role: UserRole
            permissions?: string[] | string // Handle if returned as string from some DB drivers
            company_id: string
            company_name: string
            company_slug: string
            subscription_status: string
            onboarding_completed?: boolean
            is_suspended?: boolean
          }
          | undefined

        if (!user) {
          throw new Error('Email ou mot de passe incorrect')
        }

        if (user.is_suspended) {
          throw new Error('Compte entreprise suspendu. Contactez le support.')
        }

        const isValid = await compare(credentials.password as string, user.password_hash)

        if (!isValid) {
          throw new Error('Email ou mot de passe incorrect')
        }

        // Update last login
        await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`

        // Normalize permissions
        let permissions: string[] = []
        if (Array.isArray(user.permissions)) {
          permissions = user.permissions
        } else if (typeof user.permissions === 'string') {
          try {
            permissions = JSON.parse(user.permissions)
          } catch {
            permissions = []
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.full_name,
          role: user.role,
          permissions,
          companyId: user.company_id,
          companyName: user.company_name,
          companySlug: user.company_slug,
          onboardingCompleted: user.onboarding_completed !== false,
          isPlatformAdmin: false,
          impersonatedBy: null,
        }
      },
    }),
    Credentials({
      id: 'impersonate',
      name: 'impersonate',
      credentials: {
        token: { label: 'Token', type: 'text' },
      },
      async authorize(credentials) {
        const token = credentials?.token as string | undefined
        if (!token) return null

        const payload = verifyImpersonationToken(token)
        if (!payload) throw new Error("Jeton d'impersonation invalide ou expiré")

        const rows = await sql`
          SELECT u.*, c.name as company_name, c.slug as company_slug,
                 c.onboarding_completed, c.is_suspended
          FROM users u
          JOIN companies c ON u.company_id = c.id
          WHERE u.id = ${payload.uid}
        `
        const u = rows[0] as any
        if (!u) throw new Error('Utilisateur cible introuvable')

        return {
          id: u.id,
          email: u.email,
          name: u.full_name,
          role: u.role,
          permissions: normalizePermissions(u.permissions),
          companyId: u.company_id,
          companyName: u.company_name,
          companySlug: u.company_slug,
          onboardingCompleted: u.onboarding_completed !== false,
          isPlatformAdmin: false,
          impersonatedBy: payload.adminId,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // Only allow Google sign-in with a verified email address
      if (account?.provider === 'google') {
        return Boolean(profile?.email) && profile?.email_verified === true
      }
      return true
    },
    async jwt({ token, user, account, trigger, session }) {
      // Client-side session.update() — e.g. after completing onboarding
      if (trigger === 'update' && session) {
        if (typeof session.companyName === 'string') {
          token.companyName = session.companyName
        }
        if (typeof session.onboardingCompleted === 'boolean') {
          token.onboardingCompleted = session.onboardingCompleted
        }
        return token
      }

      // Google: enrich (or provision) the token from our DB on first sign-in
      if (account?.provider === 'google' && user?.email) {
        const dbUser = await getOrCreateOAuthUser(
          user.email,
          user.name,
          (user as { image?: string | null }).image
        )
        if (dbUser) {
          token.id = dbUser.id
          token.email = dbUser.email
          token.name = dbUser.name
          token.role = dbUser.role
          token.permissions = dbUser.permissions
          token.companyId = dbUser.companyId
          token.companyName = dbUser.companyName
          token.companySlug = dbUser.companySlug
          token.onboardingCompleted = dbUser.onboardingCompleted
          token.isPlatformAdmin = false
          token.impersonatedBy = null
        }
        return token
      }

      // Credentials / impersonate: the user object already carries the fields
      if (user) {
        const u = user as {
          id: string
          email?: string | null
          name?: string | null
          role: UserRole
          permissions: string[]
          companyId: string
          companyName: string
          companySlug: string
          onboardingCompleted: boolean
          isPlatformAdmin?: boolean
          impersonatedBy?: string | null
        }
        token.id = u.id
        token.email = u.email
        token.name = u.name
        token.role = u.role
        token.permissions = u.permissions
        token.companyId = u.companyId
        token.companyName = u.companyName
        token.companySlug = u.companySlug
        token.onboardingCompleted = u.onboardingCompleted
        token.isPlatformAdmin = u.isPlatformAdmin === true
        token.impersonatedBy = u.impersonatedBy ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.role = token.role as UserRole
        session.user.permissions = (token.permissions as string[]) || []
        session.user.companyId = token.companyId as string
        session.user.companyName = token.companyName as string
        session.user.companySlug = token.companySlug as string
        // Existing tokens (issued before this field existed) default to true
        // so only newly-provisioned Google accounts are forced into onboarding.
        session.user.onboardingCompleted = token.onboardingCompleted !== false
        session.user.isPlatformAdmin = token.isPlatformAdmin === true
        session.user.impersonatedBy = (token.impersonatedBy as string | null) ?? null
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
})

// ===== Permission helpers =====

/**
 * Check if a role has a specific permission.
 * Permissions are stored as strings like 'products.read', 'sales.write' etc.
 */
export async function hasPermission(
  role: UserRole,
  permission: string
): Promise<boolean> {
  const result = await sql`
    SELECT 1 FROM role_permissions
    WHERE role = ${role} AND permission = ${permission}
    LIMIT 1
  `
  return result.length > 0
}

/**
 * Get all permissions for a role
 */
export async function getRolePermissions(role: UserRole): Promise<string[]> {
  const permissions = await sql`
    SELECT permission FROM role_permissions
    WHERE role = ${role}
    ORDER BY permission
  `
  return permissions.map((p: any) => p.permission)
}

/**
 * Check if session user has the required permission.
 * Returns the error response or null if authorized.
 */
export async function requirePermission(
  role: UserRole,
  permission: string
): Promise<boolean> {
  // Owner always has access
  if (role === 'owner') return true
  return hasPermission(role, permission)
}

// ===== Company helpers =====

export async function getCompany(companyId: string) {
  const companies = await sql`
    SELECT * FROM companies WHERE id = ${companyId}
  `
  return companies[0] ?? null
}

export async function checkSubscription(companyId: string): Promise<{
  isActive: boolean
  status: string
  trialEndsAt?: string
  daysRemaining?: number
}> {
  const company = await getCompany(companyId)

  if (!company) {
    return { isActive: false, status: 'not_found' }
  }

  const now = new Date()

  if (company.subscription_status === 'trialing' && company.trial_ends_at) {
    const trialEnds = new Date(company.trial_ends_at)
    const daysRemaining = Math.ceil(
      (trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    return {
      isActive: daysRemaining > 0,
      status: 'trialing',
      trialEndsAt: trialEnds.toISOString(),
      daysRemaining: Math.max(0, daysRemaining),
    }
  }

  return {
    isActive: company.subscription_status === 'active',
    status: company.subscription_status,
  }
}
