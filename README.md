# B-Stock

SaaS multi-tenant de gestion pour distributeurs de boissons (Côte d’Ivoire / Afrique de l’Ouest).

Stack : **Next.js 16** · React 19 · TypeScript · Neon PostgreSQL · NextAuth v5 · GeniusPay · Tailwind 4

## Fonctionnalités

- Landing dynamique (CMS admin)
- Auth email/mot de passe + Google OAuth
- Dashboard métier : ventes, stock, clients, créances, dépôts, livraisons, emballages consignés, caisse, rapports
- Multi-tenant (`company_id`)
- Abonnements + essai gratuit configurable
- Back-office plateforme (`/admin`) : entreprises, utilisateurs, plans, CMS, audit, webhooks

## Prérequis

- Node.js 20+
- Compte [Neon](https://neon.tech) (PostgreSQL)
- (Optionnel) Google OAuth, GeniusPay

## Installation

```bash
cp .env.example .env.local
# Renseigner DATABASE_URL, AUTH_SECRET, etc.

npm install
npm run db:migrate
npm run admin:create   # crée un super-admin plateforme
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Variables d’environnement

Voir `.env.example`. Ne jamais committer `.env.local`.

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | Neon PostgreSQL |
| `AUTH_SECRET` | Secret NextAuth / impersonation |
| `NEXTAUTH_URL` | URL publique |
| `GOOGLE_CLIENT_ID` / `SECRET` | OAuth |
| `GENIUSPAY_*` | Paiements abonnement |

## Scripts

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build production |
| `npm run start` | Serveur production |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Applique `scripts/*.sql` |
| `npm run admin:create` | Crée un platform admin |

## Architecture

Voir `B-STOCK-ARCHITECTURE.md`.

Espaces :

- `/` — site public (CMS)
- `/dashboard` — app client
- `/admin` — back-office

## CMS Landing

Après migration `021-cms-landing.sql` :

1. Aller sur `/admin/cms`
2. Éditer sections, FAQ, témoignages, fonctionnalités
3. Les tarifs viennent de `subscription_plans` (page `/admin/plans`)

## Sécurité

- Permissions vérifiées côté API (`lib/api-auth.ts`)
- Abonnement inactif → HTTP 402 sur les API métier
- Isolation multi-tenant par `company_id`
- Webhooks GeniusPay signés + anti-replay

## Déploiement

Compatible Vercel + Neon. Définir toutes les variables d’environnement en production, puis `npm run db:migrate` une fois sur la base cible.
