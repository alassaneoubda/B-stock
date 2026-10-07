import { Banknote, Clock, CreditCard, Package, ShoppingBag, Wallet } from 'lucide-react'

/**
 * Maquettes du produit construites en interface réelle (pas de captures d'un
 * compte vide) : nettes à toutes les tailles, cohérentes avec l'application.
 * Données d'exemple, signalées comme telles.
 */

function money(n: number) {
  return `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`
}

const WEEK = [62, 48, 71, 55, 88, 94, 76]
const DAYS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'auj']

/** Aperçu du tableau de bord (section d'ouverture). */
export function HeroMockup() {
  return (
    <div className="relative" aria-label="Aperçu du tableau de bord B-Stock avec des données d’exemple" role="img">
      <div className="rounded-2xl border border-border bg-card p-2 shadow-[0_24px_60px_-20px_rgb(15_23_42/0.25)]">
        <div className="flex items-center gap-1.5 px-3 py-2" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="ml-3 text-[11px] font-medium text-muted-foreground">Tableau de bord · Dépôt de Yopougon</span>
        </div>
        <div className="grid gap-3 rounded-xl bg-background p-3 sm:grid-cols-2">
          <div className="rounded-xl bg-primary p-4 text-primary-foreground sm:col-span-2">
            <div className="flex items-start justify-between">
              <span className="text-xs text-primary-foreground/70">Chiffre d’affaires du jour</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                <Banknote className="h-3.5 w-3.5" />
              </span>
            </div>
            <p className="tabular mt-2 text-2xl font-semibold tracking-tight">{money(184500)}</p>
            <p className="text-xs text-primary-foreground/70">37 ventes · +12 % par rapport à hier</p>
            <div className="mt-4 flex h-16 items-end gap-1.5">
              {WEEK.map((v, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div className={i === WEEK.length - 1 ? 'w-full rounded bg-brand' : 'w-full rounded bg-primary-foreground/25'} style={{ height: `${v}%` }} />
                  <span className="text-[9px] text-primary-foreground/60">{DAYS[i]}</span>
                </div>
              ))}
            </div>
          </div>
          <MiniStat icon={CreditCard} label="Encours clients" value={money(426000)} note="2 créances en retard" tone="danger" />
          <MiniStat icon={Package} label="Casiers chez les clients" value="312" note="Soldes à jour" tone="success" />
        </div>
      </div>

      {/* Carte flottante : ticket du point de vente */}
      <div className="absolute -bottom-8 -left-4 hidden w-60 rounded-xl border border-border bg-card p-4 shadow-xl sm:block lg:-left-10">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">Table T4</span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" /> 42 min
          </span>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          <li className="flex justify-between"><span>6 × Flag 65cl</span><span className="tabular">4 200</span></li>
          <li className="flex justify-between"><span>2 × Guinness</span><span className="tabular">1 600</span></li>
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="tabular text-base font-semibold text-foreground">{money(5800)}</span>
          <span className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-brand-foreground">Encaisser</span>
        </div>
      </div>
    </div>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof Wallet
  label: string
  value: string
  note: string
  tone: 'danger' | 'success'
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={tone === 'danger' ? 'flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10 text-destructive' : 'flex h-7 w-7 items-center justify-center rounded-lg bg-success-soft text-success'}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="tabular mt-2 text-lg font-semibold tracking-tight text-foreground">{value}</p>
      <p className={tone === 'danger' ? 'text-xs text-destructive' : 'text-xs text-success'}>{note}</p>
    </div>
  )
}

const TABLES = [
  { name: 'T1', total: 0 },
  { name: 'T2', total: 5800, time: '18 min' },
  { name: 'T3', total: 0 },
  { name: 'VIP 1', total: 10000, time: '1 h 05' },
  { name: 'T5', total: 2100, time: '7 min' },
  { name: 'T6', total: 0 },
]

/** Aperçu du point de vente (section « maquis »). */
export function PosMockup() {
  return (
    <div className="rounded-2xl border border-primary-foreground/10 bg-primary-foreground/5 p-3 backdrop-blur" role="img" aria-label="Aperçu du point de vente B-Stock : plan de salle avec tables occupées">
      <div className="rounded-xl bg-background p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Salle</p>
            <p className="text-xs text-muted-foreground">3 tables occupées · {money(17900)} en cours</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground">
            <ShoppingBag className="h-3.5 w-3.5" /> Vente comptoir
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {TABLES.map((t) =>
            t.total ? (
              <div key={t.name} className="rounded-xl bg-primary p-3 text-primary-foreground">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{t.name}</span>
                  <span className="h-2 w-2 rounded-full bg-brand" />
                </div>
                <p className="tabular mt-3 text-sm font-semibold">{money(t.total)}</p>
                <p className="text-[10px] text-primary-foreground/60">{t.time}</p>
              </div>
            ) : (
              <div key={t.name} className="flex flex-col justify-between rounded-xl border border-dashed border-foreground/15 p-3">
                <span className="text-sm font-semibold text-foreground">{t.name}</span>
                <span className="mt-6 text-[10px] text-muted-foreground">Libre</span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
