-- B-Stock — Journal des événements webhook reçus (monitoring back office)
-- Permet de tracer, diagnostiquer et rejouer les webhooks GeniusPay. Idempotent.

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(30) DEFAULT 'geniuspay',
  event_type VARCHAR(80),
  reference VARCHAR(255),
  signature_valid BOOLEAN,
  status VARCHAR(30) DEFAULT 'received',   -- received | processed | failed | ignored | replayed
  error TEXT,
  payload JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_reference ON webhook_events(reference);
