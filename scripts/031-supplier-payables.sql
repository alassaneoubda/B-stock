-- B-Stock — Dettes fournisseurs : conditions de paiement, échéances, règlements
--
-- Principe :
-- - La dette d'un bon de commande = valeur des quantités REÇUES (prix d'achat
--   de la ligne) moins la valeur des retours fournisseurs de cette commande.
--   Elle est calculée à la volée (lib/domain/payables.ts) : aucune dépendance
--   à la logique de réception.
-- - purchase_orders.paid_amount : cumul des règlements non annulés, maintenu
--   uniquement par les routes de paiement (sous verrou FOR UPDATE du bon).
-- - Échéance = payment_due_date si saisie, sinon date de première réception
--   + suppliers.payment_terms_days.
-- - supplier_payments : un règlement (partiel ou total) numéroté RF-000001,
--   annulable (contre-passation, y compris en caisse si payé en espèces).
--
-- Idempotente : rejouable sans effet de bord.

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms_days INT NOT NULL DEFAULT 0;
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS chk_suppliers_payment_terms;
ALTER TABLE suppliers ADD CONSTRAINT chk_suppliers_payment_terms CHECK (payment_terms_days BETWEEN 0 AND 365);

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_due_date DATE;
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS chk_purchase_orders_paid_amount;
ALTER TABLE purchase_orders ADD CONSTRAINT chk_purchase_orders_paid_amount CHECK (paid_amount >= 0);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  payment_number VARCHAR(30) NOT NULL,
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_money', 'check')),
  reference VARCHAR(100),
  notes TEXT,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
  cash_movement_id UUID REFERENCES cash_movements(id) ON DELETE SET NULL,
  cancel_reason TEXT,
  cancelled_at TIMESTAMP,
  cancelled_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_payments_company_number ON supplier_payments(company_id, payment_number);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_order ON supplier_payments(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(company_id, supplier_id, paid_at);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_supplier ON purchase_orders(company_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_variant ON purchase_order_items(product_variant_id);

-- Reprise : paid_amount aligné sur les règlements existants (no-op au premier passage)
UPDATE purchase_orders po SET paid_amount = x.total
FROM (
  SELECT purchase_order_id, SUM(amount) AS total FROM supplier_payments
  WHERE status = 'completed' GROUP BY purchase_order_id
) x
WHERE x.purchase_order_id = po.id AND po.paid_amount <> x.total;
