-- B-Stock SaaS - New Features Migration
-- Cash management, credits, agents, inventory, transfers, returns, discounts, pricing, breakage, audit

-- =============================================
-- 1. CASH SESSIONS (Gestion journalière / caisse)
-- =============================================
CREATE TABLE IF NOT EXISTS cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  depot_id UUID REFERENCES depots(id),
  opened_by UUID REFERENCES users(id),
  closed_by UUID REFERENCES users(id),
  opening_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  closing_amount DECIMAL(12,2),
  expected_amount DECIMAL(12,2),
  variance DECIMAL(12,2),
  total_sales DECIMAL(12,2) DEFAULT 0,
  total_expenses DECIMAL(12,2) DEFAULT 0,
  total_cash_in DECIMAL(12,2) DEFAULT 0,
  total_cash_out DECIMAL(12,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open', -- 'open', 'closed'
  notes TEXT,
  opened_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 2. CASH MOVEMENTS (Journal de caisse)
-- =============================================
CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE CASCADE,
  movement_type VARCHAR(20) NOT NULL, -- 'cash_in', 'cash_out'
  category VARCHAR(50) NOT NULL, -- 'sale', 'credit_payment', 'expense', 'refund', 'deposit', 'withdrawal', 'other'
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  reference_type VARCHAR(50), -- 'sales_order', 'payment', 'expense', 'return'
  reference_id UUID,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 3. EXPENSES (Dépenses)
-- =============================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  cash_session_id UUID REFERENCES cash_sessions(id),
  category VARCHAR(50) NOT NULL, -- 'fuel', 'maintenance', 'salary', 'rent', 'utilities', 'supplies', 'transport', 'other'
  amount DECIMAL(12,2) NOT NULL,
  description TEXT,
  receipt_url TEXT,
  expense_date DATE DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 4. CREDIT MANAGEMENT (Gestion crédits avancée)
-- =============================================
CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  sales_order_id UUID REFERENCES sales_orders(id),
  credit_number VARCHAR(100) UNIQUE,
  total_amount DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  due_date DATE,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'partial', 'paid', 'overdue', 'written_off'
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID REFERENCES credit_notes(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50),
  reference VARCHAR(255),
  notes TEXT,
  received_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS credit_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID REFERENCES credit_notes(id) ON DELETE CASCADE,
  reminder_type VARCHAR(20), -- 'sms', 'call', 'visit', 'whatsapp'
  message TEXT,
  sent_at TIMESTAMP DEFAULT NOW(),
  sent_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 5. SALES AGENTS (Commerciaux)
-- =============================================
CREATE TABLE IF NOT EXISTS sales_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  zone VARCHAR(100),
  commission_rate DECIMAL(5,2) DEFAULT 0, -- percentage
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_client_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES sales_agents(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id, client_id)
);

CREATE TABLE IF NOT EXISTS agent_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES sales_agents(id) ON DELETE CASCADE,
  sales_order_id UUID REFERENCES sales_orders(id),
  commission_amount DECIMAL(12,2) NOT NULL,
  commission_rate DECIMAL(5,2),
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'paid'
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 6. INVENTORY SESSIONS (Inventaire)
-- =============================================
CREATE TABLE IF NOT EXISTS inventory_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  depot_id UUID REFERENCES depots(id),
  session_number VARCHAR(100),
  inventory_type VARCHAR(20) DEFAULT 'full', -- 'full', 'partial', 'spot_check'
  status VARCHAR(20) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'cancelled'
  total_items INT DEFAULT 0,
  items_with_variance INT DEFAULT 0,
  total_variance_value DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  started_by UUID REFERENCES users(id),
  completed_by UUID REFERENCES users(id),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_session_id UUID REFERENCES inventory_sessions(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id),
  packaging_type_id UUID REFERENCES packaging_types(id),
  item_type VARCHAR(20) DEFAULT 'product', -- 'product', 'packaging'
  system_quantity INT NOT NULL DEFAULT 0,
  counted_quantity INT,
  variance INT GENERATED ALWAYS AS (COALESCE(counted_quantity, 0) - system_quantity) STORED,
  unit_value DECIMAL(10,2) DEFAULT 0,
  variance_value DECIMAL(12,2) GENERATED ALWAYS AS ((COALESCE(counted_quantity, 0) - system_quantity) * COALESCE(unit_value, 0)) STORED,
  notes TEXT,
  counted_by UUID REFERENCES users(id),
  counted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 7. DEPOT TRANSFERS (Transfert inter-dépôts)
-- =============================================
CREATE TABLE IF NOT EXISTS depot_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  transfer_number VARCHAR(100) UNIQUE,
  source_depot_id UUID REFERENCES depots(id),
  destination_depot_id UUID REFERENCES depots(id),
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'in_transit', 'received', 'partial', 'cancelled'
  notes TEXT,
  created_by UUID REFERENCES users(id),
  received_by UUID REFERENCES users(id),
  shipped_at TIMESTAMP,
  received_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS depot_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_transfer_id UUID REFERENCES depot_transfers(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id),
  packaging_type_id UUID REFERENCES packaging_types(id),
  item_type VARCHAR(20) DEFAULT 'product', -- 'product', 'packaging'
  quantity_sent INT NOT NULL,
  quantity_received INT DEFAULT 0,
  quantity_damaged INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 8. RETURNS (Retours client & fournisseur)
-- =============================================
CREATE TABLE IF NOT EXISTS returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  return_number VARCHAR(100) UNIQUE,
  return_type VARCHAR(20) NOT NULL, -- 'client', 'supplier'
  client_id UUID REFERENCES clients(id),
  supplier_id UUID REFERENCES suppliers(id),
  sales_order_id UUID REFERENCES sales_orders(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  depot_id UUID REFERENCES depots(id),
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'processed', 'rejected'
  reason TEXT,
  total_amount DECIMAL(12,2) DEFAULT 0,
  refund_method VARCHAR(20), -- 'credit_note', 'cash', 'replacement'
  notes TEXT,
  created_by UUID REFERENCES users(id),
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID REFERENCES returns(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id),
  packaging_type_id UUID REFERENCES packaging_types(id),
  item_type VARCHAR(20) DEFAULT 'product', -- 'product', 'packaging'
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  condition VARCHAR(20) DEFAULT 'good', -- 'good', 'damaged', 'expired'
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 9. PRICE RULES (Tarification par catégorie)
-- =============================================
CREATE TABLE IF NOT EXISTS price_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id),
  client_type VARCHAR(50), -- 'wholesale', 'semi_wholesale', 'retail', 'restaurant', 'bar'
  price DECIMAL(10,2) NOT NULL,
  min_quantity INT DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  valid_from DATE,
  valid_until DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  discount_type VARCHAR(20) NOT NULL, -- 'percentage', 'fixed_amount', 'buy_x_get_y'
  discount_value DECIMAL(10,2) NOT NULL,
  applies_to VARCHAR(20) DEFAULT 'product', -- 'product', 'category', 'order', 'client'
  product_variant_id UUID REFERENCES product_variants(id),
  category VARCHAR(100),
  client_type VARCHAR(50),
  min_quantity INT DEFAULT 1,
  min_order_amount DECIMAL(12,2),
  is_active BOOLEAN DEFAULT true,
  valid_from DATE,
  valid_until DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 10. ORDER DISCOUNTS (Remises sur commandes)
-- =============================================
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_value DECIMAL(10,2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES sales_agents(id);

ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20);
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS discount_value DECIMAL(10,2) DEFAULT 0;
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT 0;

-- =============================================
-- 11. BREAKAGE & LOSSES (Casse et pertes)
-- =============================================
CREATE TABLE IF NOT EXISTS breakage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  depot_id UUID REFERENCES depots(id),
  record_type VARCHAR(20) NOT NULL, -- 'breakage', 'loss', 'expiry', 'theft'
  product_variant_id UUID REFERENCES product_variants(id),
  packaging_type_id UUID REFERENCES packaging_types(id),
  item_type VARCHAR(20) DEFAULT 'product', -- 'product', 'packaging'
  quantity INT NOT NULL,
  unit_value DECIMAL(10,2),
  total_value DECIMAL(12,2),
  reason TEXT,
  delivery_tour_id UUID REFERENCES delivery_tours(id),
  reported_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'reported', -- 'reported', 'approved', 'rejected'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 12. AUDIT LOGS (Historique complet)
-- =============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  action VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete', 'login', 'logout', 'export', 'print'
  entity_type VARCHAR(50) NOT NULL, -- 'sales_order', 'product', 'client', 'stock', 'payment', etc.
  entity_id UUID,
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- 13. NOTIFICATION PREFERENCES
-- =============================================
CREATE TABLE IF NOT EXISTS notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  low_stock_enabled BOOLEAN DEFAULT true,
  low_stock_threshold INT DEFAULT 10,
  credit_overdue_enabled BOOLEAN DEFAULT true,
  credit_overdue_days INT DEFAULT 7,
  delivery_updates_enabled BOOLEAN DEFAULT true,
  daily_report_enabled BOOLEAN DEFAULT true,
  email_enabled BOOLEAN DEFAULT true,
  sms_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_cash_sessions_company ON cash_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(company_id, status);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_company ON credit_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_client ON credit_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes(company_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_agents_company ON sales_agents(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_assignments ON agent_client_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_inventory_sessions_company ON inventory_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_depot_transfers_company ON depot_transfers(company_id);
CREATE INDEX IF NOT EXISTS idx_returns_company ON returns(company_id);
CREATE INDEX IF NOT EXISTS idx_returns_type ON returns(company_id, return_type);
CREATE INDEX IF NOT EXISTS idx_price_rules_company ON price_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_price_rules_variant ON price_rules(product_variant_id, client_type);
CREATE INDEX IF NOT EXISTS idx_promotions_company ON promotions(company_id);
CREATE INDEX IF NOT EXISTS idx_breakage_company ON breakage_records(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_company ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
