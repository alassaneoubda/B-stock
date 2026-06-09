-- B-Stock — Annonces in-app (back office -> entreprises)
-- Bannières diffusées aux tenants, avec ciblage et fenêtre de diffusion. Idempotent.

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  level VARCHAR(20) NOT NULL DEFAULT 'info',     -- info | success | warning | critical
  audience VARCHAR(20) NOT NULL DEFAULT 'all',   -- all | company | status
  target_company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  target_status VARCHAR(30),                      -- trialing | active | past_due | canceled
  dismissible BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMP,
  ends_at TIMESTAMP,
  created_by UUID REFERENCES platform_admins(id) ON DELETE SET NULL,
  created_by_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at DESC);

-- Suivi des fermetures par utilisateur (pour ne pas réafficher)
CREATE TABLE IF NOT EXISTS announcement_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID REFERENCES announcements(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ann_dismissals_user ON announcement_dismissals(user_id);
