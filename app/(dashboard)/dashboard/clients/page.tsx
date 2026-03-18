import { auth } from '@/lib/auth'
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
  Trash2,
  Eye,
  Phone,
  MapPin,
  CreditCard,
  Check,
  Building2,
  Clock,
  Package
} from 'lucide-react'
import Link from 'next/link'

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

async function getClients(companyId: string): Promise<Client[]> {
  try {
    const clients = await sql`
      SELECT 
        c.*,
        COALESCE(
          (SELECT balance FROM client_accounts ca WHERE ca.client_id = c.id AND ca.account_type = 'product'),
          0
        ) as product_balance,
        COALESCE(
          (SELECT balance FROM client_accounts ca WHERE ca.client_id = c.id AND ca.account_type = 'packaging'),
          0
        ) as packaging_balance
      FROM clients c
      WHERE c.company_id = ${companyId}
      ORDER BY c.name
    `
    return clients as Client[]
  } catch (error) {
    console.error('Error fetching clients:', error)
    return []
  }
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0,
  }).format(amount)
}

export default async function ClientsPage() {
  const session = await auth()
  const clients = await getClients(session?.user?.companyId || '')

  const activeClients = clients.filter(c => c.is_active)
  const totalDebt = clients.reduce((acc, c) => acc + Math.max(0, Number(c.product_balance)), 0)
  const totalPackagingDebt = clients.reduce((acc, c) => acc + Math.max(0, Number(c.packaging_balance)), 0)

  const statsData = [
    {
      title: "Total Clients",
      value: clients.length,
      description: "Base de données clients",
      icon: Users,
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      title: "Clients Actifs",
      value: activeClients.length,
      description: "Partenaires réguliers",
      icon: Check,
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      title: "Dettes Produits",
      value: formatCurrency(totalDebt),
      description: "Encours à recouvrer",
      icon: CreditCard,
      color: "bg-rose-500/10 text-rose-600",
    },
    {
      title: "Emballages Dus",
      value: formatCurrency(totalPackagingDebt),
      description: "Consignes en attente",
      icon: Package,
      color: "bg-amber-500/10 text-amber-600",
    }
  ]

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
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
            <div key={stat.title} className="bg-white rounded-lg border border-zinc-200/80 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-500">{stat.title}</span>
                <stat.icon className="h-3.5 w-3.5 text-zinc-400" />
              </div>
              <p className="text-xl font-bold text-zinc-950 tracking-tight">{stat.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{stat.description}</p>
            </div>
          ))}
        </div>

        {/* Clients Table */}
        <div className="bg-white rounded-lg border border-zinc-200/80 overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-zinc-950">Répertoire clients</h3>
          </div>

          {clients.length === 0 ? (
            <div className="text-center py-16 flex flex-col items-center">
              <div className="h-12 w-12 rounded-lg bg-zinc-100 flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-zinc-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-950">Aucun client</h3>
              <p className="mt-1 text-sm text-zinc-500 max-w-xs">
                Ajoutez vos premiers partenaires pour commencer.
              </p>
              <Button size="sm" className="mt-4" asChild>
                <Link href="/dashboard/clients/new">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Ajouter un client
                </Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-medium text-zinc-500 pl-4">Client</TableHead>
                    <TableHead className="text-xs font-medium text-zinc-500">Contact</TableHead>
                    <TableHead className="text-xs font-medium text-zinc-500">Type / Zone</TableHead>
                    <TableHead className="text-xs font-medium text-zinc-500 text-right">Dette produits</TableHead>
                    <TableHead className="text-xs font-medium text-zinc-500 text-right">Dette emballages</TableHead>
                    <TableHead className="text-xs font-medium text-zinc-500">Statut</TableHead>
                    <TableHead className="pr-4"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id} className="group">
                      <TableCell className="pl-4">
                        <div>
                          <Link href={`/dashboard/clients/${client.id}`} className="text-sm font-medium text-zinc-950 hover:underline">
                            {client.name}
                          </Link>
                          {client.address && (
                            <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3" />
                              {client.address}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="text-sm text-zinc-700">{client.contact_name || '—'}</span>
                          {client.phone && (
                            <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                              <Phone className="h-3 w-3" />
                              {client.phone}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded w-fit">
                            {client.client_type}
                          </span>
                          <span className="text-xs text-zinc-400">{client.zone || '—'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm font-medium ${Number(client.product_balance) > 0 ? 'text-red-600' : 'text-zinc-950'}`}>
                          {formatCurrency(Number(client.product_balance))}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm font-medium ${Number(client.packaging_balance) > 0 ? 'text-amber-600' : 'text-zinc-950'}`}>
                          {formatCurrency(Number(client.packaging_balance))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] font-medium ${client.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'} border-none`}>
                          {client.is_active ? 'Actif' : 'Bloqué'}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md">
                              <MoreHorizontal className="h-4 w-4 text-zinc-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem asChild className="cursor-pointer">
                              <Link href={`/dashboard/clients/${client.id}`} className="flex items-center gap-2">
                                <Eye className="h-4 w-4 text-zinc-500" />
                                <span className="text-sm">Voir le compte</span>
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="cursor-pointer">
                              <Link href={`/dashboard/sales/new?client=${client.id}`} className="flex items-center gap-2">
                                <Plus className="h-4 w-4 text-zinc-500" />
                                <span className="text-sm">Nouvelle vente</span>
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild className="cursor-pointer">
                              <Link href={`/dashboard/clients/${client.id}/edit`} className="flex items-center gap-2">
                                <Edit className="h-4 w-4 text-zinc-500" />
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
          )}
        </div>
      </main>
    </div>
  )
}
