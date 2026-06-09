-- B-Stock — Onboarding des nouvelles sociétés
-- onboarding_completed = false force l'utilisateur à renseigner le nom de sa société.
-- DEFAULT true => les sociétés existantes et les inscriptions email (qui fournissent
-- déjà le nom) sont considérées comme déjà onboardées. Seuls les comptes Google
-- nouvellement provisionnés sont créés avec false.
-- Idempotent.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT true;
