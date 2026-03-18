-- Seed Subscription Plans
INSERT INTO subscription_plans (name, price_monthly, price_yearly, max_users, max_depots, max_products, features, is_active) VALUES
  (
    'starter',
    15000, -- 15,000 FCFA/month
    150000, -- 150,000 FCFA/year (2 months free)
    3,
    1,
    50,
    '{"support": "email", "reports": "basic", "mobile_money": true, "api_access": false}',
    true
  ),
  (
    'professional',
    35000, -- 35,000 FCFA/month
    350000, -- 350,000 FCFA/year (2 months free)
    10,
    3,
    200,
    '{"support": "priority", "reports": "advanced", "mobile_money": true, "api_access": true, "multi_depot": true}',
    true
  ),
  (
    'enterprise',
    75000, -- 75,000 FCFA/month
    750000, -- 750,000 FCFA/year (2 months free)
    -1, -- unlimited
    -1, -- unlimited
    -1, -- unlimited
    '{"support": "dedicated", "reports": "custom", "mobile_money": true, "api_access": true, "multi_depot": true, "custom_branding": true, "training": true}',
    true
  )
ON CONFLICT DO NOTHING;
