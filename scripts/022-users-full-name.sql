-- Ensure users.full_name exists (anciennes bases créées sans cette colonne)
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

UPDATE users
SET full_name = split_part(email, '@', 1)
WHERE full_name IS NULL OR btrim(full_name) = '';

UPDATE users
SET full_name = 'Utilisateur'
WHERE full_name IS NULL OR btrim(full_name) = '';

ALTER TABLE users ALTER COLUMN full_name SET DEFAULT 'Utilisateur';
