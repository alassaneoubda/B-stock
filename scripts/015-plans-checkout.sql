-- B-Stock — Unification des plans : la table subscription_plans devient la
-- source unique pour le checkout GeniusPay (tarifs par intervalle, features
-- marketing, nom d'affichage, visibilité). Idempotent.

-- Colonnes cœur (si la table existait déjà avec un schéma incomplet)
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255);
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_monthly DECIMAL(10,2);
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS price_yearly DECIMAL(10,2);
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_users INT;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_depots INT;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_products INT;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS max_clients INT DEFAULT -1;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS features JSONB;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id_monthly VARCHAR(255);
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS stripe_price_id_yearly VARCHAR(255);
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Colonnes checkout / marketing
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS display_name VARCHAR(150);
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_popular BOOLEAN DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS checkout_prices JSONB;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS marketing_features JSONB;

-- Index unique requis pour ON CONFLICT (name)
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_plans_name ON subscription_plans(name);

-- Les anciens plans (starter/professional/enterprise) ne sont plus exposés au checkout
UPDATE subscription_plans SET is_public = false
WHERE name IN ('starter', 'professional', 'enterprise');

-- Plans canoniques (repris de l'ancienne config codée en dur)
INSERT INTO subscription_plans
  (name, display_name, description, price_monthly, price_yearly,
   max_users, max_depots, max_products, max_clients,
   is_active, is_public, is_popular, sort_order, checkout_prices, marketing_features)
VALUES
  (
    'essentiel', 'Pack Essentiel', 'Pour les petits commerces et dépôts',
    25000, 250000, 3, 1, 200, -1, true, true, false, 1,
    '[{"interval":"monthly","months":1,"price":25000,"label":"25 000 XOF / mois"},{"interval":"quarterly","months":3,"price":70000,"label":"70 000 XOF / 3 mois"},{"interval":"semiannual","months":6,"price":130000,"label":"130 000 XOF / 6 mois"},{"interval":"yearly","months":12,"price":250000,"label":"250 000 XOF / an"}]'::jsonb,
    '["Gestion des ventes","Gestion du stock","Gestion des clients","Factures automatiques","Support email"]'::jsonb
  ),
  (
    'business', 'Pack Business', 'Pour les distributeurs et grossistes',
    45000, 500000, 10, 5, -1, -1, true, true, true, 2,
    '[{"interval":"monthly","months":1,"price":45000,"label":"45 000 XOF / mois"},{"interval":"quarterly","months":3,"price":130000,"label":"130 000 XOF / 3 mois"},{"interval":"semiannual","months":6,"price":250000,"label":"250 000 XOF / 6 mois"},{"interval":"yearly","months":12,"price":500000,"label":"500 000 XOF / an"}]'::jsonb,
    '["Tout du Pack Essentiel","Multi-dépôts","Rapports avancés","Gestion des tournées","Support prioritaire","Accès API"]'::jsonb
  ),
  (
    'entreprise', 'Pack Entreprise', 'Pour les grandes entreprises — accès complet',
    0, 0, -1, -1, -1, -1, true, true, false, 3,
    '[{"interval":"yearly","months":12,"price":0,"label":"0 XOF / an"}]'::jsonb,
    '["Tout du Pack Business","Utilisateurs illimités","Dépôts illimités","Branding personnalisé","Formation dédiée","Support dédié 24/7"]'::jsonb
  )
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  max_users = EXCLUDED.max_users,
  max_depots = EXCLUDED.max_depots,
  max_products = EXCLUDED.max_products,
  max_clients = EXCLUDED.max_clients,
  is_active = EXCLUDED.is_active,
  is_public = EXCLUDED.is_public,
  is_popular = EXCLUDED.is_popular,
  sort_order = EXCLUDED.sort_order,
  checkout_prices = EXCLUDED.checkout_prices,
  marketing_features = EXCLUDED.marketing_features;
