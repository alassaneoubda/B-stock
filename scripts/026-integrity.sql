-- B-Stock — Intégrité des données et socle de sécurité (phase 1 de la refonte).
-- Idempotent. Sur une base de production, faire une sauvegarde (branche Neon)
-- AVANT : la section 5 fusionne des doublons de stock / comptes clients.
--
-- 1. Colonnes de dérive (anciennes bases créées avant 001 complet)
-- 2. Colonnes manquantes (validation de caisse, révocation de session)
-- 3. Numérotation des documents par entreprise
-- 4. Unicité des numéros par entreprise (et non plus globale)
-- 5. Fusion des doublons + unicité stock / emballages / comptes clients
-- 6. Contraintes de quantité
-- 7. Abonnement : type de plan, paiements en attente
-- 8. Impersonation à usage unique
-- 9. Index de performance

-- =============================================
-- 1. Colonnes de dérive
-- =============================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gps_coordinates VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS zone VARCHAR(100);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS packaging_credit_limit DECIMAL(12,2) DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_terms_days INT DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE packaging_types ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]';

-- =============================================
-- 2. Colonnes manquantes
-- =============================================
-- Validation des mouvements de caisse manuels (utilisées par le code, jamais créées)
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS requires_validation BOOLEAN DEFAULT false;
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20);
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES users(id);
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP;
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS validation_notes TEXT;

-- Révocation des sessions : incrémenter invalide tous les JWT de l'utilisateur
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 0;

-- =============================================
-- 3. Numérotation des documents par entreprise
-- =============================================
-- Incrément atomique :
--   INSERT ... ON CONFLICT (company_id, doc_type)
--   DO UPDATE SET last_value = document_sequences.last_value + 1 RETURNING last_value
CREATE TABLE IF NOT EXISTS document_sequences (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  doc_type VARCHAR(30) NOT NULL,
  last_value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (company_id, doc_type)
);

-- Amorçage depuis les numéros séquentiels existants (format PREFIXE-00001)
INSERT INTO document_sequences (company_id, doc_type, last_value)
SELECT company_id, 'credit', MAX(substring(credit_number from '^CR-([0-9]+)$')::bigint)
FROM credit_notes WHERE credit_number ~ '^CR-[0-9]+$' GROUP BY company_id
ON CONFLICT (company_id, doc_type) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value);

INSERT INTO document_sequences (company_id, doc_type, last_value)
SELECT company_id, 'credit_note', MAX(substring(credit_number from '^AV-([0-9]+)$')::bigint)
FROM credit_notes WHERE credit_number ~ '^AV-[0-9]+$' GROUP BY company_id
ON CONFLICT (company_id, doc_type) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value);

INSERT INTO document_sequences (company_id, doc_type, last_value)
SELECT company_id, 'transfer', MAX(substring(transfer_number from '^TRF-([0-9]+)$')::bigint)
FROM depot_transfers WHERE transfer_number ~ '^TRF-[0-9]+$' GROUP BY company_id
ON CONFLICT (company_id, doc_type) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value);

INSERT INTO document_sequences (company_id, doc_type, last_value)
SELECT company_id, 'return', MAX(substring(return_number from '^RET-([0-9]+)$')::bigint)
FROM returns WHERE return_number ~ '^RET-[0-9]+$' GROUP BY company_id
ON CONFLICT (company_id, doc_type) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value);

INSERT INTO document_sequences (company_id, doc_type, last_value)
SELECT company_id, 'inventory', MAX(substring(session_number from '^INV-([0-9]+)$')::bigint)
FROM inventory_sessions WHERE session_number ~ '^INV-[0-9]+$' GROUP BY company_id
ON CONFLICT (company_id, doc_type) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value);

INSERT INTO document_sequences (company_id, doc_type, last_value)
SELECT company_id, 'sale', MAX(substring(order_number from '^VNT-([0-9]+)$')::bigint)
FROM sales_orders WHERE order_number ~ '^VNT-[0-9]+$' GROUP BY company_id
ON CONFLICT (company_id, doc_type) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value);

INSERT INTO document_sequences (company_id, doc_type, last_value)
SELECT company_id, 'purchase', MAX(substring(order_number from '^ACH-([0-9]+)$')::bigint)
FROM purchase_orders WHERE order_number ~ '^ACH-[0-9]+$' GROUP BY company_id
ON CONFLICT (company_id, doc_type) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value);

INSERT INTO document_sequences (company_id, doc_type, last_value)
SELECT company_id, 'invoice_client', MAX(substring(invoice_number from '^FC-([0-9]+)$')::bigint)
FROM invoices WHERE invoice_number ~ '^FC-[0-9]+$' GROUP BY company_id
ON CONFLICT (company_id, doc_type) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value);

INSERT INTO document_sequences (company_id, doc_type, last_value)
SELECT company_id, 'invoice_supplier', MAX(substring(invoice_number from '^FF-([0-9]+)$')::bigint)
FROM invoices WHERE invoice_number ~ '^FF-[0-9]+$' GROUP BY company_id
ON CONFLICT (company_id, doc_type) DO UPDATE SET last_value = GREATEST(document_sequences.last_value, EXCLUDED.last_value);

-- =============================================
-- 4. Unicité des numéros PAR ENTREPRISE
-- =============================================
-- Les contraintes globales faisaient échouer le 2e tenant (CR-00001 déjà pris).
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_order_number_key;
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_order_number_key;
ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS credit_notes_credit_number_key;
ALTER TABLE depot_transfers DROP CONSTRAINT IF EXISTS depot_transfers_transfer_number_key;
ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_return_number_key;
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_company_number ON sales_orders(company_id, order_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_company_number ON purchase_orders(company_id, order_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_notes_company_number ON credit_notes(company_id, credit_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_depot_transfers_company_number ON depot_transfers(company_id, transfer_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_returns_company_number ON returns(company_id, return_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_company_number ON invoices(company_id, invoice_number);

-- =============================================
-- 5. Fusion des doublons + unicité
-- =============================================
-- stock : une ligne par (dépôt, variante, lot). Les doublons sont fusionnés
-- dans la ligne la plus ancienne (quantités additionnées).
UPDATE stock s
SET quantity = g.total, updated_at = NOW()
FROM (
  SELECT id,
         SUM(quantity) OVER (PARTITION BY depot_id, product_variant_id, COALESCE(lot_number, '')) AS total,
         COUNT(*) OVER (PARTITION BY depot_id, product_variant_id, COALESCE(lot_number, '')) AS n,
         ROW_NUMBER() OVER (PARTITION BY depot_id, product_variant_id, COALESCE(lot_number, '') ORDER BY created_at, id) AS rn
  FROM stock
) g
WHERE s.id = g.id AND g.n > 1 AND g.rn = 1;

DELETE FROM stock s
USING (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY depot_id, product_variant_id, COALESCE(lot_number, '') ORDER BY created_at, id) AS rn
  FROM stock
) g
WHERE s.id = g.id AND g.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_depot_variant_lot
  ON stock(depot_id, product_variant_id, COALESCE(lot_number, ''));

-- packaging_stock : une ligne par (dépôt, type d'emballage)
UPDATE packaging_stock s
SET quantity = g.total, updated_at = NOW()
FROM (
  SELECT id,
         SUM(quantity) OVER (PARTITION BY depot_id, packaging_type_id) AS total,
         COUNT(*) OVER (PARTITION BY depot_id, packaging_type_id) AS n,
         ROW_NUMBER() OVER (PARTITION BY depot_id, packaging_type_id ORDER BY created_at, id) AS rn
  FROM packaging_stock
) g
WHERE s.id = g.id AND g.n > 1 AND g.rn = 1;

DELETE FROM packaging_stock s
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY depot_id, packaging_type_id ORDER BY created_at, id) AS rn
  FROM packaging_stock
) g
WHERE s.id = g.id AND g.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_packaging_stock_depot_type
  ON packaging_stock(depot_id, packaging_type_id);

-- client_accounts : un compte par (client, type) — requis par les ON CONFLICT du code
UPDATE client_accounts a
SET balance = g.total, updated_at = NOW()
FROM (
  SELECT id,
         SUM(balance) OVER (PARTITION BY client_id, account_type) AS total,
         COUNT(*) OVER (PARTITION BY client_id, account_type) AS n,
         ROW_NUMBER() OVER (PARTITION BY client_id, account_type ORDER BY created_at, id) AS rn
  FROM client_accounts
) g
WHERE a.id = g.id AND g.n > 1 AND g.rn = 1;

DELETE FROM client_accounts a
USING (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY client_id, account_type ORDER BY created_at, id) AS rn
  FROM client_accounts
) g
WHERE a.id = g.id AND g.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_accounts_client_type
  ON client_accounts(client_id, account_type);

-- Prix par type de client : une règle par (variante, type de client, quantité min)
CREATE UNIQUE INDEX IF NOT EXISTS uq_price_rules_variant_type_qty
  ON price_rules(company_id, product_variant_id, client_type, min_quantity);

-- =============================================
-- 6. Contraintes de quantité
-- =============================================
-- NOT VALID : appliquée aux nouvelles écritures sans bloquer sur l'historique.
ALTER TABLE stock DROP CONSTRAINT IF EXISTS chk_stock_quantity_non_negative;
ALTER TABLE stock ADD CONSTRAINT chk_stock_quantity_non_negative CHECK (quantity >= 0) NOT VALID;
ALTER TABLE packaging_stock DROP CONSTRAINT IF EXISTS chk_packaging_stock_quantity_non_negative;
ALTER TABLE packaging_stock ADD CONSTRAINT chk_packaging_stock_quantity_non_negative CHECK (quantity >= 0) NOT VALID;

-- =============================================
-- 7. Abonnement
-- =============================================
-- paid : checkout GeniusPay · free : activation directe · on_quote : sur devis (admin)
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS pricing_type VARCHAR(20) NOT NULL DEFAULT 'paid';
UPDATE subscription_plans SET pricing_type = 'on_quote' WHERE name = 'entreprise';

-- Paiements initiés et en attente de confirmation GeniusPay (rapprochement)
CREATE TABLE IF NOT EXISTS subscription_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  reference VARCHAR(255) UNIQUE,
  plan_id VARCHAR(100) NOT NULL,         -- subscription_plans.name
  plan_name VARCHAR(150) NOT NULL,
  billing_interval VARCHAR(20) NOT NULL, -- monthly | quarterly | semiannual | yearly
  months INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'XOF',
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | completed | failed | expired
  provider_status VARCHAR(30),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  check_attempts INT NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sub_checkouts_company ON subscription_checkouts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_checkouts_pending ON subscription_checkouts(status, created_at) WHERE status = 'pending';

-- =============================================
-- 8. Impersonation à usage unique
-- =============================================
CREATE TABLE IF NOT EXISTS impersonation_token_uses (
  jti VARCHAR(64) PRIMARY KEY,
  admin_id UUID,
  target_user_id UUID,
  used_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 9. Index de performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
CREATE INDEX IF NOT EXISTS idx_platform_admins_email_lower ON platform_admins(lower(email));
CREATE INDEX IF NOT EXISTS idx_sales_orders_company_created ON sales_orders(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order ON sales_order_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_pkg_items_order ON sales_order_packaging_items(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_created ON stock_movements(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_variant ON stock_movements(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_client_status ON credit_notes(client_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_payments_credit ON credit_payments(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_created ON purchase_orders(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_tour_stops_tour ON tour_stops(delivery_tour_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_inventory_tour ON vehicle_inventory(delivery_tour_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_company_created ON cash_movements(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_packaging_transactions_client ON packaging_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_accounts_client ON client_accounts(client_id);
CREATE INDEX IF NOT EXISTS idx_depots_company ON depots(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_company ON vehicles(company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_tours_company_date ON delivery_tours(company_id, tour_date DESC);
CREATE INDEX IF NOT EXISTS idx_packaging_types_company ON packaging_types(company_id);
