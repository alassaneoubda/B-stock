import NextAuth, { CredentialsSignin } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import { compare } from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { sql, sqlRaw, transaction } from './db'
import { ensureCompaniesSchema } from './ensure-companies-schema'
import { ensureUsersFullNameColumn } from './ensure-users-schema'
import { verifyImpersonationToken } from './impersonation'
import { verifyTotp } from './totp'
import { clientIp, isRateLimited } from './rate-limit'
import { getSettings } from './settings'
import type { UserRole } from './types'

/**
 * Erreurs de connexion typées : NextAuth ne transmet au client que le `code`
 * (jamais le message). Les codes sont traduits par components/auth/auth-errors.ts.
 */
class LoginError extends CredentialsSignin {
  constructor(code: 'invalid_credentials' | 'rate_limited' | 'suspended' | 'disabled' | 'invalid_token' | 'otp_required' | 'otp_invalid') {
    super()
    this.code = code
  }
}

/** Durée maximale d'une session d'assistance (impersonation). */
const IMPERSONATION_MAX_AGE_MS = 60 * 60 * 1000

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
  sessionVersion: number
  isPlatformAdmin?: boolean
  impersonatedBy?: string | null
  impersonationExpiresAt?: number | null
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

function toNormalizedUser(u: any): NormalizedUser {
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
    sessionVersion: Number(u.session_version ?? 0),
  }
}

async function findTenantUserByEmail(email: string) {
  const rows = await sql`
    SELECT u.*, c.name as company_name, c.slug as company_slug,
           c.onboarding_completed, c.is_suspended
    FROM users u
    JOIN companies c ON u.company_id = c.id
    WHERE lower(u.email) = ${email}
  `
  return rows[0] as any | undefined
}

/**
 * Décide si une connexion Google est autorisée (appelé par le callback signIn).
 * Renvoie true, ou une URL de redirection portant le motif du refus.
 */
async function checkGoogleSignIn(email: string): Promise<true | string> {
  const settings = await getSettings()
  if (!settings.google_oauth_enabled) return '/login?error=GoogleDisabled'

  const existing = await findTenantUserByEmail(email)
  if (existing) {
    if (!existing.is_active) return '/login?error=AccountDisabled'
    if (existing.is_suspended) return '/login?error=CompanySuspended'
    return true
  }

  // Les admins plateforme n'utilisent pas Google
  const admins = await sql`SELECT 1 FROM platform_admins WHERE lower(email) = ${email} LIMIT 1`
  if (admins.length > 0) return '/login?error=UseAdminLogin'

  if (!settings.registrations_open) return '/login?error=RegistrationsClosed'
  return true
}

/**
 * Map an OAuth (Google) account to a B-Stock user.
 * - Existing email -> returns that user (account linking by verified email).
 * - New email      -> provisions a company + owner user + main depot (trial),
 *                     exactly like the email/password sign-up, so the multi-tenant
 *                     model stays consistent. The user can rename the company later.
 * Les règles d'accès (désactivé, suspendu, inscriptions fermées) sont déjà
 * appliquées par checkGoogleSignIn.
 */
async function getOrCreateOAuthUser(
  email: string,
  name?: string | null,
  image?: string | null
): Promise<NormalizedUser | null> {
  const existing = await findTenantUserByEmail(email)
  if (existing) {
    await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${existing.id}`
    return toNormalizedUser(existing)
  }

  const settings = await getSettings()
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
      VALUES (${companyId}, 'Dépôt principal', true)
    `,
  ])

  const created = await findTenantUserByEmail(email)
  return created ? toNormalizedUser(created) : null
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
    sessionVersion?: number
    isPlatformAdmin?: boolean
    impersonatedBy?: string | null
    impersonationExpiresAt?: number | null
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
      sessionVersion: number
      isPlatformAdmin: boolean
      impersonatedBy: string | null
      impersonationExpiresAt: number | null
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
    sessionVersion?: number
    isPlatformAdmin?: boolean
    impersonatedBy?: string | null
    impersonationExpiresAt?: number | null
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  debug: process.env.AUTH_DEBUG === 'true',
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
        otp: { label: 'Code de vérification', type: 'text' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          throw new LoginError('invalid_credentials')
        }

        const email = String(credentials.email).trim().toLowerCase()
        const password = String(credentials.password)

        // Anti brute-force : par compte et par adresse IP (fenêtre de 15 min)
        const ip = request?.headers ? clientIp(request.headers) : 'unknown'
        if (
          (await isRateLimited('login-email', email, { limit: 10, windowSeconds: 900 })) ||
          (await isRateLimited('login-ip', ip, { limit: 50, windowSeconds: 900 }))
        ) {
          throw new LoginError('rate_limited')
        }

        // 1) Platform admin (back office /admin) — decoupled from tenants
        const admins = await sql`
          SELECT id, email, full_name, password_hash, role, totp_enabled, totp_secret, session_version
          FROM platform_admins
          WHERE lower(email) = ${email} AND is_active = true
        `
        const admin = admins[0] as
          | { id: string; email: string; full_name: string; password_hash: string; role: string; totp_enabled: boolean; totp_secret: string | null; session_version: number }
          | undefined

        if (admin) {
          const ok = await compare(password, admin.password_hash)
          if (!ok) throw new LoginError('invalid_credentials')
          // Double authentification : code de l'application d'authentification
          if (admin.totp_enabled && admin.totp_secret) {
            const otp = typeof credentials.otp === 'string' ? credentials.otp : ''
            if (!otp) throw new LoginError('otp_required')
            if (!verifyTotp(admin.totp_secret, otp)) throw new LoginError('otp_invalid')
          }
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
            sessionVersion: Number(admin.session_version ?? 0),
            isPlatformAdmin: true,
            impersonatedBy: null,
          }
        }

        // 2) Tenant user
        const user = await findTenantUserByEmail(email)

        // Comptes Google sans mot de passe local : même message générique
        if (!user || !user.is_active || !user.password_hash) {
          throw new LoginError('invalid_credentials')
        }

        const isValid = await compare(password, user.password_hash)
        if (!isValid) {
          throw new LoginError('invalid_credentials')
        }

        // Vérifié APRÈS le mot de passe : ne révèle rien à un inconnu
        if (user.is_suspended) {
          throw new LoginError('suspended')
        }

        await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`

        return { ...toNormalizedUser(user), isPlatformAdmin: false, impersonatedBy: null }
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
        if (!payload) throw new LoginError('invalid_token')

        // Usage unique : la 2e tentative avec le même jeton échoue
        const used = await sql`
          INSERT INTO impersonation_token_uses (jti, admin_id, target_user_id)
          VALUES (${payload.jti}, ${payload.adminId}, ${payload.uid})
          ON CONFLICT (jti) DO NOTHING
          RETURNING jti
        `
        if (used.length === 0) throw new LoginError('invalid_token')

        const rows = await sql`
          SELECT u.*, c.name as company_name, c.slug as company_slug,
                 c.onboarding_completed, c.is_suspended
          FROM users u
          JOIN companies c ON u.company_id = c.id
          WHERE u.id = ${payload.uid} AND u.is_active = true
        `
        const u = rows[0] as any
        if (!u) throw new LoginError('disabled')

        return {
          ...toNormalizedUser(u),
          isPlatformAdmin: false,
          impersonatedBy: payload.adminId,
          impersonationExpiresAt: Date.now() + IMPERSONATION_MAX_AGE_MS,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'google') {
        // Only allow Google sign-in with a verified email address
        if (!profile?.email || profile.email_verified !== true) return false
        return checkGoogleSignIn(profile.email.toLowerCase())
      }
      return true
    },
    async jwt({ token, user, account, trigger }) {
      // session.update() côté client (ex. fin d'onboarding) : on ne fait PAS
      // confiance aux valeurs envoyées, on relit la base.
      if (trigger === 'update') {
        if (token.companyId && token.id) {
          const rows = await sql`
            SELECT c.name, c.onboarding_completed
            FROM companies c
            JOIN users u ON u.company_id = c.id
            WHERE c.id = ${token.companyId} AND u.id = ${token.id}
          `
          if (rows[0]) {
            token.companyName = rows[0].name
            token.onboardingCompleted = rows[0].onboarding_completed !== false
          }
        }
        return token
      }

      // Google: enrich (or provision) the token from our DB on first sign-in
      if (account?.provider === 'google' && user?.email) {
        const dbUser = await getOrCreateOAuthUser(
          user.email.toLowerCase(),
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
          token.sessionVersion = dbUser.sessionVersion
          token.isPlatformAdmin = false
          token.impersonatedBy = null
          token.impersonationExpiresAt = null
        }
        return token
      }

      // Credentials / impersonate: the user object already carries the fields
      if (user) {
        const u = user as NormalizedUser & { email?: string | null; name?: string | null }
        token.id = u.id
        token.email = u.email
        token.name = u.name
        token.role = u.role
        token.permissions = u.permissions
        token.companyId = u.companyId
        token.companyName = u.companyName
        token.companySlug = u.companySlug
        token.onboardingCompleted = u.onboardingCompleted
        token.sessionVersion = u.sessionVersion ?? 0
        token.isPlatformAdmin = u.isPlatformAdmin === true
        token.impersonatedBy = u.impersonatedBy ?? null
        token.impersonationExpiresAt = u.impersonationExpiresAt ?? null
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
        session.user.sessionVersion = token.sessionVersion ?? 0
        session.user.isPlatformAdmin = token.isPlatformAdmin === true
        session.user.impersonatedBy = (token.impersonatedBy as string | null) ?? null
        session.user.impersonationExpiresAt = token.impersonationExpiresAt ?? null
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
