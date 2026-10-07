-- B-Stock — Catalogue par conditionnement (casier, pack, carton)
-- Un produit (ex. « Bock ») porte plusieurs formats (variantes) : 66 cl en casier de 12,
-- 100 cl en casier de 6… Le nombre d'unités par conditionnement est porté par
-- l'emballage de chaque variante (packaging_types.units_per_case), jamais global.

-- Référence catalogue de la variante : permet d'ajouter plus tard un format manquant
-- à un produit déjà chargé sans dupliquer ceux qui existent.
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS sku VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_sku ON product_variants(product_id, sku);
