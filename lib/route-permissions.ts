/**
 * Permission API requise pour chaque section du dashboard.
 * Source unique pour : la navigation (menu, barre mobile) et le garde des pages
 * serveur. Les mêmes chaînes que celles vérifiées par les routes API, de sorte
 * qu'un utilisateur ne voit jamais un écran dont l'API lui répondrait 403.
 *
 * L'ordre compte : la route la plus spécifique d'abord.
 */
const ROUTE_PERMISSIONS: [prefix: string, permission: string][] = [
  ['/pos', 'pos.use'],
  ['/dashboard/pos/tables', 'pos.manage'],
  ['/dashboard/cash/validation', 'cash.manage'],
  ['/dashboard/cash', 'cash.read'],
  ['/dashboard/sales', 'sales.read'],
  ['/dashboard/clients', 'clients.read'],
  ['/dashboard/credits', 'credits.read'],
  ['/dashboard/invoices', 'invoices.read'],
  ['/dashboard/deliveries', 'deliveries.read'],
  ['/dashboard/products', 'products.read'],
  ['/dashboard/packaging', 'packaging.read'],
  ['/dashboard/stock', 'stock.read'],
  ['/dashboard/inventory', 'inventory.read'],
  ['/dashboard/transfers', 'transfers.read'],
  ['/dashboard/returns', 'returns.read'],
  ['/dashboard/breakage', 'breakage.read'],
  ['/dashboard/procurement', 'purchases.read'],
  ['/dashboard/suppliers', 'suppliers.read'],
  ['/dashboard/reports', 'reports.view'],
  // Permission attribuée à aucun rôle : réservé au propriétaire (owner = '*')
  ['/dashboard/accounting', 'accounting.manage'],
  ['/dashboard/alerts', 'alerts.read'],
  ['/dashboard/audit-logs', 'audit.read'],
  ['/dashboard/vehicles', 'vehicles.read'],
  ['/dashboard/agents', 'agents.read'],
  ['/dashboard/pricing', 'pricing.read'],
  ['/dashboard/depots', 'stock.read'],
  ['/dashboard/settings/users', 'users.read'],
  ['/dashboard/settings/subscription', 'subscription.manage'],
  ['/dashboard/plans', 'subscription.manage'],
  ['/dashboard/settings/accounting', 'accounting.manage'],
  // Permission attribuée à aucun rôle : réservé au propriétaire (owner = '*')
  ['/dashboard/settings/payments', 'payment_settings.manage'],
  ['/dashboard/mobile-money', 'payments.read'],
  ['/dashboard/settings/security', ''], // chacun gère son propre compte
  ['/dashboard/settings/notifications', ''],
  ['/dashboard/settings', 'settings.read'],
  ['/dashboard/profile', ''],
]

/** Permission requise pour une URL du dashboard ('' = tout utilisateur connecté). */
export function permissionForPath(pathname: string): string {
  for (const [prefix, permission] of ROUTE_PERMISSIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return permission
  }
  return ''
}

/**
 * Vérifie l'accès à une URL à partir des permissions effectives de l'utilisateur
 * (calculées côté serveur : owner = '*').
 */
export function canAccessPath(pathname: string, permissions: readonly string[]): boolean {
  if (permissions.includes('*')) return true
  const required = permissionForPath(pathname)
  return required === '' || permissions.includes(required)
}
