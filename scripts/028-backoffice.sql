-- B-Stock — Back-office : suivi client, paiements, sécurité admin, exploitation, contenu.
-- Idempotent.

-- =============================================
-- 1. Sécurité des administrateurs
-- =============================================
-- Rôles : super_admin (tout) | support (clients, assistance) | finance (paiements, rapports)
UPDATE platform_admins SET role = 'super_admin' WHERE role IS NULL OR role NOT IN ('super_admin', 'support', 'finance');
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE platform_admins ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 0;

-- Liens de réinitialisation de mot de passe (utilisateurs des entreprises)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,   -- SHA-256 du jeton (le jeton en clair n'est jamais stocké)
  created_by_admin UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, created_at DESC);

-- =============================================
-- 2. Suivi client
-- =============================================
CREATE TABLE IF NOT EXISTS company_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  admin_email VARCHAR(255),
  body TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_notes_company ON company_notes(company_id, created_at DESC);

-- Activation de fonctionnalités par entreprise ({"pos": false, …} ; absent = valeur par défaut)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Suppression différée (30 jours) au lieu d'une suppression immédiate
ALTER TABLE companies ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMP;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS deletion_requested_by VARCHAR(255);

-- Dernière activité (mise à jour à la connexion)
CREATE INDEX IF NOT EXISTS idx_users_company_last_login ON users(company_id, last_login_at DESC);

-- =============================================
-- 3. Paiements
-- =============================================
-- Relances d'échéance envoyées (idempotence : une relance par palier et par échéance)
CREATE TABLE IF NOT EXISTS subscription_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL,           -- d7 | d3 | d0 | expired
  period_end DATE NOT NULL,            -- échéance concernée
  channel VARCHAR(20) NOT NULL,        -- email | in_app
  status VARCHAR(20) NOT NULL DEFAULT 'sent', -- sent | skipped | failed
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (company_id, kind, period_end)
);

-- Reçu des paiements manuels / remboursements
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(30);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS recorded_by VARCHAR(255);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS refund_reason TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sub_payments_receipt ON subscription_payments(receipt_number) WHERE receipt_number IS NOT NULL;

-- Séquence des reçus plateforme (une seule ligne)
CREATE TABLE IF NOT EXISTS platform_sequences (
  key VARCHAR(30) PRIMARY KEY,
  last_value BIGINT NOT NULL DEFAULT 0
);

-- =============================================
-- 4. Exploitation
-- =============================================
CREATE TABLE IF NOT EXISTS cron_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job VARCHAR(60) NOT NULL,
  status VARCHAR(20) NOT NULL,         -- success | failed
  summary JSONB,
  error TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_job ON cron_runs(job, started_at DESC);

-- =============================================
-- 5. Contenu
-- =============================================
-- Brouillon / publié pour le CMS de la landing (les éléments existants restent publiés)
ALTER TABLE cms_sections ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE cms_feature_modules ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE cms_faq_items ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE cms_testimonials ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT true;

-- Annonces : ciblage par plan + statistiques de lecture
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS announcement_views (
  announcement_id UUID REFERENCES announcements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (announcement_id, user_id)
);
