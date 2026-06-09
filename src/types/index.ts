export type TicketCategory =
  | "BUG"
  | "MAINTENANCE"
  | "CLOUD_MAINTENANCE"
  | "DATABASE"
  | "DEPLOYMENT_STAGING"
  | "DEPLOYMENT_PROD"
  | "FEATURE"
  | "HARDWARE"
  | "BREAK_FIX"
  | 'IT_SUPPORT'

export type TicketPriority = "HIGH" | "MEDIUM" | "LOW";

export type TicketStatus = "TODO" | "BACKLOG" | "IN_PROGRESS" | "DONE" | "CANCELLED" | "INVALID";

export type InvoiceStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "SENT" | "PAID";

export interface Client {
  id: number;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  invoice_prefix: string;
  default_rate: number;
  address: string;
  created_at: Date;
  updated_at: Date;
}

export interface ClientRate {
  id: number;
  client_id: number;
  category: TicketCategory | "MEETING";
  rate: number;
  created_at: Date;
  updated_at: Date;
}

export interface Ticket {
  id: number;
  ticket_number: string;
  client_id: number;
  subject: string;
  description: string | null;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  created_at: Date;
  updated_at: Date;
}

export interface WorkLog {
  id: number;
  ticket_id: number;
  client_id: number;
  qty: number;
  unit_price: number | null;
  description: string | null;
  worked_date: string;
  created_at: Date;
  updated_at: Date;
}

export interface Comment {
  id: number;
  ticket_id: number;
  body: string;
  created_at: Date;
  updated_at: Date;
}

export interface Meeting {
  id: number;
  client_id: number;
  description: string;
  meeting_date: string;
  start_time: string | null;
  end_time: string | null;
  hours: number;
  invoice_id: number | null;
  created_at: Date;
}

export interface Invoice {
  id: number;
  client_id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_hours: number;
  total_amount: number;
  status: InvoiceStatus;
  pdf_path: string | null;
  sent_at: Date | null;
  paid_at: Date | null;
}

export interface CreateTicketPayload {
  client_id: number;
  subject: string;
  description?: string;
  category: TicketCategory;
  priority?: TicketPriority;
}

export interface UpdateTicketPayload {
  subject?: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
}

export interface LogTimePayload {
  qty: number;
  unit_price?: number; // set for HARDWARE, omit for services
  description?: string;
  worked_date: string;
}

export interface CreateCommentPayload {
  body: string;
}

export interface CreateMeetingPayload {
  client_id: number;
  description: string;
  meeting_date: string;
  start_time?: string;
  end_time?: string;
  hours: number;
}

export const CATEGORY_LABELS: Record<TicketCategory, string> = {
  BUG: "Bug Fix",
  MAINTENANCE: "Maintenance",
  CLOUD_MAINTENANCE: "Cloud Maintenance",
  DATABASE: "Database Enhancement",
  DEPLOYMENT_STAGING: "Deployment (Staging)",
  DEPLOYMENT_PROD: "Deployment",
  FEATURE: "Feature",
  HARDWARE: "Hardware",
  BREAK_FIX: "Break-Fix",
  IT_SUPPORT: 'IT Support'
};

export interface CreateExpensePayload {
  client_id: number;
  ticket_id?: number;
  description: string;
  amount: number;
  markup_pct?: number;
  expense_date: string;
}
