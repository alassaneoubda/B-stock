-- Le code prod actuel n'écrit pas users.name (NOT NULL) → inscription 500
ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN name SET DEFAULT 'Utilisateur';
ALTER TABLE users ALTER COLUMN full_name SET DEFAULT 'Utilisateur';
