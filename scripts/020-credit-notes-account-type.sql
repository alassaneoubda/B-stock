-- B-Stock — Distinguer les créances produit vs emballage
-- Permet de générer une note de crédit par type de dette et d'imputer
-- l'encaissement sur le bon compte client (product / packaging).

ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) DEFAULT 'product';

UPDATE credit_notes SET account_type = 'product' WHERE account_type IS NULL;
