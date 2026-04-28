/**
 * Helpers for money values stored as integer cents.
 *
 * Conversions never rely on `value * 100` arithmetic: working through
 * `toFixed(2)` and string parsing guarantees that "49" always becomes 4900
 * cents and never 4899 due to float drift.
 */

export function centsToEuros(cents: number | null | undefined): number {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

export function eurosToCents(euros: number | string | null | undefined): number {
  if (euros === null || euros === undefined || euros === "") return 0;
  const raw =
    typeof euros === "string" ? euros.replace(",", ".").trim() : euros;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (!Number.isFinite(n)) return 0;

  const negative = n < 0;
  const abs = Math.abs(n);
  const [intPart, decPart = "00"] = abs.toFixed(2).split(".");
  const cents =
    parseInt(intPart, 10) * 100 +
    parseInt(decPart.padEnd(2, "0").slice(0, 2), 10);
  return negative ? -cents : cents;
}

export function formatEur(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centsToEuros(cents));
}
