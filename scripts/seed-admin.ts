/**
 * Seed inicial para el panel admin de Mercantia.
 * - Si la BD está vacía (sin OperationLog), inserta un evento "panel.initialized".
 * - No crea tenants automáticamente.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.operationLog.count();
  if (existing > 0) {
    console.log(`Ya hay ${existing} operaciones registradas, no se hace nada.`);
    return;
  }

  await prisma.operationLog.create({
    data: {
      action: "panel.initialized",
      actor: "system",
      status: "success",
      details: {
        seededAt: new Date().toISOString(),
        nodeVersion: process.version,
      },
    },
  });

  console.log("✓ Panel marcado como inicializado.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
