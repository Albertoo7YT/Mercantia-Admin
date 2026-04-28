/**
 * Seed del catálogo de planes (Starter / Pro / Business).
 * Idempotente: usa upsert por slug.
 *
 * Uso: npm run seed:plans
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PLANS = [
  {
    slug: "starter",
    name: "Starter",
    monthlyPrice: 4100, // 41,00 €
    yearlyPrice: 49000, // 490,00 €
    maxAdmins: 1,
    maxOffice: 1,
    maxSales: 3,
    multiWarehouse: false,
    apiAccess: false,
    description: "Para empezar",
    isPopular: false,
    sortOrder: 1,
  },
  {
    slug: "pro",
    name: "Pro",
    monthlyPrice: 8300, // 83,00 €
    yearlyPrice: 99000, // 990,00 €
    maxAdmins: 2,
    maxOffice: 3,
    maxSales: 10,
    multiWarehouse: false,
    apiAccess: true,
    description: "Cuando necesitas integrar",
    isPopular: true,
    sortOrder: 2,
  },
  {
    slug: "business",
    name: "Business",
    monthlyPrice: 16600, // 166,00 €
    yearlyPrice: 199000, // 1990,00 €
    maxAdmins: 5,
    maxOffice: 8,
    maxSales: 25,
    multiWarehouse: true,
    apiAccess: true,
    description: "Operativa compleja",
    isPopular: false,
    sortOrder: 3,
  },
];

async function main() {
  for (const p of PLANS) {
    const result = await prisma.plan.upsert({
      where: { slug: p.slug },
      create: p,
      update: p,
    });
    console.log(`✓ ${result.slug} (${result.name})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
