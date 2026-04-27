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

export const tenantCreateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  apiUrl: z.string().url(),
  apiToken: z.string().min(8).max(512),
  status: tenantStatusSchema.default("active"),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export const tenantUpdateSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
  apiUrl: z.string().url(),
  apiToken: z.string().min(8).max(512).optional().or(z.literal("")),
  status: tenantStatusSchema,
  notes: z.string().max(2000).optional().or(z.literal("")),
});

export type TenantCreateInput = z.infer<typeof tenantCreateSchema>;
export type TenantUpdateInput = z.infer<typeof tenantUpdateSchema>;
