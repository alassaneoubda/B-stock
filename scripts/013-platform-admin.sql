-- B-Stock — Back office plateforme (super-admin)
-- Crée le socle pour /admin : administrateurs plateforme (découplés des tenants),
-- journal d'audit plateforme, et colonnes de suspension sur les entreprises.
-- Idempotent.

-- 1. Administrateurs plateforme (opérateurs SaaS) — totalement séparés des users tenant
CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'super_admin', -- 'super_admin' | 'admin'
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_admins_email ON platform_admins(email);

-- 2. Journal d'audit des actions plateforme (qui a fait quoi, sur quel tenant)
CREATE TABLE IF NOT EXISTS platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  admin_email VARCHAR(255),
  action VARCHAR(100) NOT NULL,          -- ex: 'company.suspend', 'user.reset_password', 'impersonate'
  target_type VARCHAR(50),               -- ex: 'company', 'user', 'plan'
  target_id UUID,
  metadata JSONB,
  ip_address VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_admin ON platform_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_target ON platform_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_logs(created_at DESC);

-- 3. Suspension des entreprises (blocage opérateur, distinct de l'abonnement)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
