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

export const tenantCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  apiUrl: z.string().url(),
  apiToken: z.string().min(8).max(512),
  status: tenantStatusSchema.default("active"),
  notes: z.string().max(2000).optional().or(z.literal("")),
  backupTargetId: optionalBackupTargetId,
  backupSubdir: optionalSubdir,
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
});

export type TenantCreateInput = z.infer<typeof tenantCreateSchema>;
export type TenantUpdateInput = z.infer<typeof tenantUpdateSchema>;
