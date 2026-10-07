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
import { Search, FileText, User, RotateCw, ScrollText } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/permissions'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/states'
import type { UserRole } from '@/lib/types'

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

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('all')
  const [action, setAction] = useState('all')
  const [limit, setLimit] = useState('50')

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams({
        ...(entityType !== 'all' && { entity_type: entityType }),
        ...(action !== 'all' && { action }),
        limit,
      })
      const json = await apiFetch<{ data: AuditLog[] }>(`/api/audit-logs?${params}`)
      setLogs(Array.isArray(json.data) ? json.data : [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setIsLoading(false)
    }
  }, [entityType, action, limit])

  useEffect(() => { fetchData() }, [fetchData])

  const term = search.trim().toLowerCase()
  const filtered = term
    ? logs.filter(log =>
        log.user_name?.toLowerCase().includes(term) ||
        log.entity_type?.toLowerCase().includes(term) ||
        (entityLabels[log.entity_type] || '').toLowerCase().includes(term) ||
        log.action?.toLowerCase().includes(term) ||
        (actionLabels[log.action] || '').toLowerCase().includes(term)
      )
    : logs

  return (
    <div className="flex flex-col min-h-screen bg-muted/30">
      <DashboardHeader title="Journal d'Audit" />
      <main className="flex-1 p-4 lg:p-6 space-y-6 max-w-[1400px] mx-auto w-full">

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
                <Input
                  placeholder="Rechercher par utilisateur, entité, action..."
                  aria-label="Rechercher dans le journal"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <div>
                  <Label className="text-xs">Entité</Label>
                  <Select value={entityType} onValueChange={setEntityType}>
                    <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Toutes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes</SelectItem>
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
                      <SelectItem value="all">Toutes</SelectItem>
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
                <Button size="sm" variant="outline" onClick={fetchData} disabled={isLoading} className="mt-5">
                  <RotateCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualiser
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs table */}
        <Card>
          <CardContent className={isLoading || loadError || filtered.length === 0 ? 'p-4' : 'p-0'}>
            {isLoading ? (
              <TableSkeleton rows={8} columns={5} />
            ) : loadError ? (
              <ErrorState description={loadError} onRetry={fetchData} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={ScrollText}
                title={logs.length === 0 ? 'Aucune entrée dans le journal' : 'Aucune entrée ne correspond à la recherche'}
                description={logs.length === 0 ? 'Les actions sensibles (créations, modifications, suppressions) apparaîtront ici.' : undefined}
              />
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
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
                          <div>
                            <div className="text-sm font-medium">{log.user_name || 'Système'}</div>
                            {log.user_role && (
                              <div className="text-xs text-muted-foreground">
                                {ROLE_LABELS[log.user_role as UserRole] || log.user_role}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-border text-foreground/80">
                          {actionLabels[log.action] || log.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
                          <span className="text-sm">{entityLabels[log.entity_type] || log.entity_type}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {log.details ? (
                          <span title={JSON.stringify(log.details)}>
                            {typeof log.details === 'object'
                              ? Object.entries(log.details).map(([k, v]) => `${k}: ${formatDetailValue(v)}`).join(', ')
                              : String(log.details)}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{log.ip_address || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate" title={log.user_agent || ''}>
                        {log.user_agent ? log.user_agent.split(' ')[0] : '—'}
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
