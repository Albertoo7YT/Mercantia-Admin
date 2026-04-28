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

export const env = {
  DATABASE_URL: () => required("DATABASE_URL"),
  ADMIN_PASSWORD: () => required("ADMIN_PASSWORD"),
  SESSION_SECRET: () => required("SESSION_SECRET"),
  SESSION_MAX_AGE_HOURS: () =>
    parseInt(optional("SESSION_MAX_AGE_HOURS", "12"), 10),
  PANEL_URL: () => optional("PANEL_URL", "http://localhost:3010"),
  NODE_ENV: () => optional("NODE_ENV", "development"),
  isProd: () => process.env.NODE_ENV === "production",
};
