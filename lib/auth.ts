import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { sql } from './db'
import type { UserRole } from './types'

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
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
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

        const users = await sql`
          SELECT u.*, c.name as company_name, c.slug as company_slug, c.subscription_status
          FROM users u
          JOIN companies c ON u.company_id = c.id
          WHERE u.email = ${credentials.email as string}
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
          }
          | undefined

        if (!user) {
          throw new Error('Email ou mot de passe incorrect')
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
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string
        token.email = user.email as string
        token.name = user.name as string
        token.role = user.role as UserRole
        token.permissions = user.permissions as string[]
        token.companyId = user.companyId as string
        token.companyName = user.companyName as string
        token.companySlug = user.companySlug as string
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
