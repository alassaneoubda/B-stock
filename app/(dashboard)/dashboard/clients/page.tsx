import { requirePageSession } from '@/lib/page-auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  Package
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

  const statsData = [
    {
      title: "Total Clients",
      value: formatNumber(clients.length),
      description: q ? `Résultats pour « ${q} »` : "Base de données clients",
      icon: Users,
      color: "bg-primary/10 text-brand-strong",
    },
    {
      title: "Clients Actifs",
      value: formatNumber(activeClients.length),
      description: "Partenaires réguliers",
      icon: Check,
      color: "bg-success/10 text-success",
    },
    {
      title: "Dettes Produits",
      value: formatCurrency(totalDebt),
      description: "Encours à recouvrer",
      icon: CreditCard,
      color: "bg-destructive/10 text-destructive",
    },
    {
      title: "Emballages Dus",
      value: formatCurrency(totalPackagingDebt),
      description: "Consignes en attente",
      icon: Package,
      color: "bg-warning/10 text-warning-foreground",
    }
  ]

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <DashboardHeader
        title="Clients"
        actions={
          <Button size="sm" asChild className="h-8 px-3 text-xs font-medium">
            <Link href="/dashboard/clients/new" className="flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Nouveau client
            </Link>
          </Button>
        }
      />

      <main className="flex-1 p-4 lg:p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statsData.map((stat) => (
            <div key={stat.title} className="bg-card rounded-lg border border-border p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">{stat.title}</span>
                <stat.icon className="h-3.5 w-3.5 text-muted-foreground/70" />
              </div>
              <p className="text-xl font-bold text-foreground tracking-tight">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </div>
          ))}
        </div>

        {/* Clients Table */}
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground">Répertoire clients</h3>
            <form action="/dashboard/clients" method="get" role="search" className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" aria-hidden="true" />
              <Input
                type="search"
                name="q"
                defaultValue={q ?? ''}
                placeholder="Nom, téléphone, zone…"
                aria-label="Rechercher un client"
                className="h-9 w-56 pl-8 text-sm"
              />
            </form>
          </div>

          {clients.length === 0 && q ? (
            <div className="text-center py-16 px-4">
              <p className="text-sm font-semibold text-foreground">Aucun client trouvé</p>
              <p className="mt-1 text-sm text-muted-foreground">Aucun résultat pour « {q} ».</p>
              <Button size="sm" variant="outline" className="mt-4" asChild>
                <Link href="/dashboard/clients">Voir tous les clients</Link>
              </Button>
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-16 flex flex-col items-center px-4">
              <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-muted-foreground/70" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Aucun client</h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                Ajoutez vos premiers partenaires pour commencer.
              </p>
              <Button size="sm" className="mt-4 h-11 px-6" asChild>
                <Link href="/dashboard/clients/new">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Ajouter un client
                </Link>
              </Button>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-medium text-muted-foreground pl-4">Client</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Contact</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Type / Zone</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground text-right">Solde produits</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground text-right">Solde emballages</TableHead>
                      <TableHead className="text-xs font-medium text-muted-foreground">Statut</TableHead>
                      <TableHead className="pr-4"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow key={client.id} className="group">
                        <TableCell className="pl-4">
                          <div>
                            <Link href={`/dashboard/clients/${client.id}`} className="text-sm font-medium text-foreground hover:underline">
                              {client.name}
                            </Link>
                            {client.address && (
                              <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3" />
                                {client.address}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="text-sm text-foreground/80">{client.contact_name || '—'}</span>
                            {client.phone && (
                              <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                                <Phone className="h-3 w-3" />
                                {client.phone}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded w-fit">
                              {typeLabels[client.client_type] || client.client_type}
                            </span>
                            <span className="text-xs text-muted-foreground/70">{client.zone || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <BalanceText value={client.product_balance} className="text-sm font-medium" />
                        </TableCell>
                        <TableCell className="text-right">
                          <BalanceText value={client.packaging_balance} className="text-sm font-medium" debtClassName="text-warning-foreground" />
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] font-medium ${client.is_active ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'} border-none`}>
                            {client.is_active ? 'Actif' : 'Bloqué'}
                          </Badge>
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md" aria-label={`Actions pour ${client.name}`}>
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground/70" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">Voir le compte</span>
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href={`/dashboard/sales/new?client=${client.id}`} className="flex items-center gap-2">
                                  <Plus className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">Nouvelle vente</span>
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild className="cursor-pointer">
                                <Link href={`/dashboard/clients/${client.id}/edit`} className="flex items-center gap-2">
                                  <Edit className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm">Modifier</span>
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

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-border">
                {clients.map((client) => (
                  <Link
                    key={client.id}
                    href={`/dashboard/clients/${client.id}`}
                    className="block p-4 active:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{client.name}</p>
                        {client.phone && (
                          <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3" /> {client.phone}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {typeLabels[client.client_type] || client.client_type}
                        </span>
                        <Badge className={`text-[10px] font-medium ${client.is_active ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'} border-none`}>
                          {client.is_active ? 'Actif' : 'Bloqué'}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground/70">{client.zone || 'Sans zone'}</span>
                      <div className="flex items-center gap-3">
                        {Number(client.product_balance) !== 0 && (
                          <BalanceText value={client.product_balance} className="font-medium" />
                        )}
                        {Number(client.packaging_balance) !== 0 && (
                          <span className="font-medium">
                            Emb. : <BalanceText value={client.packaging_balance} debtClassName="text-warning-foreground" />
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
