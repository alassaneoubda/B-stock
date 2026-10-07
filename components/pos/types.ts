export type PosCatalogItem = {
  variant_id: string
  product_id: string
  product_name: string
  category: string | null
  brand: string | null
  packaging_name: string | null
  price: number
  stock: number
  reserved: number
  available: number
}

export type PosTable = {
  id: string
  name: string
  area: string | null
  seats: number | null
  sort_order: number
}

export type PosOpenOrder = {
  id: string
  ticket_number: string
  table_id: string | null
  order_type: 'table' | 'counter' | 'takeaway'
  label: string | null
  covers: number | null
  opened_at: string
  client_id: string | null
  client_name: string | null
  opened_by_name: string | null
  total: number
  items_count: number
  last_item_at: string | null
}

export type PosState = {
  depotId: string
  depots: { id: string; name: string; is_main: boolean }[]
  canManage: boolean
  tables: PosTable[]
  openOrders: PosOpenOrder[]
  catalog: PosCatalogItem[]
}

export type PosOrderItem = {
  id: string
  product_variant_id: string
  quantity: number
  unit_price: number
  status: 'active' | 'void'
  void_reason: string | null
  created_at: string
  added_by: string | null
  product_name: string
  packaging_name: string | null
  added_by_name: string | null
}

export type PosOrder = {
  id: string
  ticket_number: string
  table_id: string | null
  table_name: string | null
  order_type: 'table' | 'counter' | 'takeaway'
  label: string | null
  covers: number | null
  client_id: string | null
  client_name: string | null
  client_credit_limit: string | null
  status: 'open' | 'paid' | 'cancelled'
  opened_at: string
  opened_by_name: string | null
  items: PosOrderItem[]
  total: number
}

export type PaidTicket = {
  ticketNumber: string
  orderNumber: string
  tableName: string | null
  label: string | null
  items: { name: string; quantity: number; unitPrice: number }[]
  total: number
  paymentMethod: 'cash' | 'mobile_money' | 'credit' | 'mixed'
  received: number
  change: number
  paidAt: string
  cashierName: string
}

export function orderTitle(order: { table_name?: string | null; order_type: string; label: string | null; ticket_number: string }) {
  if (order.table_name) return order.table_name
  if (order.label) return order.label
  return order.order_type === 'takeaway' ? 'À emporter' : 'Comptoir'
}

export function variantLabel(item: { product_name: string; packaging_name: string | null }) {
  // Les emballages générés automatiquement (« Emballage - X ») n'apportent rien à l'écran
  if (!item.packaging_name || item.packaging_name.startsWith('Emballage - ')) return item.product_name
  return `${item.product_name} · ${item.packaging_name}`
}
