/**
 * Test de conectividad contra la API admin de un tenant.
 * Uso: npm run test:tenant <slug>
 */
import { PrismaClient } from "@prisma/client";
import {
  createDecipheriv,
  createHash,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function decrypt(ciphertext: string, secret: string): string {
  const key = deriveKey(secret);
  const data = Buffer.from(ciphertext, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Uso: npm run test:tenant <slug>");
    process.exit(1);
  }
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    console.error("Falta SESSION_SECRET en el entorno.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) {
      console.error(`Tenant '${slug}' no encontrado.`);
      process.exit(1);
    }

    const token = decrypt(tenant.apiToken, secret);
    const url = new URL("/api/admin/system/health", tenant.apiUrl).toString();

    console.log(`→ ${url}`);
    const start = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    const ms = Date.now() - start;
    const text = await res.text();
    console.log(`← HTTP ${res.status} en ${ms}ms`);
    console.log(text);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
