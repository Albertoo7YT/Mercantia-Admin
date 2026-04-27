import { z } from "zod";

export const backupTargetSchema = z.object({
  name: z.string().min(1).max(120),
  host: z.string().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  username: z.string().min(1).max(120),
  sshKeyPath: z.string().min(1).max(500),
  remotePath: z.string().min(1).max(500),
  isDefault: z.coerce.boolean().default(false),
});

export type BackupTargetInput = z.infer<typeof backupTargetSchema>;
