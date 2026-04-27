import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ModulesTab } from "@/components/tenant/modules-tab";

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

describe("ModulesTab", () => {
  it("renders categories and modules from the API", async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/modules")) {
        return Promise.resolve(
          jsonResponse({
            modules: [
              {
                name: "catalog",
                label: "Catálogo",
                category: "core",
                alwaysOn: true,
                enabled: true,
                dependsOn: [],
                dependents: [],
              },
              {
                name: "purchases",
                label: "Compras",
                category: "inventory",
                alwaysOn: false,
                enabled: false,
                dependsOn: [],
                dependents: [],
              },
            ],
          }),
        );
      }
      if (url.endsWith("/audit")) {
        return Promise.resolve(jsonResponse({ events: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<ModulesTab tenantId="t1" />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(screen.getByText("Catálogo")).toBeInTheDocument(),
    );

    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Inventario")).toBeInTheDocument();
    expect(screen.getByText("Compras")).toBeInTheDocument();
    expect(screen.getByText(/Siempre activo/i)).toBeInTheDocument();
  });

  it("shows error state when modules endpoint fails", async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/modules")) {
        return Promise.resolve(jsonResponse({ error: "boom" }, 502));
      }
      return Promise.resolve(jsonResponse({ events: [] }));
    });

    render(<ModulesTab tenantId="t1" />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(
        screen.getByText(/No se pudo conectar con este cliente/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });
});
