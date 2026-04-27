/**
 * Generates a bcrypt hash for ADMIN_PASSWORD.
 * Usage: npm run hash-password "miPassword123"
 */
import bcrypt from "bcryptjs";

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error("Uso: npm run hash-password <password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  console.log("\nPega este valor en .env como ADMIN_PASSWORD:\n");
  console.log(hash);
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
