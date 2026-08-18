-- Anciennes bases : table companies sans slug (001 non rejouée intégralement)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS slug VARCHAR(255);

UPDATE companies
SET slug = lower(regexp_replace(coalesce(name, 'company'), '[^a-zA-Z0-9]+', '-', 'g'))
  || '-' || substr(replace(id::text, '-', ''), 1, 8)
WHERE slug IS NULL OR btrim(slug) = '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_slug ON companies(slug);
