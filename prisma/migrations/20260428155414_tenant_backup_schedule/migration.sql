-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "backupLastRunAt" TIMESTAMP(3),
ADD COLUMN     "backupLastRunStatus" TEXT,
ADD COLUMN     "backupRetention" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "backupScheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "backupScheduleHours" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
