-- B-Stock — Ouverture de casier (déconditionnement) et inventaire tournant
--
-- 1. Déconditionnement
--    Une variante « conditionnement » (ex. Bock 66 cl · Casier de 12) peut être liée à
--    une variante « unité » du même produit (ex. Bock 66 cl · Bouteille) via
--    product_variants.unit_variant_id. Ouvrir N casiers = sortie de N casiers et
--    entrée de N × units_per_case bouteilles, au coût du casier / units_per_case
--    (la valeur du stock est conservée). Chaque ouverture est tracée dans
--    stock_unpacks ; les deux mouvements de stock sont de type 'unpack'.
-- 2. Réglage du point de vente : ouverture automatique d'un casier quand le stock
--    à l'unité est insuffisant (companies.pos_auto_unpack, désactivé par défaut :
--    le serveur doit confirmer).
-- 3. Inventaire tournant : inventaire partiel (catégorie, marque, sélection, produits
--    les moins récemment comptés) + date du dernier comptage par (dépôt, variante).
--
-- Rejouable : uniquement des IF NOT EXISTS.

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS unit_variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_product_variants_unit_variant ON product_variants(unit_variant_id)
  WHERE unit_variant_id IS NOT NULL;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS pos_auto_unpack BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS stock_unpacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
  pack_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  unit_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  packs INT NOT NULL CHECK (packs > 0),
  units INT NOT NULL CHECK (units > 0),
  pack_unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  source VARCHAR(20) NOT NULL DEFAULT 'manual', -- 'manual' | 'pos'
  pos_order_id UUID REFERENCES pos_orders(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_unpacks_company_created ON stock_unpacks(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_unpacks_pack ON stock_unpacks(pack_variant_id);

-- Inventaire partiel : périmètre retenu à la création (type + critère), pour l'affichage
ALTER TABLE inventory_sessions ADD COLUMN IF NOT EXISTS scope JSONB;

-- Date du dernier comptage par (dépôt, variante)
CREATE TABLE IF NOT EXISTS stock_counts (
  depot_id UUID NOT NULL REFERENCES depots(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  last_counted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_inventory_id UUID REFERENCES inventory_sessions(id) ON DELETE SET NULL,
  PRIMARY KEY (depot_id, product_variant_id)
);

-- Reprise : dernier comptage connu d'après les inventaires terminés existants
INSERT INTO stock_counts (depot_id, product_variant_id, last_counted_at, last_inventory_id)
SELECT DISTINCT ON (s.depot_id, ii.product_variant_id)
       s.depot_id, ii.product_variant_id, COALESCE(ii.counted_at, s.completed_at, s.created_at), s.id
FROM inventory_items ii
JOIN inventory_sessions s ON s.id = ii.inventory_session_id
WHERE s.status = 'completed' AND s.depot_id IS NOT NULL
  AND ii.product_variant_id IS NOT NULL AND ii.counted_quantity IS NOT NULL
ORDER BY s.depot_id, ii.product_variant_id, COALESCE(ii.counted_at, s.completed_at, s.created_at) DESC
ON CONFLICT (depot_id, product_variant_id) DO NOTHING;
