"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  buildTenantLogsQuery,
  type TenantLogEntry,
  type TenantLogLevel,
  type TenantLogSource,
  type TenantLogsResponse,
} from "@/lib/api-client";
import { cn, formatBytes, formatDate } from "@/lib/utils";

const ALL_LEVELS: TenantLogLevel[] = ["error", "warn", "info", "debug", "raw"];
const DEFAULT_LEVELS: TenantLogLevel[] = ["error", "warn", "info"];
const LINE_OPTIONS = [100, 200, 500, 1000];
const SINCE_PRESETS: Array<{ value: string; label: string; ms: number }> = [
  { value: "1h", label: "Última hora", ms: 60 * 60_000 },
  { value: "6h", label: "Últimas 6h", ms: 6 * 60 * 60_000 },
  { value: "24h", label: "Últimas 24h", ms: 24 * 60 * 60_000 },
];

const AUTO_REFRESH_MS = 10_000;
const HOVER_RESUME_DELAY_MS = 5_000;

function levelClasses(l: TenantLogLevel) {
  switch (l) {
    case "error":
      return "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-300";
    case "warn":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300";
    case "info":
      return "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300";
    case "debug":
      return "bg-slate-500/10 text-slate-600 border-slate-500/30 dark:text-slate-400";
    case "raw":
      return "bg-slate-500/5 text-slate-500 border-slate-500/20 dark:text-slate-500";
  }
}

function timeFromIso(iso: string): { hms: string; full: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { hms: iso, full: iso };
  const hms = d.toLocaleTimeString("es-ES", { hour12: false });
  return { hms, full: formatDate(d) };
}

async function getLogs(
  tenantId: string,
  query: ReturnType<typeof buildTenantLogsQuery>,
  signal: AbortSignal,
): Promise<TenantLogsResponse> {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    sp.set(k, String(v));
  }
  const res = await fetch(`/api/tenants/${tenantId}/logs?${sp.toString()}`, {
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = (await res.json()) as { error?: string };
    } catch {
      // ignore
    }
    const err = new Error(body.error ?? `HTTP ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as TenantLogsResponse;
}

export function LogsTab({ tenantId }: { tenantId: string }) {
  const [source, setSource] = useState<TenantLogSource>("combined");
  const [levels, setLevels] = useState<TenantLogLevel[]>(DEFAULT_LEVELS);
  const [sincePreset, setSincePreset] = useState<string>("1h");
  const [maxLines, setMaxLines] = useState<number>(200);
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [paused, setPaused] = useState<boolean>(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search input so we don't hammer the tenant on each keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Convert preset → ISO since.
  const sinceIso = useMemo(() => {
    const preset = SINCE_PRESETS.find((p) => p.value === sincePreset);
    if (!preset) return undefined;
    return new Date(Date.now() - preset.ms).toISOString();
  }, [sincePreset]);

  const queryParams = useMemo(
    () =>
      buildTenantLogsQuery({
        maxLines,
        source,
        level: levels,
        since: sinceIso,
        search: debouncedSearch || undefined,
      }),
    [maxLines, source, levels, sinceIso, debouncedSearch],
  );

  const refetchInterval = autoRefresh && !paused ? AUTO_REFRESH_MS : false;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["tenant", tenantId, "logs", queryParams],
    queryFn: ({ signal }) => getLogs(tenantId, queryParams, signal),
    refetchInterval,
    staleTime: 0,
  });

  // Hover pause/resume logic.
  const onMouseEnter = useCallback(() => {
    if (resumeTimer.current) {
      clearTimeout(resumeTimer.current);
      resumeTimer.current = null;
    }
    setPaused(true);
  }, []);

  const onMouseLeave = useCallback(() => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => {
      setPaused(false);
      resumeTimer.current = null;
    }, HOVER_RESUME_DELAY_MS);
  }, []);

  // Cleanup any pending timer on unmount so auto-refresh can't fire after.
  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  // Auto-scroll to bottom on data change, only if user is already near the
  // bottom (don't yank the scroll while they're reading).
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = listRef.current;
    if (!el || !data) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [data]);

  function toggleLevel(l: TenantLogLevel) {
    setLevels((prev) =>
      prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
    );
  }

  return (
    <div className="space-y-4">
      <Header
        autoRefresh={autoRefresh}
        onToggleAutoRefresh={() => setAutoRefresh((v) => !v)}
        paused={paused}
        isFetching={isFetching}
        onRefresh={() => refetch()}
      />

      <Filters
        source={source}
        onSourceChange={setSource}
        levels={levels}
        onToggleLevel={toggleLevel}
        sincePreset={sincePreset}
        onSinceChange={setSincePreset}
        maxLines={maxLines}
        onMaxLinesChange={setMaxLines}
        search={search}
        onSearchChange={setSearch}
      />

      <Body
        isLoading={isLoading}
        isError={isError}
        error={error as Error | undefined}
        onRetry={() => refetch()}
        retrying={isFetching}
        data={data}
        listRef={listRef}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />

      <Footer data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Header({
  autoRefresh,
  onToggleAutoRefresh,
  paused,
  isFetching,
  onRefresh,
}: {
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  paused: boolean;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-base font-medium">Logs</h2>
      <div className="flex items-center gap-3">
        {autoRefresh ? (
          <span className="text-xs text-muted-foreground">
            {paused ? "Pausado (hover)" : `Auto cada ${AUTO_REFRESH_MS / 1000}s`}
          </span>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={autoRefresh}
            onCheckedChange={onToggleAutoRefresh}
            id="autorefresh"
            aria-label="Auto-refresh"
          />
          <span className="text-muted-foreground">Auto-refresh</span>
        </label>
        <Button
          size="sm"
          variant="outline"
          onClick={onRefresh}
          disabled={isFetching}
        >
          <RotateCw className={cn("size-4", isFetching && "animate-spin")} />
          Refrescar
        </Button>
      </div>
    </div>
  );
}

function Filters({
  source,
  onSourceChange,
  levels,
  onToggleLevel,
  sincePreset,
  onSinceChange,
  maxLines,
  onMaxLinesChange,
  search,
  onSearchChange,
}: {
  source: TenantLogSource;
  onSourceChange: (s: TenantLogSource) => void;
  levels: TenantLogLevel[];
  onToggleLevel: (l: TenantLogLevel) => void;
  sincePreset: string;
  onSinceChange: (v: string) => void;
  maxLines: number;
  onMaxLinesChange: (v: number) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Fuente
        </Label>
        <div className="flex rounded-md border bg-background p-0.5 text-xs">
          {(["combined", "stdout", "stderr"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSourceChange(s)}
              className={cn(
                "flex-1 rounded px-2 py-1 transition-colors",
                source === s
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s === "combined" ? "Combined" : s === "stdout" ? "Stdout" : "Stderr"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Nivel
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_LEVELS.map((l) => {
            const active = levels.includes(l);
            return (
              <button
                key={l}
                type="button"
                onClick={() => onToggleLevel(l)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-xs uppercase tracking-wide transition-colors",
                  active
                    ? levelClasses(l)
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {l}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Desde
        </Label>
        <Select value={sincePreset} onValueChange={onSinceChange}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SINCE_PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Líneas
        </Label>
        <Select
          value={String(maxLines)}
          onValueChange={(v) => onMaxLinesChange(parseInt(v, 10))}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LINE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="sm:col-span-2 lg:col-span-4">
        <Label
          htmlFor="logs-search"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Buscar
        </Label>
        <Input
          id="logs-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Substring en raw…"
          className="mt-1.5"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Body({
  isLoading,
  isError,
  error,
  onRetry,
  retrying,
  data,
  listRef,
  onMouseEnter,
  onMouseLeave,
}: {
  isLoading: boolean;
  isError: boolean;
  error: Error | undefined;
  onRetry: () => void;
  retrying: boolean;
  data: TenantLogsResponse | undefined;
  listRef: React.MutableRefObject<HTMLDivElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  if (isLoading) {
    return (
      <div className="rounded-md border bg-muted/20 p-3">
        <div className="space-y-2" data-testid="logs-skeleton">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState
        title="No se pudieron cargar los logs"
        description="Verifica la conexión Tailscale y que el endpoint /api/admin/system/logs responda."
        onRetry={onRetry}
        retrying={retrying}
        technicalDetail={error?.message}
      />
    );
  }
  if (!data || data.entries.length === 0) {
    return (
      <EmptyState
        title="No hay logs en este rango"
        description="Prueba a ampliar el rango temporal o desactiva los filtros de nivel."
      />
    );
  }
  return (
    <div
      ref={listRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="max-h-[60vh] overflow-auto rounded-md border bg-slate-50/60 dark:bg-slate-950/40"
    >
      <ul className="divide-y divide-border/60">
        {data.entries.map((entry, i) => (
          <LogRow key={`${entry.timestamp}-${i}`} entry={entry} />
        ))}
      </ul>
    </div>
  );
}

function LogRow({ entry }: { entry: TenantLogEntry }) {
  const [open, setOpen] = useState(false);
  const time = timeFromIso(entry.timestamp);

  const eventLabel =
    typeof entry.parsed?.event === "string"
      ? (entry.parsed.event as string)
      : typeof entry.parsed?.action === "string"
        ? (entry.parsed.action as string)
        : null;

  const summary = useMemo(() => {
    if (!entry.parsed) return null;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(entry.parsed)) {
      if (k === "event" || k === "action" || k === "level") continue;
      if (v === null || v === undefined) continue;
      const formatted =
        typeof v === "string"
          ? v
          : typeof v === "number" || typeof v === "boolean"
            ? String(v)
            : null;
      if (formatted === null) continue;
      parts.push(`${k}: ${formatted}`);
      if (parts.length >= 4) break;
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [entry.parsed]);

  const expandable = Boolean(entry.parsed) || entry.raw !== entry.message;

  return (
    <li className="px-3 py-1.5 font-mono text-[12px] leading-5">
      <div
        className={cn(
          "flex items-start gap-2",
          expandable && "cursor-pointer hover:bg-background/60",
        )}
        onClick={() => expandable && setOpen((v) => !v)}
        role={expandable ? "button" : undefined}
      >
        <span className="shrink-0 text-muted-foreground">
          {expandable ? (
            open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )
          ) : (
            <span className="inline-block size-3.5" />
          )}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {time.hms}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            <span className="text-xs">{time.full}</span>
          </TooltipContent>
        </Tooltip>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 px-1.5 py-0 text-[10px] uppercase",
            levelClasses(entry.level),
          )}
        >
          {entry.level}
        </Badge>
        <div className="min-w-0 flex-1 space-y-0.5">
          {eventLabel ? (
            <div>
              <span className="font-semibold text-foreground">{eventLabel}</span>
              {summary ? (
                <span className="ml-2 text-muted-foreground">{summary}</span>
              ) : null}
              {entry.message && entry.message !== eventLabel ? (
                <span className="ml-2 text-muted-foreground">
                  {entry.message}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="break-words text-foreground">
              {entry.message || entry.raw}
            </div>
          )}
        </div>
      </div>
      {open ? (
        <pre className="ml-6 mt-1 max-h-64 overflow-auto rounded bg-background/80 p-2 text-[11px] leading-relaxed text-foreground">
          {formatExpansion(entry)}
        </pre>
      ) : null}
    </li>
  );
}

function formatExpansion(entry: TenantLogEntry): string {
  if (entry.parsed) {
    try {
      return JSON.stringify(entry.parsed, null, 2);
    } catch {
      // fall through
    }
  }
  return entry.raw;
}

function Footer({ data }: { data: TenantLogsResponse | undefined }) {
  if (!data) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        Mostrando {data.entries.length} entradas · pm2:{" "}
        <span className="font-mono">{data.metadata.pm2AppName || "—"}</span>
      </span>
      <span>
        stdout: {formatBytes(data.metadata.fileSizes.stdout)} · stderr:{" "}
        {formatBytes(data.metadata.fileSizes.stderr)}
      </span>
    </div>
  );
}
