-- B-Stock — Paramètres plateforme (configuration globale)
-- Source de vérité unique pour la config du back office. Idempotent.

CREATE TABLE IF NOT EXISTS platform_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(255)
);

INSERT INTO platform_settings (key, value) VALUES
  ('platform_name', '"B-Stock"'),
  ('support_email', '"support@b-stock.ci"'),
  ('support_phone', '""'),
  ('default_currency', '"XOF"'),
  ('default_timezone', '"Africa/Abidjan"'),
  ('trial_days', '30'),
  ('registrations_open', 'true'),
  ('google_oauth_enabled', 'true'),
  ('maintenance_mode', 'false'),
  ('maintenance_message', '"Plateforme en maintenance. Merci de revenir dans quelques instants."')
ON CONFLICT (key) DO NOTHING;
