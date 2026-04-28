import { z } from "zod";

const periodMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
  message: "periodMonth debe tener formato YYYY-MM",
});

const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  });

const optionalString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) return null;
    const t = v.trim();
    return t.length === 0 ? null : t;
  });

export const invoiceCreateSchema = z.object({
  periodMonth,
  amountCents: z.number().int().min(0).max(100_000_000),
  status: z.enum(["pending", "paid", "cancelled"]).default("pending"),
  dueDate: optionalDate,
  paidAt: optionalDate,
  paymentMethod: optionalString,
  paymentReference: optionalString,
  notes: optionalString,
});

export const invoiceUpdateSchema = z.object({
  amountCents: z.number().int().min(0).max(100_000_000).optional(),
  status: z.enum(["pending", "paid", "cancelled"]).optional(),
  dueDate: optionalDate,
  paidAt: optionalDate,
  paymentMethod: optionalString,
  paymentReference: optionalString,
  notes: optionalString,
});

export const invoiceMarkPaidSchema = z.object({
  paidAt: z.string().optional(),
  paymentMethod: optionalString,
  paymentReference: optionalString,
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
