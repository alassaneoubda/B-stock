import { readFileSync } from 'fs'
import { neon } from '@neondatabase/serverless'

// Load .env.local
const envContent = readFileSync('.env.local', 'utf-8')
let dbUrl = envContent.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=')?.trim()

if (!dbUrl) {
  console.error('DATABASE_URL not found in .env.local')
  process.exit(1)
}

// Strip surrounding quotes if present
dbUrl = dbUrl.replace(/^["']|["']$/g, '')

const sql = neon(dbUrl)

async function run() {
  console.log('Running migration: add paid_amount_products/paid_amount_packaging...')
  
  await sql`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS paid_amount_products DECIMAL(12,2) DEFAULT 0`
  console.log('  ✓ Added paid_amount_products')
  
  await sql`ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS paid_amount_packaging DECIMAL(12,2) DEFAULT 0`
  console.log('  ✓ Added paid_amount_packaging')
  
  await sql`
    UPDATE sales_orders
    SET
      paid_amount_products = LEAST(subtotal, paid_amount),
      paid_amount_packaging = GREATEST(0, paid_amount - subtotal)
    WHERE paid_amount > 0 AND paid_amount_products = 0
  `
  console.log('  ✓ Backfilled existing orders')
  
  console.log('Migration complete!')
}

run().catch(err => { console.error('Migration failed:', err); process.exit(1) })
