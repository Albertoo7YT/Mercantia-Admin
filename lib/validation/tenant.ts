import { z } from "zod";

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message: "Slug solo puede contener minúsculas, números y guiones",
  });

export const tenantStatusSchema = z.enum(["active", "suspended", "trial"]);
export type TenantStatus = z.infer<typeof tenantStatusSchema>;

const optionalSubdir = z
  .string()
  .max(200)
  .regex(/^[A-Za-z0-9._/-]*$/, {
    message: "Subdir solo puede contener letras, números, '.', '_', '-' y '/'",
  })
  .optional()
  .or(z.literal(""));

const optionalBackupTargetId = z
  .string()
  .max(64)
  .optional()
  .or(z.literal(""));

// Hours como string CSV ("3" o "3,15") → array de ints 0-23.
const backupScheduleHours = z
  .union([z.string(), z.array(z.number()), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return [];
    if (Array.isArray(v)) return v;
    return v
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
  })
  .pipe(
    z
      .array(z.number().int().min(0).max(23))
      .max(24)
      .transform((arr) => Array.from(new Set(arr)).sort((a, b) => a - b)),
  );

const backupScheduleEnabled = z
  .union([z.boolean(), z.literal("on"), z.literal(""), z.null(), z.undefined()])
  .transform((v) => v === true || v === "on");

const backupRetention = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === "") return 30;
    const n = typeof v === "string" ? parseInt(v, 10) : v;
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 365) : 30;
  });

export const tenantCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  apiUrl: z.string().url(),
  apiToken: z.string().min(8).max(512),
  status: tenantStatusSchema.default("active"),
  notes: z.string().max(2000).optional().or(z.literal("")),
  backupTargetId: optionalBackupTargetId,
  backupSubdir: optionalSubdir,
  backupScheduleEnabled,
  backupScheduleHours,
  backupRetention,
});

export const tenantUpdateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  apiUrl: z.string().url(),
  apiToken: z.string().min(8).max(512).optional().or(z.literal("")),
  status: tenantStatusSchema,
  notes: z.string().max(2000).optional().or(z.literal("")),
  backupTargetId: optionalBackupTargetId,
  backupSubdir: optionalSubdir,
  backupScheduleEnabled,
  backupScheduleHours,
  backupRetention,
});

export type TenantCreateInput = z.infer<typeof tenantCreateSchema>;
export type TenantUpdateInput = z.infer<typeof tenantUpdateSchema>;
