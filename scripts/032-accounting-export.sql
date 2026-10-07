-- B-Stock — Export comptable SYSCOHADA (référentiel OHADA révisé)
--
-- B-Stock ne tient pas la comptabilité : il produit les écritures en partie
-- double (journaux VT, AC, CA, BQ, MM, OD) que l'expert-comptable importe dans
-- son logiciel. Cette migration ajoute :
--  - accounting_settings        : plan de comptes paramétrable par entreprise
--                                 (surcharges des valeurs SYSCOHADA par défaut,
--                                 définies dans lib/accounting/chart.ts) ;
--  - accounting_auxiliary_codes : codes de comptes auxiliaires (tiers) saisis
--                                 pour un client ou un fournisseur ;
--  - accounting_period_locks    : mois clôturés (plus aucune création,
--                                 modification ou annulation de document daté
--                                 dans le mois — lib/accounting/period-lock.ts) ;
--  - accounting_exports         : historique des exports (traçabilité).
--
-- Idempotente : rejouable sans effet.

CREATE TABLE IF NOT EXISTS accounting_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  -- { "<clé>": "<numéro de compte>" } : seules les valeurs modifiées sont stockées
  accounts JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- { "VT": "VT", "AC": "AC", ... } : codes journaux du logiciel comptable
  journals JSONB NOT NULL DEFAULT '{}'::jsonb,
  use_auxiliary BOOLEAN NOT NULL DEFAULT true,
  client_aux_prefix VARCHAR(6) NOT NULL DEFAULT 'C',
  supplier_aux_prefix VARCHAR(6) NOT NULL DEFAULT 'F',
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounting_auxiliary_codes (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('client', 'supplier')),
  entity_id UUID NOT NULL,
  code VARCHAR(17) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, entity_type, entity_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_accounting_aux_code
  ON accounting_auxiliary_codes(company_id, entity_type, code);

CREATE TABLE IF NOT EXISTS accounting_period_locks (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Premier jour du mois clôturé
  period_start DATE NOT NULL CHECK (EXTRACT(DAY FROM period_start) = 1),
  locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  locked_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, period_start)
);

CREATE TABLE IF NOT EXISTS accounting_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  journals TEXT[] NOT NULL DEFAULT '{}',
  format VARCHAR(10) NOT NULL,
  line_count INT NOT NULL DEFAULT 0,
  total_debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounting_exports_company
  ON accounting_exports(company_id, created_at DESC);

-- Lectures par période des sources de l'export
CREATE INDEX IF NOT EXISTS idx_payments_company_created ON payments(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_company_date ON expenses(company_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_credit_notes_company_created ON credit_notes(company_id, created_at);
