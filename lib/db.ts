import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __mercantiaPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__mercantiaPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__mercantiaPrisma = prisma;
}
