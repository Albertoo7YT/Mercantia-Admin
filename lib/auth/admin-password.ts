import "server-only";
import fs from "node:fs";

/**
 * Lee el hash bcrypt del admin desde una de dos fuentes:
 *   1) ADMIN_PASSWORD_FILE="/ruta/al/fichero" → lee el hash del fichero.
 *   2) ADMIN_PASSWORD="<hash>" en .env (fallback directo).
 *
 * El modo (1) existe porque algunas versiones de @next/env / dotenv-expand
 * expanden `$XX` como variables incluso dentro de comillas simples,
 * corrompiendo hashes bcrypt que empiezan por `$2a$12$...`. Si tu hash llega
 * truncado a la app, usa ADMIN_PASSWORD_FILE apuntando a un fichero que
 * contenga sólo el hash.
 *
 * Marcado server-only: import fs from "node:fs" no debe entrar al bundle del
 * cliente.
 */
export function getAdminPasswordHash(): string {
  const filePath = process.env.ADMIN_PASSWORD_FILE;
  if (filePath && filePath.length > 0) {
    try {
      const content = fs.readFileSync(filePath, "utf8").trim();
      if (content.length === 0) {
        throw new Error(`ADMIN_PASSWORD_FILE='${filePath}' está vacío`);
      }
      return content;
    } catch (e) {
      throw new Error(
        `No se pudo leer ADMIN_PASSWORD_FILE='${filePath}': ${(e as Error).message}`,
      );
    }
  }
  const direct = process.env.ADMIN_PASSWORD;
  if (!direct || direct.length === 0) {
    throw new Error(
      "Falta ADMIN_PASSWORD o ADMIN_PASSWORD_FILE en el entorno",
    );
  }
  return direct;
}
