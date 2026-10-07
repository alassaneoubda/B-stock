-- B-Stock — Valorisation du stock au coût moyen pondéré (CMP) et marge réelle
--
-- Principe :
-- - stock_costs : CMP courant par (dépôt, variante). Recalculé à chaque entrée
--   valorisée (réception d'achat, transfert entrant, retour client, annulation
--   de vente) : CMP = (qté avant × CMP avant + qté entrée × coût entrée) / qté après.
--   Les sorties ne modifient pas le CMP.
-- - stock_movements.unit_cost : coût unitaire figé au moment du mouvement
--   (coût d'entrée pour une entrée, CMP pour une sortie). La valeur du stock à
--   une date passée se reconstitue à partir de ces mouvements.
-- - sales_order_items.unit_cost / pos_order_items.unit_cost : coût de revient
--   figé au moment de la vente (marge brute réelle).
--
-- Reprise de l'existant : le CMP et les coûts manquants sont initialisés depuis
-- le prix d'achat actuel de la variante (product_variants.cost_price) — c'est
-- une estimation pour l'historique antérieur à cette migration.

CREATE TABLE IF NOT EXISTS stock_costs (
  depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  avg_cost NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (avg_cost >= 0),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (depot_id, product_variant_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_costs_variant ON stock_costs(product_variant_id);

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14,4);
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14,4);
ALTER TABLE pos_order_items ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(14,4);

-- Recherches par pièce d'origine (annulation de vente, retours, marge)
CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_type, reference_id);
-- Valeur du stock à une date : mouvements postérieurs à la date, par entreprise
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_created_asc ON stock_movements(company_id, created_at);

-- CMP initial des couples (dépôt, variante) déjà en stock
INSERT INTO stock_costs (depot_id, product_variant_id, avg_cost)
SELECT DISTINCT s.depot_id, s.product_variant_id, COALESCE(pv.cost_price, 0)
FROM stock s
JOIN product_variants pv ON pv.id = s.product_variant_id
WHERE s.depot_id IS NOT NULL
ON CONFLICT (depot_id, product_variant_id) DO NOTHING;

-- Coûts historiques manquants : estimés au prix d'achat actuel
UPDATE stock_movements sm SET unit_cost = pv.cost_price
FROM product_variants pv
WHERE pv.id = sm.product_variant_id AND sm.unit_cost IS NULL AND pv.cost_price IS NOT NULL;

UPDATE sales_order_items soi SET unit_cost = pv.cost_price
FROM product_variants pv
WHERE pv.id = soi.product_variant_id AND soi.unit_cost IS NULL AND pv.cost_price IS NOT NULL;

UPDATE pos_order_items poi SET unit_cost = pv.cost_price
FROM product_variants pv, pos_orders po
WHERE pv.id = poi.product_variant_id AND po.id = poi.pos_order_id AND po.status = 'paid'
  AND poi.unit_cost IS NULL AND pv.cost_price IS NOT NULL;
