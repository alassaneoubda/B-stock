import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

async function createInvoicesTables() {
  console.log('Creating invoices tables...')

  await sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_number VARCHAR(50) NOT NULL UNIQUE,
      type VARCHAR(20) NOT NULL CHECK (type IN ('client', 'supplier')),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
      order_id UUID,
      total_ht DECIMAL(12,2) DEFAULT 0,
      total_ttc DECIMAL(12,2) DEFAULT 0,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      amount_paid DECIMAL(12,2) DEFAULT 0,
      remaining_amount DECIMAL(12,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'partial', 'cancelled')),
      notes TEXT,
      pdf_url TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `
  console.log('  ✓ invoices table created')

  await sql`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id UUID REFERENCES products(id) ON DELETE SET NULL,
      description TEXT,
      quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
      unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
      total_price DECIMAL(12,2) NOT NULL DEFAULT 0,
      item_type VARCHAR(20) DEFAULT 'product' CHECK (item_type IN ('product', 'packaging', 'service')),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `
  console.log('  ✓ invoice_items table created')

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(type)`
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)`
  console.log('  ✓ indexes created')

  console.log('Done! Invoice tables ready.')
}

createInvoicesTables().catch(console.error)
