import { UI_MODULES, type UiModule } from '@/lib/permissions'

/**
 * Libellés français des modules de navigation (users.permissions).
 * Source unique pour la création et la modification d'un employé : les deux
 * écrans utilisaient auparavant des listes d'identifiants différentes.
 *
 * Ces cases n'affectent que l'affichage du menu ; les accès réels (pages et
 * API) dépendent uniquement du rôle.
 */
export const MODULE_LABELS: Record<UiModule, string> = {
  dashboard: 'Tableau de bord',
  sales: 'Ventes',
  clients: 'Clients',
  inventory: 'Stock & Inventaire',
  products: 'Produits',
  procurement: 'Approvisionnement',
  suppliers: 'Fournisseurs',
  deliveries: 'Livraisons',
  vehicles: 'Véhicules',
  reports: 'Rapports',
  settings: 'Paramètres',
}

export const MODULE_OPTIONS: { id: UiModule; label: string }[] = UI_MODULES.map((id) => ({
  id,
  label: MODULE_LABELS[id],
}))

export const MODULES_HELP_TEXT =
  "Ces cases règlent uniquement les rubriques affichées dans le menu. Les accès réels dépendent du rôle : un module coché reste inaccessible si le rôle ne l'autorise pas."
