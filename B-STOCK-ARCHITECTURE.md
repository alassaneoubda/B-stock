# B-Stock — Architecture

> Document interne généré lors de la refonte. Stack réelle du dépôt.

## Vue d’ensemble

B-Stock est un **SaaS multi-tenant** de gestion de distribution de boissons (Côte d’Ivoire / Afrique de l’Ouest).

**Monolithe Next.js App Router** : UI + API Routes + SQL Neon dans un seul projet.

```
PUBLIC WEBSITE (/)          CLIENT APP (/dashboard)       ADMIN (/admin)
Landing CMS-driven    →     ERP métier tenant       →     Super-admin plateforme
Plans depuis DB             Isolation company_id          CMS, entreprises, billing
```

## Stack

| Couche | Techno |
|--------|--------|
| Frontend / API | Next.js 16, React 19, TypeScript |
| UI | Tailwind 4, Radix/shadcn |
| Auth | NextAuth v5 (JWT), Credentials + Google + impersonation |
| DB | Neon PostgreSQL (SQL tagged templates, pas d’ORM) |
| Paiements SaaS | GeniusPay (Stripe legacy non branché) |

## Espaces

1. **Public** — Landing, pages légales, guide, support
2. **Client** — `/dashboard/*` (ventes, stock, caisse, livraisons, etc.)
3. **Admin** — `/admin/*` (entreprises, plans, CMS, audit, webhooks)

## Multi-tenant

- Table `companies` = tenant
- Toutes les requêtes métier filtrent `company_id`
- Platform admins dans `platform_admins` (hors tenants)

## Abonnements

- Statuts : `trialing`, `active`, `past_due`, `canceled` (+ suspension `is_suspended`)
- Essai : `platform_settings.trial_days` (défaut 30)
- Plans : `subscription_plans` (prix checkout JSONB, features marketing)
- Activation : webhook GeniusPay + `/api/subscription/activate`

## AuthZ

- Rôles tenant : `owner`, `manager`, `cashier`, `warehouse_keeper`
- Table `role_permissions` + permissions session
- Guard API : `lib/api-auth.ts` / `lib/admin-auth.ts`

## CMS Landing

- Tables `cms_*` (sections, FAQ, témoignages, modules fonctionnalités)
- Lecture publique : `lib/cms.ts` + page `/`
- Édition : `/admin/cms`

## Fichiers critiques

- `lib/db.ts`, `lib/auth.ts`, `lib/api-auth.ts`, `middleware.ts`
- `app/api/sales/route.ts`, `lib/subscription.ts`
- `app/api/webhooks/geniuspay/route.ts`
