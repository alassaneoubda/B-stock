-- B-Stock — Ventes hors ligne (point de vente et « Nouvelle vente »)
--
-- Principe :
-- - Chaque vente saisie sans réseau reçoit sur l'appareil une clé unique
--   (UUID v4) : client_request_id. Elle est renvoyée telle quelle à chaque
--   tentative d'envoi (reprise après coupure, deux onglets, double clic…).
-- - Index UNIQUE (company_id, client_request_id) : garantie en base qu'une même
--   clé ne crée JAMAIS deux ventes dans une entreprise. Le serveur renvoie la
--   vente déjà créée quand la clé revient (voir lib/offline/idempotency.ts).
--   La clé est propre à chaque entreprise : la même valeur dans une autre
--   entreprise est indépendante.
-- - offline_sold_at : heure de la vente sur l'appareil (information ; la date
--   comptable reste celle de l'enregistrement sur le serveur).
--
-- Idempotente : rejouable sans effet de bord.

ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS client_request_id UUID;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS offline_sold_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_company_client_request_uidx
  ON sales_orders (company_id, client_request_id)
  WHERE client_request_id IS NOT NULL;
