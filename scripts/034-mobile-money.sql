-- B-Stock — Encaissement des clients par Mobile Money (GeniusPay, compte marchand de l'entreprise)
--
-- Principe :
-- - company_payment_settings : identifiants GeniusPay PROPRES à chaque
--   entreprise (l'argent des ventes va sur son compte marchand, pas sur celui
--   de la plateforme). Les secrets sont chiffrés au repos (AES-256-GCM, clé
--   PAYMENT_CREDENTIALS_KEY) : seules les colonnes *_enc (chiffré) et *_last4
--   (affichage « ••••1234 ») sont stockées. webhook_token : jeton opaque de
--   l'URL de webhook (jamais l'UUID de l'entreprise).
-- - mobile_money_payments : une demande de paiement envoyée à un client depuis
--   une vente ou une créance. Elle n'est imputée (applyClientPayment) qu'après
--   revérification du statut auprès de l'API GeniusPay, sous verrou de ligne.
-- - payments.mobile_money_payment_id UNIQUE : garantie en base qu'une demande
--   ne produit JAMAIS deux encaissements.
--
-- Idempotente : rejouable sans effet de bord.

CREATE TABLE IF NOT EXISTS company_payment_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  provider VARCHAR(30) NOT NULL DEFAULT 'geniuspay',
  enabled BOOLEAN NOT NULL DEFAULT false,
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  api_key_enc TEXT,
  api_key_last4 VARCHAR(8),
  api_secret_enc TEXT,
  api_secret_last4 VARCHAR(8),
  webhook_secret_enc TEXT,
  webhook_secret_last4 VARCHAR(8),
  webhook_token VARCHAR(64) NOT NULL,
  last_tested_at TIMESTAMP,
  last_test_ok BOOLEAN,
  last_test_message TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE company_payment_settings DROP CONSTRAINT IF EXISTS chk_cps_environment;
ALTER TABLE company_payment_settings ADD CONSTRAINT chk_cps_environment CHECK (environment IN ('sandbox', 'production'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_cps_webhook_token ON company_payment_settings(webhook_token);

CREATE TABLE IF NOT EXISTS mobile_money_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sales_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
  credit_note_id UUID REFERENCES credit_notes(id) ON DELETE SET NULL,
  account_type VARCHAR(20) NOT NULL DEFAULT 'product',
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'XOF',
  customer_phone VARCHAR(30),
  description VARCHAR(255),
  provider VARCHAR(30) NOT NULL DEFAULT 'geniuspay',
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  provider_reference VARCHAR(120),
  payment_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'creating',
  provider_status VARCHAR(30),
  provider_method VARCHAR(40),
  paid_amount DECIMAL(12,2),
  paid_at TIMESTAMP,
  applied_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  applied_at TIMESTAMP,
  apply_error TEXT,
  check_attempts INT NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE mobile_money_payments DROP CONSTRAINT IF EXISTS chk_mmp_amount;
ALTER TABLE mobile_money_payments ADD CONSTRAINT chk_mmp_amount CHECK (amount > 0);
ALTER TABLE mobile_money_payments DROP CONSTRAINT IF EXISTS chk_mmp_status;
ALTER TABLE mobile_money_payments ADD CONSTRAINT chk_mmp_status CHECK (status IN ('creating', 'pending', 'paid', 'failed', 'expired', 'cancelled'));
ALTER TABLE mobile_money_payments DROP CONSTRAINT IF EXISTS chk_mmp_account_type;
ALTER TABLE mobile_money_payments ADD CONSTRAINT chk_mmp_account_type CHECK (account_type IN ('product', 'packaging'));
ALTER TABLE mobile_money_payments DROP CONSTRAINT IF EXISTS chk_mmp_environment;
ALTER TABLE mobile_money_payments ADD CONSTRAINT chk_mmp_environment CHECK (environment IN ('sandbox', 'production'));
-- Une imputation n'existe que pour une demande effectivement payée
ALTER TABLE mobile_money_payments DROP CONSTRAINT IF EXISTS chk_mmp_applied_paid;
ALTER TABLE mobile_money_payments ADD CONSTRAINT chk_mmp_applied_paid CHECK (applied_payment_id IS NULL OR status = 'paid');

CREATE UNIQUE INDEX IF NOT EXISTS uq_mmp_provider_reference ON mobile_money_payments(provider, provider_reference) WHERE provider_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mmp_applied_payment ON mobile_money_payments(applied_payment_id) WHERE applied_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mmp_company_created ON mobile_money_payments(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mmp_pending ON mobile_money_payments(status, last_checked_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_mmp_sales_order ON mobile_money_payments(sales_order_id) WHERE sales_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mmp_credit_note ON mobile_money_payments(credit_note_id) WHERE credit_note_id IS NOT NULL;

-- Garantie en base : une demande Mobile Money = au plus UN encaissement
ALTER TABLE payments ADD COLUMN IF NOT EXISTS mobile_money_payment_id UUID REFERENCES mobile_money_payments(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_mobile_money ON payments(mobile_money_payment_id) WHERE mobile_money_payment_id IS NOT NULL;
