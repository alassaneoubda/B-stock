'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageShell, Panel, StatusBadge } from '@/components/app/blocks'
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

const actionTones: Record<string, 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info'> = {
  create: 'success', update: 'info', delete: 'danger',
  login: 'default', logout: 'default', export: 'brand', print: 'brand',
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

function detailsText(log: AuditLog): string {
  if (!log.details) return '—'
  return typeof log.details === 'object'
    ? Object.entries(log.details).map(([k, v]) => `${k}: ${formatDetailValue(v)}`).join(', ')
    : String(log.details)
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

  const showBodyPadding = isLoading || !!loadError || filtered.length === 0

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Journal d'audit" description="Historique des actions sensibles de votre équipe" />
      <PageShell>
        {/* Barre d'outils */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="relative w-full sm:max-w-sm sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Rechercher par utilisateur, entité, action…"
                aria-label="Rechercher dans le journal"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="audit-entity" className="text-xs text-muted-foreground">Entité</Label>
                <Select value={entityType} onValueChange={setEntityType}>
                  <SelectTrigger id="audit-entity" className="h-10 w-40"><SelectValue placeholder="Toutes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {Object.entries(entityLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="audit-action" className="text-xs text-muted-foreground">Action</Label>
                <Select value={action} onValueChange={setAction}>
                  <SelectTrigger id="audit-action" className="h-10 w-40"><SelectValue placeholder="Toutes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {Object.entries(actionLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="audit-limit" className="text-xs text-muted-foreground">Limite</Label>
                <Select value={limit} onValueChange={setLimit}>
                  <SelectTrigger id="audit-limit" className="h-10 w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={fetchData} disabled={isLoading} className="h-10 self-start lg:self-auto">
            <RotateCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualiser
          </Button>
        </div>

        {/* Journal */}
        <Panel
          title="Entrées du journal"
          description={
            !isLoading && !loadError
              ? `${filtered.length} entrée${filtered.length > 1 ? 's' : ''} affichée${filtered.length > 1 ? 's' : ''}`
              : undefined
          }
          bodyClassName={showBodyPadding ? 'p-5' : undefined}
        >
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
            <>
              {/* Mobile : liste de cartes */}
              <ul className="divide-y divide-border md:hidden">
                {filtered.map((log) => (
                  <li key={log.id} className="space-y-1.5 px-5 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{log.user_name || 'Système'}</p>
                        <p className="text-xs text-muted-foreground">
                          {entityLabels[log.entity_type] || log.entity_type} · <span className="tabular">{formatDateTime(log.created_at)}</span>
                        </p>
                      </div>
                      <StatusBadge label={actionLabels[log.action] || log.action} tone={actionTones[log.action] ?? 'default'} />
                    </div>
                    {log.details && (
                      <p className="truncate text-xs text-muted-foreground" title={JSON.stringify(log.details)}>
                        {detailsText(log)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>

              {/* Bureau : tableau */}
              <div className="hidden md:block">
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
                        <TableCell className="tabular whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(log.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              <User className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground">{log.user_name || 'Système'}</div>
                              {log.user_role && (
                                <div className="text-xs text-muted-foreground">
                                  {ROLE_LABELS[log.user_role as UserRole] || log.user_role}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge label={actionLabels[log.action] || log.action} tone={actionTones[log.action] ?? 'default'} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            <span className="text-sm text-foreground">{entityLabels[log.entity_type] || log.entity_type}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                          {log.details ? <span title={JSON.stringify(log.details)}>{detailsText(log)}</span> : '—'}
                        </TableCell>
                        <TableCell className="tabular text-sm text-muted-foreground">{log.ip_address || '—'}</TableCell>
                        <TableCell className="max-w-[150px] truncate text-sm text-muted-foreground" title={log.user_agent || ''}>
                          {log.user_agent ? log.user_agent.split(' ')[0] : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </Panel>
      </PageShell>
    </div>
  )
}
