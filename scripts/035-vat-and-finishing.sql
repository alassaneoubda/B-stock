-- B-Stock — TVA optionnelle par entreprise, finitions métier
--
-- 1. TVA (désactivée par défaut : le comportement reste inchangé tant que le
--    propriétaire ne déclare pas l'entreprise assujettie)
--    - companies.vat_enabled           : entreprise assujettie à la TVA ;
--    - companies.vat_rate              : taux standard (18 % en Côte d'Ivoire) ;
--    - companies.vat_prices_include_tax: prix du catalogue saisis TTC (défaut) ou HT ;
--    - companies.tax_id                : numéro de compte contribuable (NCC),
--                                        imprimé sur les factures ;
--    - products.vat_rate               : taux propre au produit (NULL = taux standard,
--                                        0 = exonéré).
--    Décomposition FIGÉE au moment de l'opération (NULL = pas de TVA : entreprise
--    non assujettie à cette date) :
--    - sales_order_items / invoice_items / return_items : vat_rate, amount_ht, vat_amount
--      (le TTC reste total_price : prix de vente et paiements inchangés) ;
--    - sales_orders / invoices : total_vat (+ total_ht pour les ventes) ;
--    - credit_notes.vat_amount : TVA contenue dans un avoir (AV-…) ;
--    - purchase_order_items.vat_rate : TVA récupérable sur un achat (prix d'achat HT ;
--      NULL = achat sans TVA).
--    Les consignes d'emballage ne sont jamais soumises à la TVA.
-- 2. Alertes : délai de péremption paramétrable (companies.alert_expiry_days).
-- 3. Recherche par code-barres : index sur product_variants(barcode).
--
-- Rejouable : uniquement des IF NOT EXISTS.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 18;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_prices_include_tax BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS alert_expiry_days INT NOT NULL DEFAULT 30;

ALTER TABLE companies DROP CONSTRAINT IF EXISTS chk_companies_vat_rate;
ALTER TABLE companies ADD CONSTRAINT chk_companies_vat_rate CHECK (vat_rate BETWEEN 0 AND 100);
ALTER TABLE companies DROP CONSTRAINT IF EXISTS chk_companies_alert_expiry_days;
ALTER TABLE companies ADD CONSTRAINT chk_companies_alert_expiry_days CHECK (alert_expiry_days BETWEEN 1 AND 365);

ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2);
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_vat_rate;
ALTER TABLE products ADD CONSTRAINT chk_products_vat_rate CHECK (vat_rate IS NULL OR vat_rate BETWEEN 0 AND 100);

ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2);
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS amount_ht NUMERIC(12,2);
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2);

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS total_ht NUMERIC(12,2);
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS total_vat NUMERIC(12,2);

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS amount_ht NUMERIC(12,2);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_vat NUMERIC(12,2);

ALTER TABLE return_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2);
ALTER TABLE return_items ADD COLUMN IF NOT EXISTS amount_ht NUMERIC(12,2);
ALTER TABLE return_items ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2);
ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS vat_amount NUMERIC(12,2);

ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2);

-- Rapport TVA : ventes d'une période
CREATE INDEX IF NOT EXISTS idx_sales_orders_company_created ON sales_orders(company_id, created_at);

-- Recherche par code-barres (scan caméra / douchette)
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON product_variants(barcode)
  WHERE barcode IS NOT NULL;
