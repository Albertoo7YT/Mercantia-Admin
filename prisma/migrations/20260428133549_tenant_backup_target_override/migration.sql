-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "backupSubdir" TEXT,
ADD COLUMN     "backupTargetId" TEXT;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_backupTargetId_fkey" FOREIGN KEY ("backupTargetId") REFERENCES "BackupTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
