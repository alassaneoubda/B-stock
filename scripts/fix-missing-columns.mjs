/**
 * Migration script: Add missing columns to existing tables.
 * Run with: node scripts/fix-missing-columns.mjs
 */
import { neon } from '@neondatabase/serverless'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Run with:\n  DATABASE_URL="your_url" node scripts/fix-missing-columns.mjs')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

async function migrate() {
  console.log('🔌 Testing database connection...')
  try {
    const result = await sql`SELECT NOW() as now`
    console.log('✅ Connected at', result[0].now)
  } catch (err) {
    console.error('❌ Connection failed:', err.message)
    process.exit(1)
  }

  console.log('\n📋 Adding missing columns...\n')

  const migrations = [
    // clients table
    { table: 'clients', column: 'gps_coordinates', type: 'VARCHAR(100)' },
    { table: 'clients', column: 'zone', type: 'VARCHAR(100)' },
    { table: 'clients', column: 'packaging_credit_limit', type: 'DECIMAL(12,2) DEFAULT 0' },
    { table: 'clients', column: 'payment_terms_days', type: 'INT DEFAULT 0' },
    { table: 'clients', column: 'notes', type: 'TEXT' },
    { table: 'clients', column: 'is_active', type: 'BOOLEAN DEFAULT true' },
    { table: 'clients', column: 'updated_at', type: 'TIMESTAMP DEFAULT NOW()' },
    // packaging_types table
    { table: 'packaging_types', column: 'description', type: 'TEXT' },
    // products table
    { table: 'products', column: 'description', type: 'TEXT' },
    { table: 'products', column: 'brand', type: 'VARCHAR(100)' },
    { table: 'products', column: 'image_url', type: 'TEXT' },
    { table: 'products', column: 'is_active', type: 'BOOLEAN DEFAULT true' },
    { table: 'products', column: 'updated_at', type: 'TIMESTAMP DEFAULT NOW()' },
    // sales_orders table
    { table: 'sales_orders', column: 'paid_amount_products', type: 'DECIMAL(12,2) DEFAULT 0' },
    { table: 'sales_orders', column: 'paid_amount_packaging', type: 'DECIMAL(12,2) DEFAULT 0' },
    // users table
    { table: 'users', column: 'permissions', type: "JSONB DEFAULT '[]'" },
  ]

  for (const m of migrations) {
    try {
      await sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = ${m.table} AND column_name = ${m.column}
      `.then(async (rows) => {
        if (rows.length === 0) {
          // Column doesn't exist, add it
          // We have to use raw string for ALTER TABLE since neon tagged templates don't support DDL identifiers
          await sql(
            `ALTER TABLE ${m.table} ADD COLUMN ${m.column} ${m.type}`
          )
          console.log(`  ✅ Added ${m.table}.${m.column} (${m.type})`)
        } else {
          console.log(`  ⏭️  ${m.table}.${m.column} already exists`)
        }
      })
    } catch (err) {
      console.error(`  ❌ Failed ${m.table}.${m.column}:`, err.message)
    }
  }

  console.log('\n✅ Migration complete!')
}

migrate().catch(console.error)
