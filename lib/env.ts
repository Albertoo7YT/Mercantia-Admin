import fs from "node:fs";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

/**
 * Lee el hash bcrypt del admin. Permite dos modos:
 *   1) ADMIN_PASSWORD="<hash>" en .env (forma directa)
 *   2) ADMIN_PASSWORD_FILE="/ruta/al/fichero" → lee el hash de ese fichero.
 *
 * El modo (2) existe porque algunos parsers de dotenv (incluido el que usa
 * @next/env en ciertas versiones) **expanden `$XX` como variables incluso
 * dentro de comillas simples**, corrompiendo los hashes bcrypt que empiezan
 * por `$2a$12$...`. Si tu hash llega truncado a la app, usa
 * ADMIN_PASSWORD_FILE.
 */
function readAdminPassword(): string {
  const filePath = process.env.ADMIN_PASSWORD_FILE;
  if (filePath && filePath.length > 0) {
    try {
      const content = fs.readFileSync(filePath, "utf8").trim();
      if (content.length === 0) {
        throw new Error(
          `ADMIN_PASSWORD_FILE='${filePath}' está vacío`,
        );
      }
      return content;
    } catch (e) {
      throw new Error(
        `No se pudo leer ADMIN_PASSWORD_FILE='${filePath}': ${(e as Error).message}`,
      );
    }
  }
  return required("ADMIN_PASSWORD");
}

export const env = {
  DATABASE_URL: () => required("DATABASE_URL"),
  ADMIN_PASSWORD: readAdminPassword,
  SESSION_SECRET: () => required("SESSION_SECRET"),
  SESSION_MAX_AGE_HOURS: () =>
    parseInt(optional("SESSION_MAX_AGE_HOURS", "12"), 10),
  PANEL_URL: () => optional("PANEL_URL", "http://localhost:3010"),
  NODE_ENV: () => optional("NODE_ENV", "development"),
  isProd: () => process.env.NODE_ENV === "production",
};
