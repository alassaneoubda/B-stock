-- Anciennes bases : users.name NOT NULL sans défaut, alors que le code écrit full_name
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

UPDATE users
SET full_name = COALESCE(NULLIF(btrim(full_name), ''), NULLIF(btrim(name), ''), split_part(email, '@', 1), 'Utilisateur')
WHERE full_name IS NULL OR btrim(full_name) = '';

UPDATE users
SET name = COALESCE(NULLIF(btrim(name), ''), NULLIF(btrim(full_name), ''), split_part(email, '@', 1), 'Utilisateur')
WHERE name IS NULL OR btrim(name) = '';

ALTER TABLE users ALTER COLUMN name SET DEFAULT 'Utilisateur';
ALTER TABLE users ALTER COLUMN full_name SET DEFAULT 'Utilisateur';
