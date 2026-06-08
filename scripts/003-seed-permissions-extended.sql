-- B-Stock — Extension des permissions pour les modules ajoutés après le seed initial
-- (caisse, crédits, retours, inventaire, transferts, casse, agents, pricing, factures, audit)
-- À exécuter APRÈS 002-seed-permissions.sql.
-- Idempotent grâce à ON CONFLICT (role, permission) DO NOTHING.

INSERT INTO role_permissions (role, permission) VALUES
  -- ========== OWNER (accès complet, pour cohérence — le code accorde déjà le bypass) ==========
  ('owner', 'cash.read'), ('owner', 'cash.write'), ('owner', 'cash.manage'),
  ('owner', 'credits.read'), ('owner', 'credits.write'),
  ('owner', 'returns.read'), ('owner', 'returns.write'), ('owner', 'returns.process'),
  ('owner', 'inventory.read'), ('owner', 'inventory.write'),
  ('owner', 'transfers.read'), ('owner', 'transfers.write'),
  ('owner', 'breakage.read'), ('owner', 'breakage.write'), ('owner', 'breakage.approve'),
  ('owner', 'agents.read'), ('owner', 'agents.write'),
  ('owner', 'pricing.read'), ('owner', 'pricing.write'),
  ('owner', 'invoices.read'), ('owner', 'invoices.write'),
  ('owner', 'audit.read'),

  -- ========== MANAGER (gestion large) ==========
  ('manager', 'cash.read'), ('manager', 'cash.write'), ('manager', 'cash.manage'),
  ('manager', 'credits.read'), ('manager', 'credits.write'),
  ('manager', 'returns.read'), ('manager', 'returns.write'), ('manager', 'returns.process'),
  ('manager', 'inventory.read'), ('manager', 'inventory.write'),
  ('manager', 'transfers.read'), ('manager', 'transfers.write'),
  ('manager', 'breakage.read'), ('manager', 'breakage.write'), ('manager', 'breakage.approve'),
  ('manager', 'agents.read'), ('manager', 'agents.write'),
  ('manager', 'pricing.read'), ('manager', 'pricing.write'),
  ('manager', 'invoices.read'), ('manager', 'invoices.write'),
  ('manager', 'audit.read'),

  -- ========== CASHIER (encaissement, caisse, crédits, retours, factures) ==========
  ('cashier', 'cash.read'), ('cashier', 'cash.write'),
  ('cashier', 'credits.read'), ('cashier', 'credits.write'),
  ('cashier', 'returns.read'), ('cashier', 'returns.write'),
  ('cashier', 'invoices.read'),
  ('cashier', 'pricing.read'),

  -- ========== WAREHOUSE_KEEPER (stock, inventaire, transferts, casse) ==========
  ('warehouse_keeper', 'inventory.read'), ('warehouse_keeper', 'inventory.write'),
  ('warehouse_keeper', 'transfers.read'), ('warehouse_keeper', 'transfers.write'),
  ('warehouse_keeper', 'breakage.read'), ('warehouse_keeper', 'breakage.write'),
  ('warehouse_keeper', 'returns.read'),
  ('warehouse_keeper', 'invoices.read')
ON CONFLICT (role, permission) DO NOTHING;
