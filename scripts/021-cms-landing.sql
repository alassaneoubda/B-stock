-- B-Stock CMS — Contenu dynamique de la landing (idempotent)

CREATE TABLE IF NOT EXISTS cms_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key VARCHAR(100) UNIQUE NOT NULL,
  title TEXT,
  subtitle TEXT,
  body TEXT,
  cta_primary_label VARCHAR(150),
  cta_primary_href VARCHAR(255),
  cta_secondary_label VARCHAR(150),
  cta_secondary_href VARCHAR(255),
  image_url TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  is_published BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID
);

CREATE TABLE IF NOT EXISTS cms_feature_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'box',
  highlight TEXT,
  sort_order INT DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_faq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name VARCHAR(150) NOT NULL,
  author_role VARCHAR(150),
  company_name VARCHAR(150),
  quote TEXT NOT NULL,
  avatar_url TEXT,
  rating INT DEFAULT 5,
  sort_order INT DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cms_nav_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(100) NOT NULL,
  href VARCHAR(255) NOT NULL,
  location VARCHAR(50) NOT NULL DEFAULT 'header', -- header | footer_platform | footer_resources | footer_company | footer_legal
  sort_order INT DEFAULT 0,
  is_published BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_cms_sections_key ON cms_sections(section_key);
CREATE INDEX IF NOT EXISTS idx_cms_faq_pub ON cms_faq_items(is_published, sort_order);
CREATE INDEX IF NOT EXISTS idx_cms_testimonials_pub ON cms_testimonials(is_published, sort_order);
CREATE INDEX IF NOT EXISTS idx_cms_features_pub ON cms_feature_modules(is_published, sort_order);
CREATE INDEX IF NOT EXISTS idx_cms_nav_loc ON cms_nav_links(location, sort_order);

-- Seed sections
INSERT INTO cms_sections (section_key, title, subtitle, body, cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href, image_url, meta, sort_order)
VALUES
  (
    'hero',
    'Pilotez toute votre distribution depuis une seule plateforme.',
    'Stocks, ventes, clients, dépôts, livraisons et emballages consignés : B-Stock vous donne une vision complète de votre activité.',
    NULL,
    'Commencer gratuitement',
    '#register',
    'Découvrir la plateforme',
    '#product',
    '/images/presentation.png',
    '{"badges":["30 jours gratuits","Sans engagement","Données sécurisées"],"eyebrow":"Moins de pertes, plus de ventes."}'::jsonb,
    1
  ),
  (
    'product',
    'Une vision claire de votre activité, en temps réel.',
    'Chiffre d''affaires, stock, clients, alertes et activité récente — tout ce dont un gérant a besoin sur un seul écran.',
    NULL,
    NULL, NULL, NULL, NULL,
    '/images/presentation.png',
    '{}'::jsonb,
    2
  ),
  (
    'packaging',
    'Les emballages consignés, enfin maîtrisés.',
    'Suivez le cycle complet des casiers et bouteilles : du dépôt au client, puis le retour.',
    'B-Stock sépare clairement les comptes produits et emballages pour éviter les pertes invisibles.',
    NULL, NULL, NULL, NULL, NULL,
    '{"cycle":["Dépôt","Livraison","Client","Consigne","Retour","Dépôt"]}'::jsonb,
    3
  ),
  (
    'comparison',
    'Avant / Avec B-Stock',
    'Passez d''une gestion dispersée à une plateforme centralisée.',
    NULL,
    NULL, NULL, NULL, NULL, NULL,
    '{"before":["Fichiers Excel","Registres papier","Données dispersées","Stock difficile à suivre","Créances difficiles à contrôler"],"after":["Données centralisées","Stock en temps réel","Ventes suivies","Clients centralisés","Livraisons organisées","Rapports disponibles"]}'::jsonb,
    4
  ),
  (
    'how_it_works',
    'Comment ça marche',
    'En quatre étapes, votre distribution est sous contrôle.',
    NULL,
    NULL, NULL, NULL, NULL, NULL,
    '{"steps":[{"n":"01","title":"Créez votre compte","desc":"Inscription en quelques minutes, essai gratuit inclus."},{"n":"02","title":"Configurez votre entreprise","desc":"Dépôt principal, monnaie XOF, paramètres métier."},{"n":"03","title":"Ajoutez produits et utilisateurs","desc":"Catalogue, emballages, rôles de votre équipe."},{"n":"04","title":"Gérez votre distribution","desc":"Ventes, stock, livraisons et créances au quotidien."}]}'::jsonb,
    5
  ),
  (
    'cta_final',
    'Prêt à reprendre le contrôle de votre distribution ?',
    'Commencez gratuitement et découvrez B-Stock.',
    NULL,
    'Commencer gratuitement',
    '#register',
    'Voir les tarifs',
    '#pricing',
    NULL,
    '{}'::jsonb,
    6
  ),
  (
    'footer',
    'B-Stock',
    'La plateforme de gestion pour distributeurs de boissons en Afrique de l''Ouest.',
    NULL,
    NULL, NULL, NULL, NULL, NULL,
    '{"social":[{"label":"LinkedIn","href":"#"},{"label":"Facebook","href":"#"},{"label":"WhatsApp","href":"#"}]}'::jsonb,
    7
  )
ON CONFLICT (section_key) DO NOTHING;

-- Feature modules
INSERT INTO cms_feature_modules (slug, title, description, icon, highlight, sort_order) VALUES
  ('stocks', 'Gestion des stocks', 'Suivi multi-dépôts, alertes de seuil, mouvements audités et inventaires physiques.', 'warehouse', 'Temps réel', 1),
  ('sales', 'Gestion des ventes', 'Ventes comptant, crédit ou mixte, avec facturation et suivi des paiements.', 'cart', 'Paiements mixtes', 2),
  ('clients', 'Gestion des clients', 'Fiches clients, plafonds de crédit, historique d''achats et soldes.', 'users', 'Créances claires', 3),
  ('depots', 'Gestion des dépôts', 'Plusieurs sites, stock par dépôt et transferts inter-dépôts.', 'building', 'Multi-sites', 4),
  ('deliveries', 'Gestion des livraisons', 'Tournées, véhicules, stops et chargement — du dépôt au client.', 'truck', 'Tournées', 5),
  ('packaging', 'Gestion des emballages', 'Casiers et bouteilles consignés, équivalences et soldes clients.', 'package', 'Différenciant', 6),
  ('credits', 'Gestion des créances', 'Notes de crédit, relances et encaissements partiels.', 'credit', 'Moins d''impayés', 7),
  ('reports', 'Rapports et statistiques', 'CA, top produits, stock valorisé et performance par période.', 'chart', 'Décision', 8)
ON CONFLICT (slug) DO NOTHING;

-- FAQ (idempotent)
INSERT INTO cms_faq_items (question, answer, sort_order)
SELECT q, a, o FROM (VALUES
  ('B-Stock est-il adapté aux distributeurs Solibra et Brassivoire ?', 'Oui. B-Stock est conçu pour la distribution de boissons en Côte d''Ivoire : casiers consignés, multi-dépôts, créances et tournées.', 1),
  ('Combien dure l''essai gratuit ?', 'L''essai gratuit dure 30 jours par défaut. La durée est configurable par l''équipe B-Stock depuis le back-office.', 2),
  ('Mes données sont-elles isolées des autres entreprises ?', 'Oui. Chaque entreprise est un tenant isolé. Aucune entreprise ne peut accéder aux données d''une autre.', 3),
  ('Puis-je gérer plusieurs dépôts ?', 'Oui, selon votre plan. Le Pack Business et Entreprise permettent le multi-dépôts et les transferts.', 4),
  ('Comment fonctionne le paiement de l''abonnement ?', 'Les abonnements sont payés via GeniusPay (Mobile Money et cartes). L''activation est automatique après confirmation du paiement.', 5),
  ('Puis-je ajouter des utilisateurs à mon équipe ?', 'Oui. Invitez managers, caissiers et magasiniers avec des permissions adaptées à leur rôle.', 6)
) AS v(q, a, o)
WHERE NOT EXISTS (SELECT 1 FROM cms_faq_items LIMIT 1);

-- Testimonials (idempotent)
INSERT INTO cms_testimonials (author_name, author_role, company_name, quote, rating, sort_order)
SELECT n, r, c, q, rt, o FROM (VALUES
  ('Kouassi Yao', 'Gérant', 'Dépôt du Plateau', 'Avant B-Stock, on perdait le fil des casiers chez les clients. Aujourd''hui le solde consignes est clair et nos créances sont mieux suivies.', 5, 1),
  ('Aminata Traoré', 'Responsable stock', 'Distribution Abidjan Nord', 'Les alertes de stock bas et les transferts entre dépôts nous ont fait gagner plusieurs heures par semaine.', 5, 2),
  ('Jean-Baptiste Koffi', 'Directeur commercial', 'Grossiste Cocody', 'Les tournées et le suivi des paiements mixtes correspondent enfin à notre façon de travailler sur le terrain.', 5, 3)
) AS v(n, r, c, q, rt, o)
WHERE NOT EXISTS (SELECT 1 FROM cms_testimonials LIMIT 1);

-- Nav links (idempotent)
INSERT INTO cms_nav_links (label, href, location, sort_order)
SELECT l, h, loc, o FROM (VALUES
  ('Fonctionnalités', '#features', 'header', 1),
  ('Solutions', '#packaging', 'header', 2),
  ('Tarifs', '#pricing', 'header', 3),
  ('Ressources', '/guide', 'header', 4),
  ('À propos', '/a-propos', 'header', 5),
  ('Fonctionnalités', '#features', 'footer_platform', 1),
  ('Tarifs', '#pricing', 'footer_platform', 2),
  ('Essai gratuit', '#register', 'footer_platform', 3),
  ('Guide', '/guide', 'footer_resources', 1),
  ('Support', '/support', 'footer_resources', 2),
  ('Contact', '/contact', 'footer_resources', 3),
  ('À propos', '/a-propos', 'footer_company', 1),
  ('CGU', '/cgu', 'footer_legal', 1),
  ('Confidentialité', '/confidentialite', 'footer_legal', 2)
) AS v(l, h, loc, o)
WHERE NOT EXISTS (SELECT 1 FROM cms_nav_links LIMIT 1);
