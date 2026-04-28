import {
  CreditCard,
  HelpCircle,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const TICKET_CATEGORIES = [
  "tech_support",
  "billing",
  "improvement",
  "other",
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  tech_support: "Soporte técnico",
  billing: "Facturación",
  improvement: "Mejora del programa",
  other: "Otro",
};

export const TICKET_CATEGORY_DESCRIPTIONS: Record<TicketCategory, string> = {
  tech_support: "Bugs, errores, problemas de uso",
  billing: "Pagos, facturas, contratos",
  improvement: "Sugerencias y nuevas funcionalidades",
  other: "Cualquier otro tema",
};

export const TICKET_CATEGORY_ICONS: Record<TicketCategory, LucideIcon> = {
  tech_support: Wrench,
  billing: CreditCard,
  improvement: Sparkles,
  other: HelpCircle,
};

export const TICKET_CATEGORY_COLORS: Record<TicketCategory, string> = {
  tech_support: "red",
  billing: "orange",
  improvement: "blue",
  other: "gray",
};

export const TICKET_PRIORITIES = ["low", "normal", "high"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
};

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: "gray",
  normal: "blue",
  high: "red",
};

export const TICKET_STATUSES = [
  "open",
  "pending_admin",
  "pending_user",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Abierto",
  pending_admin: "Pendiente de respuesta",
  pending_user: "Esperando al cliente",
  resolved: "Resuelto",
  closed: "Cerrado",
};

export const TICKET_STATUS_COLORS: Record<TicketStatus, string> = {
  open: "yellow",
  pending_admin: "yellow",
  pending_user: "blue",
  resolved: "green",
  closed: "gray",
};

export function isTerminalTicketStatus(s: string): boolean {
  return s === "resolved" || s === "closed";
}

export function isValidCategory(s: string): s is TicketCategory {
  return (TICKET_CATEGORIES as readonly string[]).includes(s);
}
export function isValidStatus(s: string): s is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(s);
}
export function isValidPriority(s: string): s is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(s);
}

// Attachments accepted from the panel side. Same defaults as branding logos.
export const TICKET_MAX_ATTACHMENTS = 5;
export const TICKET_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
