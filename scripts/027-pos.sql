-- B-Stock — Point de vente (maquis, bars, vente au comptoir). Idempotent.
--
-- Une commande POS (« ticket ») reste OUVERTE tant que la table consomme :
-- on y ajoute des articles au fil du service, on peut la mettre en attente,
-- la transférer de table, puis l'encaisser. L'encaissement crée une vente
-- classique (lib/domain/sales.ts) : stock, facture, caisse et créance restent
-- cohérents avec le reste de l'application.

-- Client « passage » (vente au comptoir sans client identifié), un par entreprise
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_walk_in BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_walk_in ON clients(company_id) WHERE is_walk_in = true;

-- Tables / emplacements du maquis
CREATE TABLE IF NOT EXISTS pos_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  depot_id UUID REFERENCES depots(id) ON DELETE SET NULL,
  name VARCHAR(50) NOT NULL,
  area VARCHAR(50),                    -- ex. « Terrasse », « Salle », « VIP »
  seats INT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_tables_name ON pos_tables(company_id, lower(name)) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pos_tables_company ON pos_tables(company_id, sort_order);

-- Tickets (commandes ouvertes, encaissées ou annulées)
CREATE TABLE IF NOT EXISTS pos_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  depot_id UUID NOT NULL REFERENCES depots(id),
  table_id UUID REFERENCES pos_tables(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id),           -- client identifié (ardoise possible)
  ticket_number VARCHAR(30) NOT NULL,
  order_type VARCHAR(20) NOT NULL DEFAULT 'table', -- table | counter | takeaway
  label VARCHAR(100),                               -- ex. « Kouamé », « Groupe terrasse »
  covers INT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',       -- open | paid | cancelled
  notes TEXT,
  sales_order_id UUID REFERENCES sales_orders(id),
  cancel_reason TEXT,
  opened_by UUID REFERENCES users(id),
  closed_by UUID REFERENCES users(id),
  opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_orders_company_number ON pos_orders(company_id, ticket_number);
CREATE INDEX IF NOT EXISTS idx_pos_orders_open ON pos_orders(company_id, status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_pos_orders_company_opened ON pos_orders(company_id, opened_at DESC);
-- Une seule commande ouverte par table
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_orders_open_table ON pos_orders(table_id) WHERE status = 'open' AND table_id IS NOT NULL;

-- Lignes de ticket
CREATE TABLE IF NOT EXISTS pos_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_order_id UUID NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  product_variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  status VARCHAR(10) NOT NULL DEFAULT 'active',     -- active | void
  void_reason TEXT,
  voided_by UUID REFERENCES users(id),
  voided_at TIMESTAMP,
  added_by UUID REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_order_items_order ON pos_order_items(pos_order_id);
CREATE INDEX IF NOT EXISTS idx_pos_order_items_variant_active ON pos_order_items(product_variant_id) WHERE status = 'active';

-- Permissions : pos.use (prendre des commandes, encaisser) / pos.manage (tables, annulations)
INSERT INTO role_permissions (role, permission) VALUES
  ('owner', 'pos.use'), ('owner', 'pos.manage'),
  ('manager', 'pos.use'), ('manager', 'pos.manage'),
  ('cashier', 'pos.use')
ON CONFLICT (role, permission) DO NOTHING;
