import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrandingTab } from "@/components/tenant/branding-tab";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}

const fetchSpy = vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  fetchSpy.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  }) as unknown as Response;
}

const sampleBranding = {
  appName: "Mercantia",
  brandColor: "#2563EB",
  brandColorHover: "",
  brandColorContrast: "",
  logoUrl: "",
  logoSmallUrl: "",
  faviconUrl: "",
  supportEmail: "",
  supportPhone: "",
  companyName: "",
  companyLegalName: "",
  companyAddress: "",
  welcomeMessage: "",
  loginTitle: "",
  loginSubtitle: "",
  footerText: "",
  metaTitle: "",
  metaDescription: "",
};

describe("BrandingTab", () => {
  it("loads existing branding and shows 'Sin cambios pendientes'", async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/branding")) {
        return Promise.resolve(jsonResponse(sampleBranding));
      }
      if (url.endsWith("/branding/audit")) {
        return Promise.resolve(jsonResponse({ events: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<BrandingTab tenantId="t1" />, { wrapper: makeWrapper() });
    const input = (await waitFor(() =>
      screen.getByLabelText(/Nombre de la app/i),
    )) as HTMLInputElement;
    expect(input).toHaveValue("Mercantia");
    expect(screen.getByText(/Sin cambios pendientes/i)).toBeInTheDocument();
  });

  it("flips dirty state and enables Save when a value changes", async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/branding")) {
        return Promise.resolve(jsonResponse(sampleBranding));
      }
      if (url.endsWith("/branding/audit")) {
        return Promise.resolve(jsonResponse({ events: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<BrandingTab tenantId="t1" />, { wrapper: makeWrapper() });

    const input = (await waitFor(() =>
      screen.getByLabelText(/Nombre de la app/i),
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Nuevo Nombre" } });

    await waitFor(() =>
      expect(screen.getByText(/cambio.*sin guardar/i)).toBeInTheDocument(),
    );
    const save = screen.getByRole("button", { name: /Guardar cambios/i });
    expect(save).not.toBeDisabled();
  });

  it("blocks Save when validation fails (invalid hex)", async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/branding")) {
        return Promise.resolve(jsonResponse(sampleBranding));
      }
      if (url.endsWith("/branding/audit")) {
        return Promise.resolve(jsonResponse({ events: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<BrandingTab tenantId="t1" />, { wrapper: makeWrapper() });

    const input = (await waitFor(() =>
      screen.getByLabelText(/Color principal/i),
    )) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "no-color" } });

    await waitFor(() =>
      expect(
        screen.getByText(/Formato esperado #RRGGBB/i),
      ).toBeInTheDocument(),
    );
    const save = screen.getByRole("button", { name: /Guardar cambios/i });
    expect(save).toBeDisabled();
  });

  it("shows error state when branding endpoint fails", async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/branding")) {
        return Promise.resolve(jsonResponse({ error: "boom" }, 502));
      }
      return Promise.resolve(jsonResponse({ events: [] }));
    });
    render(<BrandingTab tenantId="t1" />, { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(
        screen.getByText(/no se pudo cargar el branding/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });
});
