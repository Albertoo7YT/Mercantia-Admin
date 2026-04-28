/**
 * Genera un hash bcrypt, lo escribe DIRECTAMENTE en .env con comillas dobles
 * y los `$` escapados como `\$` (que es lo que el dotenv parser de Next
 * reconoce sin expandir variables), y luego CARGA el .env con el mismo
 * loader que usa Next para verificar el valor que verá la app.
 *
 * Uso:
 *   npm run set-password "miPassword123"
 */
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { loadEnvConfig } from "@next/env";

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Uso: npm run set-password "<password>"');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const envFile = path.resolve(".env");
  if (!fs.existsSync(envFile)) {
    console.error("No se encuentra .env. Crea uno copiando .env.example.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);

  // Probamos varios formatos hasta dar con uno que sobreviva al loader de
  // @next/env. dotenv-expand expande `$VAR` por defecto y los hashes bcrypt
  // empiezan por `$2a$12$...`, así que necesitamos escapar.
  // Orden deliberado: las comillas simples nunca expanden variables y son el
  // formato más portable. Las dobles + escape solo funcionan si el runtime
  // procesa `\$`, lo cual no es universal (en prod con @next/env nuevo
  // funciona en la verificación pero falla en next start). Por eso van al
  // final como fallback.
  const candidates = [
    { label: "single quotes", line: `ADMIN_PASSWORD='${hash}'` },
    { label: "no quotes", line: `ADMIN_PASSWORD=${hash}` },
    { label: "no quotes + \\$ escape", line: `ADMIN_PASSWORD=${hash.replace(/\$/g, "\\$")}` },
    {
      label: "double quotes + \\$ escape",
      line: `ADMIN_PASSWORD="${hash.replace(/\$/g, "\\$")}"`,
    },
  ];

  const original = fs.readFileSync(envFile, "utf8");

  let chosen: { label: string; line: string } | null = null;
  let chosenLoaded = "";

  for (const candidate of candidates) {
    let content = original;
    if (/^ADMIN_PASSWORD\s*=.*$/m.test(content)) {
      content = content.replace(/^ADMIN_PASSWORD\s*=.*$/m, candidate.line);
    } else {
      content = content.trimEnd() + "\n" + candidate.line + "\n";
    }
    fs.writeFileSync(envFile, content);

    delete process.env.ADMIN_PASSWORD;
    // @next/env caches the loaded files in module state; pass forceReload=true
    // (3rd arg in newer versions; we pass it positionally to be safe).
    loadEnvConfig(process.cwd(), false, { info: () => {}, error: () => {} }, true);

    const loaded = process.env.ADMIN_PASSWORD ?? "";
    const ok = await bcrypt.compare(password, loaded).catch(() => false);
    if (ok) {
      chosen = candidate;
      chosenLoaded = loaded;
      break;
    }
  }

  if (!chosen) {
    console.error("✗ Ninguno de los formatos del hash sobrevive al loader de Next.");
    console.error("Esto es muy raro. Pega aquí el contenido de .env y miramos.");
    process.exit(2);
  }

  const loaded = chosenLoaded;
  const ok = true;

  console.log("──────────────────────────────────────────────────");
  console.log(`Formato que funciona: ${chosen.label}`);
  console.log("Línea escrita en .env:");
  console.log("  " + chosen.line);
  console.log("──────────────────────────────────────────────────");
  console.log("Lo que verá Next al arrancar:");
  console.log("  longitud:", loaded.length);
  console.log("  inicio:", JSON.stringify(loaded.slice(0, 12)));
  console.log("  formato bcrypt:", /^\$2[aby]\$\d{2}\$.{53}$/.test(loaded));
  console.log("  bcrypt.compare:", ok ? "OK ✓" : "FALLA ✗");
  console.log("──────────────────────────────────────────────────");
  console.log();
  console.log("✓ Listo. Reinicia `npm run dev` (Ctrl+C y volver a arrancar)");
  console.log("  y prueba el login con la contraseña que pasaste.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
