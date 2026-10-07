import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { PageShell, StatCard, StatusBadge } from '@/components/app/blocks'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus,
  Search,
  MoreHorizontal,
  Users,
  Edit,
  Eye,
  Phone,
  MapPin,
  CreditCard,
  Check,
  Package,
  ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { formatMoney, formatNumber } from '@/lib/format'
import { BalanceText } from './balance-text'

interface Client {
  id: string
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  zone: string | null
  client_type: string
  credit_limit: number
  is_active: boolean
  created_at: string
  product_balance: number
  packaging_balance: number
}

// Pas de try/catch : une panne de base affiche l'écran d'erreur (dashboard/error.tsx)
// au lieu d'une liste vide trompeuse.
async function getClients(companyId: string, q: string | null): Promise<Client[]> {
  const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null
  const clients = await sql`
      SELECT
        c.*,
        COALESCE(
          (SELECT SUM(balance) FROM client_accounts ca WHERE ca.client_id = c.id AND ca.account_type = 'product'),
          0
        ) as product_balance,
        COALESCE(
          (SELECT SUM(balance) FROM client_accounts ca WHERE ca.client_id = c.id AND ca.account_type = 'packaging'),
          0
        ) as packaging_balance
      FROM clients c
      WHERE c.company_id = ${companyId}
        AND c.is_walk_in = false
        AND (
          ${pattern}::text IS NULL
          OR c.name ILIKE ${pattern}::text
          OR c.phone ILIKE ${pattern}::text
          OR c.zone ILIKE ${pattern}::text
          OR c.contact_name ILIKE ${pattern}::text
        )
      ORDER BY c.name
    `
  return clients as Client[]
}

const formatCurrency = formatMoney

const typeLabels: Record<string, string> = {
  retail: 'Détaillant',
  wholesale: 'Grossiste',
  restaurant: 'Restaurant/Maquis',
  bar: 'Bar',
  subdepot: 'Sous-dépôt',
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>
}) {
  const session = await requirePageSession()
  const sp = await searchParams
  const rawQ = Array.isArray(sp.q) ? sp.q[0] : sp.q
  const q = rawQ?.trim().slice(0, 100) || null
  const clients = await getClients(session?.user?.companyId || '', q)

  const activeClients = clients.filter(c => c.is_active)
  // Solde négatif = le client doit (même convention que les ventes et encaissements)
  const totalDebt = clients.reduce((acc, c) => acc + Math.max(0, -Number(c.product_balance)), 0)
  const totalPackagingDebt = clients.reduce((acc, c) => acc + Math.max(0, -Number(c.packaging_balance)), 0)

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader
        title="Clients"
        description="Répertoire, soldes produits et emballages"
        actions={
          <Button variant="brand" size="sm" asChild>
            <Link href="/dashboard/clients/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouveau client
            </Link>
          </Button>
        }
      />

      <PageShell>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Clients"
            value={formatNumber(clients.length)}
            hint={q ? `Résultats pour « ${q} »` : 'Dans le répertoire'}
            icon={Users}
          />
          <StatCard
            label="Clients actifs"
            value={formatNumber(activeClients.length)}
            hint="Partenaires réguliers"
            icon={Check}
            tone="success"
          />
          <StatCard
            label="Dettes produits"
            value={formatCurrency(totalDebt)}
            hint="Encours à recouvrer"
            icon={CreditCard}
            emphasis
          />
          <StatCard
            label="Emballages dus"
            value={formatCurrency(totalPackagingDebt)}
            hint="Consignes en attente"
            icon={Package}
            tone="warning"
          />
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <form action="/dashboard/clients" method="get" role="search" className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                name="q"
                defaultValue={q ?? ''}
                placeholder="Nom, téléphone, zone…"
                aria-label="Rechercher un client"
                className="h-10 pl-9"
              />
            </form>
            {q && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/clients">Effacer la recherche</Link>
              </Button>
            )}
          </div>

          {clients.length === 0 && q ? (
            <EmptyState
              icon={Search}
              title="Aucun client trouvé"
              description={`Aucun résultat pour « ${q} ».`}
              action={{ label: 'Voir tous les clients', href: '/dashboard/clients' }}
            />
          ) : clients.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Aucun client"
              description="Ajoutez vos premiers partenaires pour commencer."
              action={{ label: 'Ajouter un client', href: '/dashboard/clients/new' }}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_0_rgb(15_23_42/0.04)]">
              {/* Tableau (≥ md) */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-5">Client</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Type et zone</TableHead>
                      <TableHead className="text-right">Solde produits</TableHead>
                      <TableHead className="text-right">Solde emballages</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="w-12 pr-5">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="pl-5">
                          <Link
                            href={`/dashboard/clients/${client.id}`}
                            className="rounded-sm text-sm font-medium text-foreground transition-colors hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {client.name}
                          </Link>
                          {client.address && (
                            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">{client.address}</span>
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-foreground">{client.contact_name || '—'}</span>
                          {client.phone && (
                            <p className="tabular mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                              {client.phone}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-foreground">{typeLabels[client.client_type] || client.client_type}</span>
                          <p className="mt-0.5 text-xs text-muted-foreground">{client.zone || 'Sans zone'}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <BalanceText value={client.product_balance} className="text-sm font-medium" />
                        </TableCell>
                        <TableCell className="text-right">
                          <BalanceText value={client.packaging_balance} className="text-sm font-medium" debtClassName="text-warning-foreground" />
                        </TableCell>
                        <TableCell>
                          <StatusBadge label={client.is_active ? 'Actif' : 'Bloqué'} tone={client.is_active ? 'success' : 'default'} />
                        </TableCell>
                        <TableCell className="pr-5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions pour ${client.name}`}>
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                  Voir le compte
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href={`/dashboard/sales/new?client=${client.id}`} className="flex items-center gap-2">
                                  <Plus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                  Nouvelle vente
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href={`/dashboard/clients/${client.id}/edit`} className="flex items-center gap-2">
                                  <Edit className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                                  Modifier
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Cartes (< md) */}
              <ul className="divide-y divide-border md:hidden">
                {clients.map((client) => (
                  <li key={client.id}>
                    <Link
                      href={`/dashboard/clients/${client.id}`}
                      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{client.name}</p>
                          {!client.is_active && <StatusBadge label="Bloqué" tone="default" />}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {typeLabels[client.client_type] || client.client_type}
                          {' · '}
                          {client.zone || 'Sans zone'}
                          {client.phone ? ` · ${client.phone}` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <BalanceText value={client.product_balance} className="block text-sm font-medium" />
                        {Number(client.packaging_balance) !== 0 && (
                          <span className="block text-xs text-muted-foreground">
                            Emb. <BalanceText value={client.packaging_balance} debtClassName="text-warning-foreground" />
                          </span>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PageShell>
    </div>
  )
}
