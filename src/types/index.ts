export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: 'ADMIN' | 'SALES';
  account_status?: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'REJECTED';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerStatus {
  id: number;
  code: string;
  label: string;
  color_code: string;
  sort_order: number;
  is_active: boolean;
}

export interface FollowUpRule {
  id: number;
  step_number: number;
  name: string;
  interval_days: number;
  is_active: boolean;
  description: string;
}

export interface CustomerCustomRule {
  id: number;
  customer_id: number;
  step_number: number;
  interval_days: number;
}

export type FollowUpCategory = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'COMPLETED';

export interface Customer {
  id: number;
  customer_code: string;
  name: string;
  company_name: string;
  whatsapp_number: string;
  phone_number: string;
  email: string;
  address: string;
  city: string;
  pic_name: string;
  assigned_sales_id: number;
  status_id: number;
  notes: string;
  use_custom_rule: boolean;
  current_rule_step: number;
  last_contact_date: string;
  next_follow_up_date: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  status?: CustomerStatus;
  sales?: { id: number; name: string; email?: string; phone?: string } | null;
  fu_status?: FollowUpCategory;
  days_since_contact?: number;
  custom_rules?: CustomerCustomRule[];
  activities?: FollowUpActivity[];
  transactions?: Transaction[];
  total_omzet?: number;
}

export interface WhatsAppTemplate {
  id: number;
  title: string;
  code: string;
  category: string;
  content: string;
  is_active: boolean;
  created_by: number;
  created_at: string;
}

export interface FollowUpActivity {
  id: number;
  customer_id: number;
  user_id: number;
  user_name?: string;
  activity_date: string;
  channel: 'WHATSAPP' | 'PHONE' | 'EMAIL' | 'MEETING' | 'OTHER';
  template_id: number | null;
  template_name?: string | null;
  message_sent: string;
  result_status: string;
  notes: string;
  rule_step_executed: number;
  previous_follow_up_date: string | null;
  next_follow_up_date: string | null;
  created_at: string;
}

export interface FollowUpMonitoringItem extends FollowUpActivity {
  customer_name?: string;
  company_name?: string;
  whatsapp_number?: string;
  pic_name?: string;
  city?: string;
  sales_name?: string;
  sales_email?: string;
  customer_status_code?: string;
  customer_status_label?: string;
  customer_status_color?: string;
}

export interface Transaction {
  id: number;
  customer_id: number;
  sales_id: number;
  transaction_date: string; // YYYY-MM-DD
  product: string;
  description: string;
  amount: number;
  status: 'CLOSING' | 'CANCEL';
  notes: string;
  created_at: string;
  updated_at: string;
  // Enriched fields from API:
  customer_name?: string;
  company_name?: string;
  whatsapp_number?: string;
  sales_name?: string;
}

export interface SalesUserAccount extends User {
  customer_count: number;
  closing_count: number;
  total_omzet: number;
}

export interface OmzetSummary {
  total_omzet: number;
  closing_count: number;
  cancel_count: number;
  cancel_amount: number;
  omzet_this_month: number;
  omzet_today: number;
  by_sales: Array<{
    sales_id: number;
    sales_name: string;
    omzet: number;
    closing_count: number;
  }>;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  user_name?: string;
  action: string;
  entity: string;
  entity_id: number | null;
  ip_address: string;
  user_agent: string;
  old_data: any;
  new_data: any;
  created_at: string;
}

export interface DashboardStats {
  stats: {
    total_customers: number;
    due_today: number;
    overdue: number;
    upcoming: number;
    completed: number;
    new_customers: number;
  };
  customer_summary?: {
    total: number;
    prospek: number;
    follow_up: number;
    negosiasi: number;
    closing: number;
    cancel: number;
    inactive: number;
  };
  omzet_summary?: OmzetSummary;
  priority_action_list: {
    overdue: Customer[];
    due_today: Customer[];
    upcoming: Customer[];
  };
}
