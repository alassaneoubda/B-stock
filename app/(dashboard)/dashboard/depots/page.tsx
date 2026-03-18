import { auth } from '@/lib/auth'
import { sql } from '@/lib/db'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Plus, MoreHorizontal, Building2, Edit, MapPin, Phone, Star, Package, ArrowRight, Layers } from 'lucide-react'
import Link from 'next/link'

interface Depot {
    id: string
    name: string
    address: string | null
    phone: string | null
    is_main: boolean
    stock_count: number
}

async function getDepots(companyId: string): Promise<Depot[]> {
    try {
        const depots = await sql`
      SELECT
        d.*,
        COUNT(DISTINCT s.id) as stock_count
      FROM depots d
      LEFT JOIN stock s ON s.depot_id = d.id AND s.quantity > 0
      WHERE d.company_id = ${companyId}
      GROUP BY d.id
      ORDER BY d.is_main DESC, d.name
    `
        return depots as Depot[]
    } catch {
        return []
    }
}

export default async function DepotsPage() {
    const session = await auth()
    const companyId = session?.user?.companyId || ''
    const depots = await getDepots(companyId)

    return (
        <div className="flex flex-col min-h-screen bg-zinc-50/50">
            <DashboardHeader
                title="Points de Distribution"
                description="Gérez vos centres logistiques et entrepôts de stockage"
                actions={
                    <Button asChild className="rounded-md h-11 px-6 bg-blue-600 hover:bg-blue-700 transition-all active:scale-95 font-bold">
                        <Link href="/dashboard/depots/new">
                            <Plus className="h-5 w-5 mr-2" />
                            Nouveau dépôt
                        </Link>
                    </Button>
                }
            />

            <main className="flex-1 p-4 lg:p-6 space-y-6 ">
                {depots.length === 0 ? (
                    <div className="rounded-lg bg-white border border-slate-200/60 shadow-sm p-24 text-center flex flex-col items-center">
                        <div className="h-24 w-24 rounded-full bg-slate-50 flex items-center justify-center mb-6">
                            <Building2 className="h-10 w-10 text-slate-300" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-950">Aucun dépôt actif</h3>
                        <p className="mt-2 text-slate-400 font-medium max-w-xs mx-auto">
                            Commencez par initialiser votre centre de distribution principal pour gérer vos stocks.
                        </p>
                        <Button className="mt-8 rounded-md h-12 px-8 bg-blue-600 hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20" asChild>
                            <Link href="/dashboard/depots/new">
                                <Plus className="h-5 w-5 mr-2" />
                                Créer mon premier dépôt
                            </Link>
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                        {depots.map((depot) => (
                            <div
                                key={depot.id}
                                className={`group relative overflow-hidden rounded-lg bg-white p-8 shadow-sm border transition-all duration-500 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-2 ${depot.is_main ? 'border-blue-500/30' : 'border-slate-200/60'
                                    }`}
                            >
                                <div className="relative z-10 flex flex-col h-full gap-8">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className={`h-14 w-14 rounded-md flex items-center justify-center transition-transform group-hover:scale-110 duration-500 ${depot.is_main ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-slate-50 text-slate-400 border border-slate-100'
                                                }`}>
                                                <Building2 className="h-7 w-7" />
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-xl font-semibold text-slate-950 tracking-tight leading-tight">{depot.name}</h3>
                                                {depot.is_main && (
                                                    <Badge className="bg-blue-50 text-blue-600 rounded-full px-3 py-0.5 font-semibold uppercase text-[9px] tracking-wider border-none shadow-none flex items-center gap-1.5 w-fit">
                                                        <Star className="h-2.5 w-2.5 fill-current" />
                                                        Centre Principal
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                                                    <MoreHorizontal className="h-5 w-5 text-slate-400 group-hover:text-slate-950" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-56 p-2 rounded-md border-slate-100 shadow-lg">
                                                <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-slate-50 transition-colors">
                                                    <Link href={`/dashboard/depots/${depot.id}/edit`} className="flex items-center gap-3">
                                                        <Edit className="h-4 w-4 text-slate-400" />
                                                        <span className="font-bold text-sm">Paramètres Dépôt</span>
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem asChild className="rounded-xl cursor-pointer py-3 hover:bg-blue-50 focus:bg-blue-50 transition-colors">
                                                    <Link href={`/dashboard/stock?depot=${depot.id}`} className="flex items-center gap-3">
                                                        <Package className="h-4 w-4 text-blue-600" />
                                                        <span className="font-bold text-sm text-blue-700">Inventaire Réel</span>
                                                    </Link>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    <div className="space-y-4 flex-1">
                                        {depot.address && (
                                            <p className="text-sm font-bold text-slate-500 flex items-start gap-2.5 leading-snug">
                                                <MapPin className="h-4 w-4 mt-0.5 text-slate-300 shrink-0" />
                                                {depot.address}
                                            </p>
                                        )}
                                        {depot.phone && (
                                            <p className="text-sm font-bold text-slate-500 flex items-center gap-2.5 uppercase tracking-wider">
                                                <Phone className="h-4 w-4 text-slate-300 shrink-0" />
                                                {depot.phone}
                                            </p>
                                        )}
                                    </div>

                                    <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400">
                                                <Layers className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="text-base font-semibold text-slate-950 tracking-tight leading-none">{depot.stock_count}</p>
                                                <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-wider mt-1">Références</p>
                                            </div>
                                        </div>
                                        <Button asChild variant="ghost" className="h-10 px-4 rounded-xl font-semibold text-[10px] uppercase tracking-[0.1em] text-blue-600 hover:bg-blue-50 transition-all">
                                            <Link href={`/dashboard/stock?depot=${depot.id}`} className="flex items-center gap-2">
                                                Explorer
                                                <ArrowRight className="h-3 w-3" />
                                            </Link>
                                        </Button>
                                    </div>
                                </div>

                                {/* Abstract background circle */}
                                <div className={`absolute -right-8 -bottom-8 h-40 w-40 rounded-full opacity-30 transition-transform duration-700 group-hover:scale-150 ${depot.is_main ? 'bg-blue-100/50' : 'bg-slate-50'
                                    }`} />
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    )
}
