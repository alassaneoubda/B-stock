'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Search, FileText, Loader2, User, Calendar, Activity, Filter } from 'lucide-react'

interface AuditLog {
  id: string; action: string; entity_type: string; entity_id: string | null
  details: Record<string, unknown> | null; user_name: string | null; user_role: string | null
  created_at: string; ip_address: string | null; user_agent: string | null
}

const actionLabels: Record<string, string> = {
  create: 'Création', update: 'Modification', delete: 'Suppression',
  login: 'Connexion', logout: 'Déconnexion', export: 'Export', print: 'Impression',
}

const entityLabels: Record<string, string> = {
  sales_order: 'Commande', client: 'Client', product: 'Produit', depot: 'Dépôt',
  user: 'Utilisateur', cash_session: 'Session caisse', credit_note: 'Créance',
  return: 'Retour', depot_transfer: 'Transfert', inventory_session: 'Inventaire',
  breakage_record: 'Casse', price_rule: 'Règle prix', promotion: 'Promotion',
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [limit, setLimit] = useState('50')

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        ...(entityType && { entity_type: entityType }),
        ...(action && { action }),
        limit,
      })
      const res = await fetch(`/api/audit-logs?${params}`)
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }
      const json = await res.json()
      setLogs(Array.isArray(json.data) ? json.data : [])
    } catch (e) { 
      console.error('Error fetching audit logs:', e)
      setLogs([])
    }
    finally { setIsLoading(false) }
  }, [entityType, action, limit])

  useEffect(() => { fetchData() }, [fetchData])

  const filtered = logs.filter(log =>
    log.user_name?.toLowerCase().includes(search.toLowerCase()) ||
    log.entity_type?.toLowerCase().includes(search.toLowerCase()) ||
    log.action?.toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-50/50">
        <DashboardHeader title="Journal d'Audit" />
        <div className="flex-1 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/50">
      <DashboardHeader title="Journal d'Audit" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  placeholder="Rechercher par utilisateur, entité, action..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex gap-2">
                <div>
                  <Label className="text-xs">Entité</Label>
                  <Select value={entityType} onValueChange={setEntityType}>
                    <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Toutes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Toutes</SelectItem>
                      {Object.entries(entityLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Action</Label>
                  <Select value={action} onValueChange={setAction}>
                    <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Toutes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Toutes</SelectItem>
                      {Object.entries(actionLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Limite</Label>
                  <Select value={limit} onValueChange={setLimit}>
                    <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" variant="outline" onClick={fetchData} className="mt-5">
                  <Filter className="h-4 w-4 mr-2" /> Filtrer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs table */}
        <Card>
          <CardContent className="p-0">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-400">Aucune entrée trouvée</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Utilisateur</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entité</TableHead>
                    <TableHead>Détails</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Agent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-zinc-500">
                        {new Date(log.created_at).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-zinc-400" />
                          <div>
                            <div className="text-sm font-medium">{log.user_name || 'Système'}</div>
                            {log.user_role && <div className="text-xs text-zinc-400">{log.user_role}</div>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-zinc-200 text-zinc-700">
                          {actionLabels[log.action] || log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-zinc-400" />
                          <span className="text-sm">{entityLabels[log.entity_type] || log.entity_type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-zinc-600 max-w-[200px] truncate">
                        {log.details ? (
                          <span title={JSON.stringify(log.details)}>
                            {typeof log.details === 'object'
                              ? Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(', ')
                              : String(log.details)}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-zinc-500">{log.ip_address || '-'}</TableCell>
                      <TableCell className="text-sm text-zinc-500 max-w-[150px] truncate" title={log.user_agent || ''}>
                        {log.user_agent ? (log.user_agent as string).split(' ')[0] : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
