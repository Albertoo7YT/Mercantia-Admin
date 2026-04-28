"use client";

import { Card } from "@/components/ui/card";
import type { TenantBrandingPayload } from "@/lib/types/tenant-branding";
import { isHexColor } from "@/lib/types/tenant-branding";
import { cn } from "@/lib/utils";

const FALLBACK_COLOR = "#2563EB";
const FALLBACK_CONTRAST = "#FFFFFF";

function safe(color: string | undefined, fallback: string) {
  return isHexColor(color ?? "") ? (color as string) : fallback;
}

function getContrast(
  contrast: string | undefined,
  brand: string,
): string {
  if (isHexColor(contrast ?? "")) return contrast as string;
  // Auto-pick black or white based on luminance.
  const c = brand.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  // perceived brightness
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0f172a" : FALLBACK_CONTRAST;
}

export function BrandingPreview({
  payload,
}: {
  payload: Partial<TenantBrandingPayload>;
}) {
  const brand = safe(payload.brandColor, FALLBACK_COLOR);
  const hover = safe(payload.brandColorHover, brand);
  const contrast = getContrast(payload.brandColorContrast, brand);
  const appName = payload.appName?.trim() || "Mercantia";
  const logo = payload.logoUrl?.trim();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">Preview</h3>

      {/* Header mockup */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            {logo ? (
              <img
                src={logo}
                alt="logo"
                className="h-7 w-auto rounded-sm object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <span
                className="grid size-7 place-items-center rounded-sm text-xs font-semibold"
                style={{ backgroundColor: brand, color: contrast }}
              >
                {appName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="text-sm font-semibold">{appName}</span>
          </div>
          <button
            type="button"
            disabled
            className="rounded-md px-3 py-1.5 text-xs font-medium shadow-sm transition-colors"
            style={{ backgroundColor: brand, color: contrast }}
            title={`Hover: ${hover}`}
          >
            Acción principal
          </button>
        </div>
        <div className="bg-muted/30 px-4 py-6 text-xs text-muted-foreground">
          Mockup del header. El botón usa <span className="font-mono">{brand}</span>{" "}
          y texto <span className="font-mono">{contrast}</span>.
        </div>
      </Card>

      {/* Login mockup */}
      <Card className="overflow-hidden">
        <div className="space-y-3 px-6 py-6">
          <h4 className="text-sm font-semibold">
            {payload.loginTitle?.trim() || `Accede a ${appName}`}
          </h4>
          <p className="text-xs text-muted-foreground">
            {payload.loginSubtitle?.trim() ||
              "Introduce tu correo y contraseña."}
          </p>
          <div className="space-y-2 pt-2">
            <FakeInput placeholder="email@empresa.com" />
            <FakeInput placeholder="••••••••" />
          </div>
          <button
            type="button"
            disabled
            className={cn(
              "mt-1 w-full rounded-md px-3 py-2 text-sm font-medium shadow-sm",
            )}
            style={{ backgroundColor: brand, color: contrast }}
          >
            Entrar
          </button>
          {payload.welcomeMessage?.trim() ? (
            <p className="pt-2 text-xs italic text-muted-foreground">
              {payload.welcomeMessage}
            </p>
          ) : null}
        </div>
      </Card>

      {/* Footer mockup */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
          <span>
            {payload.footerText?.trim() || `© ${new Date().getFullYear()} ${appName}`}
          </span>
          <span>
            {payload.companyName?.trim() ||
              payload.companyLegalName?.trim() ||
              ""}
          </span>
        </div>
      </Card>
    </div>
  );
}

function FakeInput({ placeholder }: { placeholder: string }) {
  return (
    <div className="h-9 w-full rounded-md border bg-background px-3 text-xs leading-9 text-muted-foreground">
      {placeholder}
    </div>
  );
}
