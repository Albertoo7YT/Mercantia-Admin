/**
 * Lista todos los tenants e intenta descifrar su apiToken con el
 * SESSION_SECRET actual. Marca con ✓ los que descifran y con ✗ los que
 * tienen el token cifrado con un SESSION_SECRET distinto al actual
 * (probablemente porque cambiaste el secreto).
 *
 * Uso: npm run check:tokens
 */
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());
  // Imports diferidos para que env.ts no se queje al cargar el módulo.
  const { PrismaClient } = await import("@prisma/client");
  const { safeDecrypt } = await import("../lib/crypto");

  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, apiUrl: true, apiToken: true },
      orderBy: { name: "asc" },
    });

    if (tenants.length === 0) {
      console.log("No hay tenants registrados.");
      return;
    }

    let okCount = 0;
    let failCount = 0;
    for (const t of tenants) {
      const decrypted = safeDecrypt(t.apiToken);
      if (decrypted) {
        okCount++;
        console.log(`✓ ${t.name.padEnd(28)} (${t.slug}) — token OK`);
      } else {
        failCount++;
        console.log(
          `✗ ${t.name.padEnd(28)} (${t.slug}) — token NO descifra (re-edita el tenant y vuelve a poner el API Token)`,
        );
      }
    }

    console.log();
    console.log(`Resumen: ${okCount} OK, ${failCount} con problemas.`);
    if (failCount > 0) {
      console.log();
      console.log("Para arreglar cada uno con problemas:");
      console.log("  1. Abre /tenants/<id>/edit");
      console.log("  2. Pega el bearer token del cliente en el campo API Token");
      console.log("  3. Guardar");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
