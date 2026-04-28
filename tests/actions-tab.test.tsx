import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActionsTab } from "@/components/tenant/actions-tab";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
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

describe("ActionsTab", () => {
  it("renders the four action cards and the maintenance off state", async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/maintenance")) {
        return Promise.resolve(jsonResponse({ active: false }));
      }
      if (url.includes("/actions")) {
        return Promise.resolve(jsonResponse({ actions: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<ActionsTab tenantId="t1" />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(
        screen.getByText("Cliente operativo, sin mantenimiento."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Actualizar app (deploy)")).toBeInTheDocument();
    expect(screen.getByText("Reiniciar PM2")).toBeInTheDocument();
    expect(screen.getByText("Crear backup ahora")).toBeInTheDocument();
    // Both maintenance options always available so the user can force-off
    // even when the client reports the wrong state.
    expect(screen.getByText("Activar mantenimiento")).toBeInTheDocument();
    expect(screen.getByText("Desactivar mantenimiento")).toBeInTheDocument();
  });

  it("shows the maintenance active banner with a Desactivar button", async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/maintenance")) {
        return Promise.resolve(
          jsonResponse({
            active: true,
            since: new Date(Date.now() - 5 * 60_000).toISOString(),
            message: "Despliegue en curso",
          }),
        );
      }
      if (url.includes("/actions")) {
        return Promise.resolve(jsonResponse({ actions: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<ActionsTab tenantId="t1" />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(screen.getByText(/mantenimiento activo/i)).toBeInTheDocument(),
    );
    // The top banner adds a "Desactivar" button on top of the standalone
    // "Desactivar mantenimiento" action card. Both must be present.
    const buttons = screen.getAllByRole("button", { name: /desactivar/i });
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/^Desactivar mantenimiento$/)).toBeInTheDocument();
  });

  it("renders the history table with completed action rows", async () => {
    fetchSpy.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/maintenance")) {
        return Promise.resolve(jsonResponse({ active: false }));
      }
      if (url.includes("/actions")) {
        return Promise.resolve(
          jsonResponse({
            actions: [
              {
                id: "a1",
                type: "deploy",
                status: "completed",
                durationMs: 32_000,
                createdAt: "2026-04-27T15:00:00Z",
                completedAt: "2026-04-27T15:00:32Z",
              },
              {
                id: "a2",
                type: "backup_now",
                status: "completed",
                durationMs: 12_000,
                createdAt: "2026-04-27T13:00:00Z",
                completedAt: "2026-04-27T13:00:12Z",
              },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(<ActionsTab tenantId="t1" />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(screen.getAllByText("deploy").length).toBeGreaterThan(0),
    );
    expect(screen.getByText("backup_now")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /ver logs/i }).length).toBe(2);
  });
});
