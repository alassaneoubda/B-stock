# B-Stock — Guide de design (charte de la refonte)

Référence visuelle : `app/(dashboard)/dashboard/page.tsx` (accueil), `components/pos/*` (point de vente),
`components/app/blocks.tsx` (blocs partagés). Tout nouvel écran doit ressembler à ces références.

## Principes
- **Calme et précis** : fond neutre chaud, encre bleu nuit, orange de marque réservé aux accents.
  Pas de dégradés décoratifs, pas de cercles flous, pas d'ombres lourdes, pas de zoom au survol.
- **Une seule action phare par écran** : bouton `variant="brand"` (orange, texte encre).
  Actions principales : bouton par défaut (encre). Secondaires : `outline` / `ghost`. Suppression : `destructive`.
- **Les chiffres d'abord** : montants avec `formatMoney` et la classe `tabular`, alignés à droite dans les tableaux.
- **Jamais la couleur seule** pour un statut : `StatusBadge` (libellé + point).
- Animations : couleurs/ombres ≤ 150 ms uniquement (`transition-colors`, `transition-shadow`).

## Tokens (classes Tailwind)
- Texte : `text-foreground`, `text-muted-foreground` ; surfaces : `bg-background` (page), `bg-card`, `bg-muted`.
- Bordures : `border-border`. Rayon : `rounded-xl` (cartes), `rounded-lg` (champs, boutons).
- Marque : `bg-brand` / `text-brand-strong` / `bg-brand-soft`.
- Sémantique : `success`, `warning`, `info`, `destructive` (+ variantes `-soft` pour les fonds).
- Interdit : couleurs Tailwind brutes (`zinc-`, `slate-`, `blue-`, `gray-`, `#hex`) dans le dashboard.

## Structure d'une page
```tsx
<div className="flex min-h-screen flex-col">
  <DashboardHeader title="Ventes" description="…" actions={<Button>…</Button>} />
  <PageShell>
    {/* 1. indicateurs (StatCard, 4 max, seulement s'ils aident à décider) */}
    {/* 2. contenu principal (Panel / Card) */}
  </PageShell>
</div>
```

### Liste
- Barre d'outils au-dessus du tableau : recherche à gauche (icône Search, `h-10`), filtres (Select ou
  boutons pilule), action principale à droite.
- Tableau dans une carte (`Panel` ou `rounded-xl border bg-card overflow-hidden`), composants `Table*`.
- Ligne cliquable vers le détail ; colonnes numériques `text-right tabular`.
- Mobile (< md) : liste de cartes (nom, méta en `text-xs text-muted-foreground`, montant à droite).
- États : `TableSkeleton`, `EmptyState` (avec action), `ErrorState` (avec Réessayer).

### Formulaire
- Largeur `max-w-3xl`, sections en `Card` (`CardHeader` avec titre + description courte), grille
  `grid gap-4 md:grid-cols-2`, libellés au-dessus, aide en `text-xs text-muted-foreground`.
- Pied : `Annuler` (outline) puis action principale, alignés à droite ; bouton désactivé + `Loader2` pendant l'envoi.

### Détail
- Lien retour (`Button variant="ghost" size="sm"` « ← Ventes ») ; titre + `StatusBadge` ; actions à droite.
- Grille `lg:grid-cols-3` : contenu (2/3) + résumé (1/3, `Panel`).

## Composants disponibles
`components/app/blocks.tsx` : `PageShell`, `PageIntro`, `StatCard` (`tone`, `emphasis`, `href`), `Panel`
(`title`, `description`, `action`), `StatusBadge` (`status` ou `label` + `tone`).
`components/states.tsx` : `EmptyState`, `ErrorState`, `TableSkeleton`, `PageSkeleton`.
`components/ui/*` (shadcn, déjà stylés) ; `Badge` variantes `success|warning|info|brand|muted|danger`.
