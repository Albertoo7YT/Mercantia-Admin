import { z } from "zod";
import { PAYMENT_TYPES } from "@/lib/billing";

export const paymentCreateSchema = z.object({
  amountEuros: z.coerce.number().min(0).max(1_000_000),
  type: z.string().refine((v) => PAYMENT_TYPES.includes(v) || v.length > 0),
  paidAt: z
    .string()
    .or(z.date())
    .transform((v) => {
      if (v instanceof Date) return v;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) {
        throw new Error("Fecha inválida");
      }
      return d;
    }),
  method: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  reference: z.string().max(120).optional().or(z.literal("")),
});

export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;
