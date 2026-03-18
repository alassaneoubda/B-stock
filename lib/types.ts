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
