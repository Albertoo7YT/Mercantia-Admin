import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LogsTab } from "@/components/tenant/logs-tab";

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

const emptyMeta = {
  pm2AppName: "mercantia-test",
  totalLinesRead: 0,
  fileExisted: { stdout: true, stderr: true },
  fileSizes: { stdout: 0, stderr: 0 },
};

describe("LogsTab", () => {
  it("shows skeleton while loading", () => {
    fetchSpy.mockImplementation(
      () => new Promise(() => {}) as Promise<Response>,
    );
    render(<LogsTab tenantId="t1" />, { wrapper: makeWrapper() });
    expect(screen.getByTestId("logs-skeleton")).toBeInTheDocument();
  });

  it("shows error state when endpoint returns 502", async () => {
    fetchSpy.mockResolvedValue(jsonResponse({ error: "boom" }, 502));
    render(<LogsTab tenantId="t1" />, { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(
        screen.getByText(/no se pudieron cargar los logs/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  it("shows empty state when entries array is empty", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ entries: [], metadata: emptyMeta }),
    );
    render(<LogsTab tenantId="t1" />, { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(screen.getByText(/no hay logs en este rango/i)).toBeInTheDocument(),
    );
  });

  it("renders a list of log entries with their levels", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        entries: [
          {
            timestamp: "2026-04-27T16:14:23.000Z",
            level: "error",
            source: "stderr",
            message: "Unique constraint failed on (Referencia)",
            raw: "raw line 1",
            parsed: { event: "prestashop.sync.product_error" },
          },
          {
            timestamp: "2026-04-27T16:00:43.000Z",
            level: "info",
            source: "stdout",
            message: "total: 6897",
            raw: "raw line 2",
            parsed: { event: "prestashop.sync.success", total: 6897 },
          },
        ],
        metadata: {
          ...emptyMeta,
          fileSizes: { stdout: 1024 * 1024, stderr: 512 * 1024 },
        },
      }),
    );

    render(<LogsTab tenantId="t1" />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(
        screen.getByText("prestashop.sync.product_error"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("prestashop.sync.success")).toBeInTheDocument();
    expect(screen.getAllByText(/error/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Mostrando 2 entradas/)).toBeInTheDocument();
  });

  it("forwards filters to the panel API URL", async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({ entries: [], metadata: emptyMeta }),
    );
    render(<LogsTab tenantId="t1" />, { wrapper: makeWrapper() });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const url = String(fetchSpy.mock.calls[0][0]);
    const u = new URL(url, "http://localhost");
    expect(u.pathname).toBe("/api/tenants/t1/logs");
    expect(u.searchParams.get("source")).toBe("combined");
    expect(u.searchParams.get("level")).toBe("error,warn,info");
    expect(u.searchParams.get("maxLines")).toBe("200");
    expect(u.searchParams.get("since")).toBeTruthy();
  });
});
