/**
 * Migration script: Create all missing tables from the schema.
 * Run with: DATABASE_URL="..." node scripts/fix-missing-tables.mjs
 */
import { neon } from '@neondatabase/serverless'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set.')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

async function migrate() {
  console.log('🔌 Testing database connection...')
  const result = await sql`SELECT NOW() as now`
  console.log('✅ Connected at', result[0].now)

  console.log('\n📋 Creating missing tables...\n')

  const statements = [
    {
      name: 'sales_order_packaging_items',
      sql: `CREATE TABLE IF NOT EXISTS sales_order_packaging_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sales_order_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
        packaging_type_id UUID REFERENCES packaging_types(id),
        quantity_out INT DEFAULT 0,
        quantity_in INT DEFAULT 0,
        unit_price DECIMAL(10,2),
        created_at TIMESTAMP DEFAULT NOW()
      )`
    },
    {
      name: 'packaging_transactions',
      sql: `CREATE TABLE IF NOT EXISTS packaging_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        client_id UUID REFERENCES clients(id),
        sales_order_id UUID REFERENCES sales_orders(id),
        packaging_type_id UUID REFERENCES packaging_types(id),
        transaction_type VARCHAR(50),
        quantity INT NOT NULL,
        unit_price DECIMAL(10,2),
        total_amount DECIMAL(10,2),
        notes TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )`
    },
    {
      name: 'payments',
      sql: `CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        client_id UUID REFERENCES clients(id),
        sales_order_id UUID REFERENCES sales_orders(id),
        amount DECIMAL(12,2) NOT NULL,
        payment_method VARCHAR(50),
        payment_type VARCHAR(50),
        status VARCHAR(50) DEFAULT 'completed',
        reference VARCHAR(255),
        notes TEXT,
        received_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )`
    },
    {
      name: 'vehicles',
      sql: `CREATE TABLE IF NOT EXISTS vehicles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        name VARCHAR(100),
        plate_number VARCHAR(50) NOT NULL,
        vehicle_type VARCHAR(50) DEFAULT 'truck',
        capacity_cases INT,
        driver_name VARCHAR(255),
        driver_phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )`
    },
    {
      name: 'delivery_tours',
      sql: `CREATE TABLE IF NOT EXISTS delivery_tours (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        vehicle_id UUID REFERENCES vehicles(id),
        depot_id UUID REFERENCES depots(id),
        tour_date DATE NOT NULL,
        status VARCHAR(50) DEFAULT 'planned',
        driver_name VARCHAR(255),
        notes TEXT,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )`
    },
    {
      name: 'tour_stops',
      sql: `CREATE TABLE IF NOT EXISTS tour_stops (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_tour_id UUID REFERENCES delivery_tours(id) ON DELETE CASCADE,
        sales_order_id UUID REFERENCES sales_orders(id),
        client_id UUID REFERENCES clients(id),
        stop_order INT,
        status VARCHAR(50) DEFAULT 'pending',
        delivered_at TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )`
    },
    {
      name: 'vehicle_inventory',
      sql: `CREATE TABLE IF NOT EXISTS vehicle_inventory (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_tour_id UUID REFERENCES delivery_tours(id) ON DELETE CASCADE,
        product_variant_id UUID REFERENCES product_variants(id),
        packaging_type_id UUID REFERENCES packaging_types(id),
        inventory_type VARCHAR(50),
        loaded_quantity INT DEFAULT 0,
        unloaded_quantity INT DEFAULT 0,
        returned_quantity INT DEFAULT 0,
        damaged_quantity INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )`
    },
    {
      name: 'stock_movements',
      sql: `CREATE TABLE IF NOT EXISTS stock_movements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        depot_id UUID REFERENCES depots(id),
        product_variant_id UUID REFERENCES product_variants(id),
        movement_type VARCHAR(50),
        quantity INT NOT NULL,
        reference_type VARCHAR(50),
        reference_id UUID,
        lot_number VARCHAR(100),
        notes TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      )`
    },
    {
      name: 'alerts',
      sql: `CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        alert_type VARCHAR(50),
        severity VARCHAR(20) DEFAULT 'medium',
        title VARCHAR(255) NOT NULL,
        message TEXT,
        reference_type VARCHAR(50),
        reference_id UUID,
        is_read BOOLEAN DEFAULT false,
        is_resolved BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )`
    },
    {
      name: 'subscription_plans',
      sql: `CREATE TABLE IF NOT EXISTS subscription_plans (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
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
      )`
    },
  ]

  for (const stmt of statements) {
    try {
      await sql(stmt.sql)
      console.log(`  ✅ ${stmt.name} — OK`)
    } catch (err) {
      console.error(`  ❌ ${stmt.name}:`, err.message)
    }
  }

  // Create indexes
  console.log('\n📋 Creating indexes...\n')
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_packaging_stock_depot ON packaging_stock(depot_id)',
    'CREATE INDEX IF NOT EXISTS idx_stock_movements_company ON stock_movements(company_id)',
    'CREATE INDEX IF NOT EXISTS idx_alerts_company ON alerts(company_id)',
    "CREATE INDEX IF NOT EXISTS idx_alerts_unread ON alerts(company_id, is_read) WHERE is_read = false",
  ]
  for (const idx of indexes) {
    try {
      await sql(idx)
      console.log('  ✅ Index OK')
    } catch (err) {
      console.error('  ❌ Index:', err.message)
    }
  }

  console.log('\n✅ All migrations complete!')
}

migrate().catch(console.error)
