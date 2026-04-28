export interface TenantBrandingPayload {
  appName: string;
  brandColor: string;
  brandColorHover?: string;
  brandColorContrast?: string;
  logoUrl?: string;
  logoSmallUrl?: string;
  faviconUrl?: string;
  supportEmail?: string;
  supportPhone?: string;
  companyName?: string;
  companyLegalName?: string;
  companyAddress?: string;
  welcomeMessage?: string;
  loginTitle?: string;
  loginSubtitle?: string;
  footerText?: string;
  metaTitle?: string;
  metaDescription?: string;
}

export interface BrandingAuditEvent {
  id: string | number;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  performedBy?: string | null;
  createdAt: string;
}

export type BrandingField = keyof TenantBrandingPayload;

export const BRANDING_FIELD_LABELS: Record<BrandingField, string> = {
  appName: "Nombre de la app",
  brandColor: "Color principal",
  brandColorHover: "Color hover",
  brandColorContrast: "Color contraste",
  logoUrl: "Logo principal",
  logoSmallUrl: "Logo pequeño",
  faviconUrl: "Favicon",
  supportEmail: "Email de soporte",
  supportPhone: "Teléfono de soporte",
  companyName: "Nombre comercial",
  companyLegalName: "Razón social",
  companyAddress: "Dirección",
  welcomeMessage: "Mensaje de bienvenida",
  loginTitle: "Título del login",
  loginSubtitle: "Subtítulo del login",
  footerText: "Texto del footer",
  metaTitle: "Meta title (SEO)",
  metaDescription: "Meta description (SEO)",
};

export const BRANDING_FIELDS: BrandingField[] = Object.keys(
  BRANDING_FIELD_LABELS,
) as BrandingField[];

// ----- Validators ----------------------------------------------------------

export function isHexColor(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function isEmail(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isHttpUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      // Allow same-origin paths like "/branding/logo.png"
      false
    );
  } catch {
    return false;
  }
}

/**
 * Logos are commonly uploaded to a path served by the same client (e.g.
 * `/branding/logo.png`), so we accept both absolute http(s) URLs and root
 * relative paths.
 */
export function isLogoUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  if (value.startsWith("/")) return true;
  return isHttpUrl(value);
}

export type ValidationErrors = Partial<Record<BrandingField, string>>;

export function validateBranding(
  payload: Partial<TenantBrandingPayload>,
): ValidationErrors {
  const errors: ValidationErrors = {};

  if (payload.appName !== undefined) {
    const v = payload.appName.trim();
    if (v.length === 0) errors.appName = "Obligatorio";
    else if (v.length > 80) errors.appName = "Máx. 80 caracteres";
  }

  for (const key of [
    "brandColor",
    "brandColorHover",
    "brandColorContrast",
  ] as const) {
    const v = payload[key];
    if (v !== undefined && v !== "" && !isHexColor(v)) {
      errors[key] = "Formato esperado #RRGGBB";
    }
  }
  if (payload.brandColor !== undefined) {
    const v = payload.brandColor;
    if (!v || v.length === 0) errors.brandColor = "Obligatorio";
  }

  for (const key of ["logoUrl", "logoSmallUrl", "faviconUrl"] as const) {
    const v = payload[key];
    if (v !== undefined && v !== "" && !isLogoUrl(v)) {
      errors[key] = "URL no válida";
    }
  }

  if (payload.supportEmail !== undefined && payload.supportEmail !== "") {
    if (!isEmail(payload.supportEmail)) {
      errors.supportEmail = "Email no válido";
    }
  }

  return errors;
}

/**
 * Returns the keys whose values differ between two payloads. Treats
 * `undefined`, `null`, and empty string as equivalent so that we don't
 * register a "change" when the user blurs an empty field.
 */
export function diffBranding(
  before: Partial<TenantBrandingPayload>,
  after: Partial<TenantBrandingPayload>,
): BrandingField[] {
  const changed: BrandingField[] = [];
  for (const key of BRANDING_FIELDS) {
    const a = normalize(before[key]);
    const b = normalize(after[key]);
    if (a !== b) changed.push(key);
  }
  return changed;
}

function normalize(v: unknown): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

export const ACCEPTED_LOGO_MIME = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/webp",
];
export const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
