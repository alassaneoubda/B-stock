-- B-Stock — Support de l'authentification Google (OAuth)
-- Les comptes créés via Google n'ont pas de mot de passe local.
-- Idempotent.

-- 1. Le mot de passe devient optionnel (les comptes OAuth n'en ont pas)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- 2. Tracer le fournisseur d'authentification ('credentials' ou 'google')
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'credentials';

-- 3. Photo de profil (fournie par Google)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
