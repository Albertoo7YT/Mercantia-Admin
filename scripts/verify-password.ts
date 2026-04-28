/**
 * Diagnóstico de la contraseña de admin.
 *
 * Lee el `.env` igual que lo lee `next dev` (incluyendo expansión de
 * variables `$VAR` cuando se usan comillas dobles), extrae
 * `ADMIN_PASSWORD`, valida formato bcrypt y compara con la contraseña
 * pasada como argumento.
 *
 * Uso:
 *   npm run verify-password "miPassEnClaro"
 */
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";

function parseEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  const content = fs.readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const m = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      // Comillas dobles: replicamos la expansión de variables que hace
      // @next/env. Esto es exactamente lo que corrompe los hashes bcrypt.
      value = value.slice(1, -1);
      value = value.replace(
        /\$\{?([A-Z_][A-Z0-9_]*)\}?/g,
        (_m, name) => out[name] ?? "",
      );
    } else if (value.startsWith("'") && value.endsWith("'")) {
      // Comillas simples: literal, sin expansión.
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Uso: npm run verify-password "<password en claro>"');
    process.exit(1);
  }

  const envFile = path.resolve(".env");
  if (!fs.existsSync(envFile)) {
    console.error("✗ No se encuentra .env en el directorio actual.");
    process.exit(1);
  }

  const parsed = parseEnv(envFile);
  const hash = parsed.ADMIN_PASSWORD ?? "";

  console.log("ADMIN_PASSWORD que verá Next:");
  console.log("  longitud:", hash.length);
  console.log("  inicio:", JSON.stringify(hash.slice(0, 12)));
  console.log("  formato bcrypt:", /^\$2[aby]\$\d{2}\$.{53}$/.test(hash));
  console.log();

  if (!hash || hash.length < 10) {
    console.error("✗ El valor cargado está vacío o casi vacío.");
    console.error();
    console.error("CAUSA MÁS PROBABLE: tu .env usa COMILLAS DOBLES.");
    console.error('Los hashes bcrypt llevan `$2a$12$...`, y al estar entre "..."');
    console.error("Next interpreta `$2`, `$12`... como variables vacías.");
    console.error();
    console.error("ARREGLO: cambia las comillas dobles por SIMPLES:");
    console.error("  ADMIN_PASSWORD='$2a$12$...'");
    console.error();
    console.error("Luego reinicia `npm run dev`.");
    process.exit(2);
  }

  if (!/^\$2[aby]\$\d{2}\$.{53}$/.test(hash)) {
    console.error("✗ El valor no tiene formato bcrypt válido.");
    console.error('Probable causa: comillas dobles en .env expandiendo `$XX` como variables.');
    console.error('Arreglo: usa comillas simples:  ADMIN_PASSWORD=\'$2a$12$...\'');
    process.exit(2);
  }

  const ok = await bcrypt.compare(password, hash);
  console.log("¿La contraseña coincide?", ok ? "SÍ ✓" : "NO ✗");
  console.log();

  if (!ok) {
    console.error("Posibles causas:");
    console.error("  • Tecleaste distinto al hashear vs ahora (mayúsculas, espacios, acentos).");
    console.error("  • El hash en .env está corrupto.");
    console.error();
    console.error("Solución: genera un hash nuevo");
    console.error('  npm run hash-password "TuPass"');
    console.error("y pégalo en .env entre comillas SIMPLES.");
    process.exit(3);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
