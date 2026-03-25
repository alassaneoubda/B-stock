// ===== Database types — aligned with SQL schema =====

export type UserRole = 'owner' | 'manager' | 'cashier' | 'warehouse_keeper'
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled'
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
export type PurchaseOrderStatus = 'pending' | 'confirmed' | 'received' | 'partial' | 'cancelled'
export type PaymentMethod = 'cash' | 'mobile_money' | 'credit' | 'mixed'
export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded'
export type AlertType = 'low_stock' | 'expiry' | 'credit_limit' | 'packaging_debt' | 'payment_overdue'
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical'
export type TourStatus = 'planned' | 'loading' | 'in_progress' | 'completed' | 'cancelled'
export type StopStatus = 'pending' | 'delivered' | 'partial' | 'failed'
export type MovementType = 'purchase' | 'sale' | 'return' | 'adjustment' | 'transfer' | 'damage'
export type PackagingTransactionType = 'given' | 'returned' | 'debt'
export type CashSessionStatus = 'open' | 'closed'
export type CashMovementType = 'cash_in' | 'cash_out'
export type CashMovementCategory = 'sale' | 'credit_payment' | 'expense' | 'refund' | 'deposit' | 'withdrawal' | 'other'
export type ExpenseCategory = 'fuel' | 'maintenance' | 'salary' | 'rent' | 'utilities' | 'supplies' | 'transport' | 'other'
export type CreditNoteStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'written_off'
export type ReturnType = 'client' | 'supplier'
export type ReturnStatus = 'pending' | 'approved' | 'processed' | 'rejected'
export type RefundMethod = 'credit_note' | 'cash' | 'replacement'
export type ItemCondition = 'good' | 'damaged' | 'expired'
export type BreakageType = 'breakage' | 'loss' | 'expiry' | 'theft'
export type BreakageStatus = 'reported' | 'approved' | 'rejected'
export type TransferStatus = 'pending' | 'in_transit' | 'received' | 'partial' | 'cancelled'
export type InventoryType = 'full' | 'partial' | 'spot_check'
export type InventoryStatus = 'in_progress' | 'completed' | 'cancelled'
export type CommissionStatus = 'pending' | 'approved' | 'paid'
export type DiscountType = 'percentage' | 'fixed_amount' | 'buy_x_get_y'
export type AuditAction = 'create' | 'update' | 'delete' | 'login' | 'logout' | 'export' | 'print'

// ===== Core entities =====

export interface Company {
  id: string
  name: string
  slug: string
  sector?: string
  address?: string
  phone?: string
  email?: string
  logo_url?: string
  currency: string
  timezone: string
  subscription_status: SubscriptionStatus
  subscription_plan_id?: string
  stripe_customer_id?: string
  stripe_subscription_id?: string
  trial_ends_at?: string
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  company_id: string
  email: string
  password_hash: string
  full_name: string
  phone?: string
  role: UserRole
  is_active: boolean
  last_login_at?: string
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  company_id: string
  name: string
  description?: string
  sku?: string
  category?: string
  brand?: string
  base_unit: string
  purchase_price: number
  selling_price: number
  image_url?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PackagingType {
  id: string
  company_id: string
  name: string
  description?: string
  units_per_case: number
  is_returnable: boolean
  deposit_price: number
  created_at: string
}

export interface ProductVariant {
  id: string
  product_id: string
  packaging_type_id: string
  barcode?: string
  price: number
  cost_price?: number
  created_at: string
}

export interface Depot {
  id: string
  company_id: string
  name: string
  address?: string
  phone?: string
  is_main: boolean
  created_at: string
}

export interface Stock {
  id: string
  depot_id: string
  product_variant_id: string
  lot_number?: string
  quantity: number
  expiry_date?: string
  min_stock_alert: number
  created_at: string
  updated_at: string
}

export interface PackagingStock {
  id: string
  depot_id: string
  packaging_type_id: string
  quantity: number
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  company_id: string
  name: string
  type?: string
  contact_name?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  created_at: string
}

export interface Client {
  id: string
  company_id: string
  name: string
  contact_name?: string
  phone?: string
  email?: string
  address?: string
  gps_coordinates?: string
  zone?: string
  client_type: string
  credit_limit: number
  packaging_credit_limit: number
  payment_terms_days: number
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ClientAccount {
  id: string
  client_id: string
  account_type: 'product' | 'packaging'
  balance: number
  last_transaction_at?: string
  created_at: string
  updated_at: string
}

export interface SalesOrder {
  id: string
  company_id: string
  client_id: string
  depot_id?: string
  order_number: string
  status: OrderStatus
  order_source?: string
  subtotal?: number
  packaging_total?: number
  total_amount: number
  paid_amount: number
  payment_method?: PaymentMethod
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface SalesOrderItem {
  id: string
  sales_order_id: string
  product_variant_id: string
  quantity: number
  unit_price: number
  total_price: number
  lot_number?: string
  created_at: string
}

export interface SalesOrderPackagingItem {
  id: string
  sales_order_id: string
  packaging_type_id: string
  quantity_out: number
  quantity_in: number
  unit_price?: number
  created_at: string
}

export interface PackagingTransaction {
  id: string
  company_id: string
  client_id: string
  sales_order_id?: string
  packaging_type_id: string
  transaction_type: PackagingTransactionType
  quantity: number
  unit_price?: number
  total_amount?: number
  notes?: string
  created_by?: string
  created_at: string
}

export interface Payment {
  id: string
  company_id: string
  client_id: string
  sales_order_id?: string
  amount: number
  payment_method: string
  payment_type?: string
  status: PaymentStatus
  reference?: string
  notes?: string
  received_by?: string
  created_at: string
}

export interface Vehicle {
  id: string
  company_id: string
  name?: string
  plate_number: string
  vehicle_type: string
  capacity_cases?: number
  driver_name?: string
  driver_phone?: string
  is_active: boolean
  created_at: string
}

export interface DeliveryTour {
  id: string
  company_id: string
  vehicle_id: string
  depot_id?: string
  tour_date: string
  status: TourStatus
  driver_name?: string
  notes?: string
  started_at?: string
  completed_at?: string
  created_by?: string
  created_at: string
}

export interface TourStop {
  id: string
  delivery_tour_id: string
  sales_order_id?: string
  client_id: string
  stop_order: number
  status: StopStatus
  delivered_at?: string
  notes?: string
  created_at: string
}

export interface StockMovement {
  id: string
  company_id: string
  depot_id: string
  product_variant_id: string
  movement_type: MovementType
  quantity: number
  reference_type?: string
  reference_id?: string
  lot_number?: string
  notes?: string
  created_by?: string
  created_at: string
}

export interface Alert {
  id: string
  company_id: string
  alert_type: AlertType
  severity: AlertSeverity
  title: string
  message?: string
  reference_type?: string
  reference_id?: string
  is_read: boolean
  is_resolved: boolean
  created_at: string
}

export interface SubscriptionPlan {
  id: string
  name: string
  description?: string
  price_monthly: number
  price_yearly: number
  max_users: number
  max_depots: number
  max_products: number
  max_clients: number
  features: Record<string, unknown>
  stripe_price_id_monthly?: string
  stripe_price_id_yearly?: string
  is_active: boolean
  created_at: string
}

// ===== Auth types =====

export interface SessionUser {
  id: string
  email: string
  name: string
  role: UserRole
  companyId: string
  companyName: string
  companySlug: string
}

// ===== API Response types =====

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// ===== Dashboard stats =====

export interface DashboardStats {
  totalSales: number
  totalOrders: number
  totalClients: number
  pendingDeliveries: number
  lowStockAlerts: number
  recentOrders: SalesOrder[]
  topProducts: { product: Product; quantity: number }[]
}

// ===== Cash Management =====

export interface CashSession {
  id: string
  company_id: string
  depot_id?: string
  opened_by: string
  closed_by?: string
  opening_amount: number
  closing_amount?: number
  expected_amount?: number
  variance?: number
  total_sales: number
  total_expenses: number
  total_cash_in: number
  total_cash_out: number
  status: CashSessionStatus
  notes?: string
  opened_at: string
  closed_at?: string
  created_at: string
}

export interface CashMovement {
  id: string
  company_id: string
  cash_session_id: string
  movement_type: CashMovementType
  category: CashMovementCategory
  amount: number
  description?: string
  reference_type?: string
  reference_id?: string
  created_by?: string
  created_at: string
}

export interface Expense {
  id: string
  company_id: string
  cash_session_id?: string
  category: ExpenseCategory
  amount: number
  description?: string
  receipt_url?: string
  expense_date: string
  created_by?: string
  created_at: string
}

// ===== Credit Management =====

export interface CreditNote {
  id: string
  company_id: string
  client_id: string
  sales_order_id?: string
  credit_number: string
  total_amount: number
  paid_amount: number
  due_date?: string
  status: CreditNoteStatus
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
}

export interface CreditPayment {
  id: string
  credit_note_id: string
  amount: number
  payment_method?: string
  reference?: string
  notes?: string
  received_by?: string
  created_at: string
}

export interface CreditReminder {
  id: string
  credit_note_id: string
  reminder_type?: string
  message?: string
  sent_at: string
  sent_by?: string
  created_at: string
}

// ===== Sales Agents =====

export interface SalesAgent {
  id: string
  company_id: string
  user_id?: string
  full_name: string
  phone?: string
  email?: string
  zone?: string
  commission_rate: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AgentCommission {
  id: string
  agent_id: string
  sales_order_id?: string
  commission_amount: number
  commission_rate?: number
  status: CommissionStatus
  paid_at?: string
  created_at: string
}

// ===== Inventory =====

export interface InventorySession {
  id: string
  company_id: string
  depot_id?: string
  session_number?: string
  inventory_type: InventoryType
  status: InventoryStatus
  total_items: number
  items_with_variance: number
  total_variance_value: number
  notes?: string
  started_by?: string
  completed_by?: string
  started_at: string
  completed_at?: string
  created_at: string
}

export interface InventoryItem {
  id: string
  inventory_session_id: string
  product_variant_id?: string
  packaging_type_id?: string
  item_type: string
  system_quantity: number
  counted_quantity?: number
  variance: number
  unit_value: number
  variance_value: number
  notes?: string
  counted_by?: string
  counted_at?: string
  created_at: string
}

// ===== Depot Transfers =====

export interface DepotTransfer {
  id: string
  company_id: string
  transfer_number: string
  source_depot_id: string
  destination_depot_id: string
  status: TransferStatus
  notes?: string
  created_by?: string
  received_by?: string
  shipped_at?: string
  received_at?: string
  created_at: string
  updated_at: string
}

export interface DepotTransferItem {
  id: string
  depot_transfer_id: string
  product_variant_id?: string
  packaging_type_id?: string
  item_type: string
  quantity_sent: number
  quantity_received: number
  quantity_damaged: number
  created_at: string
}

// ===== Returns =====

export interface Return {
  id: string
  company_id: string
  return_number: string
  return_type: ReturnType
  client_id?: string
  supplier_id?: string
  sales_order_id?: string
  purchase_order_id?: string
  depot_id?: string
  status: ReturnStatus
  reason?: string
  total_amount: number
  refund_method?: RefundMethod
  notes?: string
  created_by?: string
  processed_by?: string
  processed_at?: string
  created_at: string
  updated_at: string
}

export interface ReturnItem {
  id: string
  return_id: string
  product_variant_id?: string
  packaging_type_id?: string
  item_type: string
  quantity: number
  unit_price?: number
  total_price?: number
  condition: ItemCondition
  notes?: string
  created_at: string
}

// ===== Price Rules & Promotions =====

export interface PriceRule {
  id: string
  company_id: string
  product_variant_id?: string
  client_type?: string
  price: number
  min_quantity: number
  is_active: boolean
  valid_from?: string
  valid_until?: string
  created_at: string
  updated_at: string
}

export interface Promotion {
  id: string
  company_id: string
  name: string
  description?: string
  discount_type: DiscountType
  discount_value: number
  applies_to: string
  product_variant_id?: string
  category?: string
  client_type?: string
  min_quantity: number
  min_order_amount?: number
  is_active: boolean
  valid_from?: string
  valid_until?: string
  created_at: string
}

// ===== Breakage & Losses =====

export interface BreakageRecord {
  id: string
  company_id: string
  depot_id?: string
  record_type: BreakageType
  product_variant_id?: string
  packaging_type_id?: string
  item_type: string
  quantity: number
  unit_value?: number
  total_value?: number
  reason?: string
  delivery_tour_id?: string
  reported_by?: string
  approved_by?: string
  status: BreakageStatus
  created_at: string
  updated_at: string
}

// ===== Audit Logs =====

export interface AuditLog {
  id: string
  company_id: string
  user_id?: string
  action: AuditAction
  entity_type: string
  entity_id?: string
  details?: Record<string, unknown>
  ip_address?: string
  user_agent?: string
  created_at: string
}
