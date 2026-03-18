-- B-Stock SaaS - Database Schema
-- Multi-tenant beverage distribution and stock management

-- 1. Companies (Multi-tenant)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  sector VARCHAR(100), -- 'distributor', 'wholesaler', 'semi_wholesaler', 'depot'
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  logo_url TEXT,
  currency VARCHAR(10) DEFAULT 'XOF',
  timezone VARCHAR(50) DEFAULT 'Africa/Abidjan',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  subscription_status VARCHAR(50) DEFAULT 'trialing', -- 'trialing', 'active', 'past_due', 'canceled'
  subscription_plan_id UUID,
  trial_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'owner', 'manager', 'cashier', 'warehouse_keeper'
  phone VARCHAR(20),
  permissions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Role Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(50) NOT NULL,
  permission VARCHAR(100) NOT NULL,
  UNIQUE(role, permission)
);

-- 4. Products
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  category VARCHAR(100), -- 'beer', 'soft_drink', 'water', etc.
  brand VARCHAR(100), -- 'Solibra', 'Brassivoire', etc.
  description TEXT,
  base_unit VARCHAR(50) DEFAULT 'casier',
  purchase_price DECIMAL(10,2) DEFAULT 0,
  selling_price DECIMAL(10,2) DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. Packaging Types (50cl, 66cl, 90cl, etc.)
CREATE TABLE IF NOT EXISTS packaging_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL, -- '50cl', '66cl', '90cl', 'Casier 12', 'Casier 24'
  description TEXT,
  units_per_case INT DEFAULT 1,
  is_returnable BOOLEAN DEFAULT true,
  deposit_price DECIMAL(10,2) DEFAULT 0, -- Consigne
  created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Product Variants (Product + Packaging)
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  packaging_type_id UUID REFERENCES packaging_types(id),
  barcode VARCHAR(100),
  price DECIMAL(10,2) NOT NULL,
  cost_price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 7. Packaging Equivalences (Interchangeable packaging)
CREATE TABLE IF NOT EXISTS packaging_equivalences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packaging_type_a UUID REFERENCES packaging_types(id),
  packaging_type_b UUID REFERENCES packaging_types(id),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Depots/Warehouses
CREATE TABLE IF NOT EXISTS depots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(20),
  is_main BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 9. Stock (by depot, product variant, and lot)
CREATE TABLE IF NOT EXISTS stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_id UUID REFERENCES depots(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id),
  lot_number VARCHAR(100),
  quantity INT NOT NULL DEFAULT 0,
  expiry_date DATE,
  min_stock_alert INT DEFAULT 10,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 10. Packaging Stock (empty cases/bottles by depot)
CREATE TABLE IF NOT EXISTS packaging_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  depot_id UUID REFERENCES depots(id) ON DELETE CASCADE,
  packaging_type_id UUID REFERENCES packaging_types(id),
  quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 11. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50), -- 'manufacturer', 'distributor', 'wholesaler'
  contact_name VARCHAR(255),
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 12. Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id),
  depot_id UUID REFERENCES depots(id),
  order_number VARCHAR(100) UNIQUE,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'received', 'partial', 'cancelled'
  total_amount DECIMAL(12,2),
  notes TEXT,
  ordered_at TIMESTAMP DEFAULT NOW(),
  expected_delivery_at DATE,
  received_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 13. Purchase Order Items
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id),
  quantity_ordered INT NOT NULL,
  quantity_received INT DEFAULT 0,
  quantity_damaged INT DEFAULT 0,
  unit_price DECIMAL(10,2),
  lot_number VARCHAR(100),
  expiry_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 14. Clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  client_type VARCHAR(50), -- 'retail', 'wholesale', 'restaurant', 'bar', 'subdepot'
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  gps_coordinates VARCHAR(100),
  zone VARCHAR(100),
  credit_limit DECIMAL(12,2) DEFAULT 0, -- Plafond credit
  packaging_credit_limit DECIMAL(12,2) DEFAULT 0,
  payment_terms_days INT DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 15. Client Accounts (separate for products and packaging)
CREATE TABLE IF NOT EXISTS client_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  account_type VARCHAR(50) NOT NULL, -- 'product', 'packaging'
  balance DECIMAL(12,2) DEFAULT 0, -- Negative = client owes money
  last_transaction_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 16. Sales Orders
CREATE TABLE IF NOT EXISTS sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  depot_id UUID REFERENCES depots(id),
  order_number VARCHAR(100) UNIQUE,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'
  order_source VARCHAR(50), -- 'in_person', 'phone', 'whatsapp', 'other'
  subtotal DECIMAL(12,2),
  packaging_total DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2),
  paid_amount DECIMAL(12,2) DEFAULT 0,
  paid_amount_products DECIMAL(12,2) DEFAULT 0,
  paid_amount_packaging DECIMAL(12,2) DEFAULT 0,
  payment_method VARCHAR(50), -- 'cash', 'mobile_money', 'credit', 'mixed'
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 17. Sales Order Items
CREATE TABLE IF NOT EXISTS sales_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id),
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  lot_number VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 18. Sales Order Packaging Items (emballages in/out per sale)
CREATE TABLE IF NOT EXISTS sales_order_packaging_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
  packaging_type_id UUID REFERENCES packaging_types(id),
  quantity_out INT DEFAULT 0,  -- casiers donnés au client
  quantity_in INT DEFAULT 0,   -- casiers retournés par le client
  unit_price DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 19. Packaging Transactions (returns, debts — historical log)
CREATE TABLE IF NOT EXISTS packaging_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  sales_order_id UUID REFERENCES sales_orders(id),
  packaging_type_id UUID REFERENCES packaging_types(id),
  transaction_type VARCHAR(50), -- 'given', 'returned', 'debt'
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2),
  total_amount DECIMAL(10,2),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 20. Payments
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id),
  sales_order_id UUID REFERENCES sales_orders(id),
  amount DECIMAL(12,2) NOT NULL,
  payment_method VARCHAR(50), -- 'cash', 'orange_money', 'mtn_money', 'wave', 'bank_transfer'
  payment_type VARCHAR(50), -- 'product', 'packaging'
  status VARCHAR(50) DEFAULT 'completed', -- 'pending', 'completed', 'failed', 'refunded'
  reference VARCHAR(255), -- Mobile Money reference
  notes TEXT,
  received_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 21. Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(100),
  plate_number VARCHAR(50) NOT NULL,
  vehicle_type VARCHAR(50) DEFAULT 'truck', -- 'truck', 'tricycle', 'van'
  capacity_cases INT,
  driver_name VARCHAR(255),
  driver_phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 22. Delivery Tours
CREATE TABLE IF NOT EXISTS delivery_tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES vehicles(id),
  depot_id UUID REFERENCES depots(id),
  tour_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'planned', -- 'planned', 'loading', 'in_progress', 'completed', 'cancelled'
  driver_name VARCHAR(255),
  notes TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 23. Tour Stops (deliveries in a tour)
CREATE TABLE IF NOT EXISTS tour_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_tour_id UUID REFERENCES delivery_tours(id) ON DELETE CASCADE,
  sales_order_id UUID REFERENCES sales_orders(id),
  client_id UUID REFERENCES clients(id),
  stop_order INT,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'delivered', 'partial', 'failed'
  delivered_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 24. Vehicle Inventory (loading/unloading)
CREATE TABLE IF NOT EXISTS vehicle_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_tour_id UUID REFERENCES delivery_tours(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id),
  packaging_type_id UUID REFERENCES packaging_types(id),
  inventory_type VARCHAR(50), -- 'product', 'packaging'
  loaded_quantity INT DEFAULT 0,
  unloaded_quantity INT DEFAULT 0,
  returned_quantity INT DEFAULT 0,
  damaged_quantity INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 25. Stock Movements (audit trail)
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  depot_id UUID REFERENCES depots(id),
  product_variant_id UUID REFERENCES product_variants(id),
  movement_type VARCHAR(50), -- 'purchase', 'sale', 'return', 'adjustment', 'transfer', 'damage'
  quantity INT NOT NULL, -- positive for in, negative for out
  reference_type VARCHAR(50), -- 'purchase_order', 'sales_order', 'adjustment', 'tour'
  reference_id UUID,
  lot_number VARCHAR(100),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 26. Alerts
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  alert_type VARCHAR(50), -- 'low_stock', 'expiry', 'credit_limit', 'packaging_debt', 'payment_overdue'
  severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  title VARCHAR(255) NOT NULL,
  message TEXT,
  reference_type VARCHAR(50),
  reference_id UUID,
  is_read BOOLEAN DEFAULT false,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 27. Subscription Plans (for SaaS)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL, -- 'starter', 'professional', 'enterprise'
  description TEXT,
  stripe_price_id VARCHAR(255),
  price_monthly DECIMAL(10,2),
  price_yearly DECIMAL(10,2),
  max_users INT,
  max_depots INT,
  max_products INT,
  max_clients INT DEFAULT -1,
  features JSONB,
  stripe_price_id_monthly VARCHAR(255),
  stripe_price_id_yearly VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_depot ON stock(depot_id);
CREATE INDEX IF NOT EXISTS idx_stock_product ON stock(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_company ON sales_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_client ON sales_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_alerts_company ON alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts(company_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_packaging_stock_depot ON packaging_stock(depot_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_company ON stock_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_company ON payments(company_id);
