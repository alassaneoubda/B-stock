-- Migration: Add paid_amount_products and paid_amount_packaging to sales_orders
-- These columns track how payment is allocated between product debt and packaging debt

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS paid_amount_products DECIMAL(12,2) DEFAULT 0;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS paid_amount_packaging DECIMAL(12,2) DEFAULT 0;

-- Backfill existing orders: allocate paid_amount to products first, then packaging
UPDATE sales_orders
SET
  paid_amount_products = LEAST(subtotal, paid_amount),
  paid_amount_packaging = GREATEST(0, paid_amount - subtotal)
WHERE paid_amount > 0 AND paid_amount_products = 0;
