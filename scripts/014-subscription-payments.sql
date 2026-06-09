-- B-Stock — Historique des paiements d'abonnement (facturation back office)
-- Trace chaque paiement/activation d'abonnement (GeniusPay, gratuit, ou octroyé
-- manuellement par un admin). Sert de source de vérité pour la facturation.
-- Idempotent.

CREATE TABLE IF NOT EXISTS subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  reference VARCHAR(255) UNIQUE,                 -- référence GeniusPay (idempotence)
  plan_name VARCHAR(150),
  amount DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'XOF',
  months INT DEFAULT 1,
  status VARCHAR(30) DEFAULT 'completed',        -- completed | failed | refunded | manual
  provider VARCHAR(30) DEFAULT 'geniuspay',      -- geniuspay | manual | admin
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_payments_company ON subscription_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_status ON subscription_payments(status);
CREATE INDEX IF NOT EXISTS idx_sub_payments_created ON subscription_payments(created_at DESC);
