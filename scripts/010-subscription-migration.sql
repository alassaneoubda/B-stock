-- Subscription system migration
-- Add subscription_ends_at and subscription_plan_name to companies

ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMP;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS subscription_plan_name VARCHAR(100);
