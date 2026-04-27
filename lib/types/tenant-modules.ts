export type ModuleCategory =
  | "core"
  | "sales"
  | "inventory"
  | "integrations"
  | "analytics";

export const MODULE_CATEGORIES: ModuleCategory[] = [
  "core",
  "sales",
  "inventory",
  "integrations",
  "analytics",
];

export const MODULE_CATEGORY_LABEL: Record<ModuleCategory, string> = {
  core: "Core",
  sales: "Ventas",
  inventory: "Inventario",
  integrations: "Integraciones",
  analytics: "Analítica",
};

export interface ModuleInfo {
  name: string;
  label: string;
  description?: string;
  category: ModuleCategory;
  alwaysOn: boolean;
  enabled: boolean;
  dependsOn: string[];
  /** Computed client-side from other modules' dependsOn. */
  dependents: string[];
  enabledAt?: string;
  disabledAt?: string;
}

export interface ModuleAuditEvent {
  id: number | string;
  module: string;
  action: "enabled" | "disabled" | "config_changed";
  performedBy: string | null;
  reason: string | null;
  createdAt: string;
}

/**
 * Computes for each module the list of names of OTHER modules
 * whose dependsOn contains this module — i.e., modules that would
 * break if this one were disabled.
 *
 * Pure function so it can be unit-tested in isolation.
 */
export function computeDependents<
  M extends { name: string; dependsOn?: string[] },
>(modules: M[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const m of modules) map.set(m.name, []);
  for (const m of modules) {
    for (const dep of m.dependsOn ?? []) {
      const list = map.get(dep);
      if (list) list.push(m.name);
    }
  }
  return map;
}

export function annotateDependents(modules: ModuleInfo[]): ModuleInfo[] {
  const map = computeDependents(modules);
  return modules.map((m) => ({
    ...m,
    dependents: map.get(m.name) ?? [],
  }));
}
