import { z } from "zod";

// Accept number | string | null | undefined and coerce to number | null.
// (`null` was missing before, which made the form fail with 400 whenever
// overrides were disabled — `draftToPayload` sends `null` for empty overrides.)
const optionalNumber = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => {
    if (v === "" || v === null || v === undefined) return null;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) ? n : null;
  })
  .pipe(z.number().int().min(0).max(10_000_000).nullable());

const optionalBool = z
  .union([z.boolean(), z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : Boolean(v)));

const optionalString = z
  .union([z.string(), z.null()])
  .transform((v) => {
    if (v === null) return null;
    const t = v.trim();
    return t.length === 0 ? null : t;
  });

const optionalDate = z
  .union([z.string(), z.null()])
  .transform((v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  });

export const subscriptionUpdateSchema = z.object({
  planId: optionalString.nullable(),

  customMaxAdmins: optionalNumber.optional(),
  customMaxOffice: optionalNumber.optional(),
  customMaxSales: optionalNumber.optional(),
  customMultiWarehouse: optionalBool.optional(),
  customApiAccess: optionalBool.optional(),

  contractStartDate: optionalDate.optional(),
  billingCycle: z
    .enum(["monthly", "yearly"])
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v === "" || v === null ? null : v))
    .optional(),
  customMonthlyPrice: optionalNumber.optional(),
  installationPrice: optionalNumber.optional(),
  installationPaidAt: optionalDate.optional(),

  nextPaymentDate: optionalDate.optional(),
  paymentStatus: z
    .enum(["active", "overdue", "trial", "suspended"])
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v === "" || v === null ? null : v))
    .optional(),
  paymentMethod: optionalString.optional(),

  notes: optionalString.optional(),
});

export type SubscriptionUpdateInput = z.infer<typeof subscriptionUpdateSchema>;
