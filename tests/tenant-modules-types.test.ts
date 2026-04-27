import { describe, expect, it } from "vitest";
import {
  annotateDependents,
  computeDependents,
  type ModuleInfo,
} from "@/lib/types/tenant-modules";

function mkModule(over: Partial<ModuleInfo> & { name: string }): ModuleInfo {
  return {
    name: over.name,
    label: over.label ?? over.name,
    category: over.category ?? "core",
    alwaysOn: over.alwaysOn ?? false,
    enabled: over.enabled ?? true,
    dependsOn: over.dependsOn ?? [],
    dependents: over.dependents ?? [],
    description: over.description,
    enabledAt: over.enabledAt,
    disabledAt: over.disabledAt,
  };
}

describe("computeDependents", () => {
  it("returns empty arrays when no module declares deps", () => {
    const map = computeDependents([
      { name: "a", dependsOn: [] },
      { name: "b", dependsOn: [] },
    ]);
    expect(map.get("a")).toEqual([]);
    expect(map.get("b")).toEqual([]);
  });

  it("inverts a single dependency edge", () => {
    const map = computeDependents([
      { name: "core", dependsOn: [] },
      { name: "sales", dependsOn: ["core"] },
    ]);
    expect(map.get("core")).toEqual(["sales"]);
    expect(map.get("sales")).toEqual([]);
  });

  it("collects multiple dependents", () => {
    const map = computeDependents([
      { name: "core", dependsOn: [] },
      { name: "sales", dependsOn: ["core"] },
      { name: "stock", dependsOn: ["core"] },
      { name: "warranties", dependsOn: ["sales"] },
    ]);
    expect(map.get("core")?.sort()).toEqual(["sales", "stock"]);
    expect(map.get("sales")).toEqual(["warranties"]);
    expect(map.get("warranties")).toEqual([]);
  });

  it("ignores deps pointing to unknown modules", () => {
    const map = computeDependents([
      { name: "a", dependsOn: ["ghost"] },
    ]);
    expect(map.get("a")).toEqual([]);
    expect(map.has("ghost")).toBe(false);
  });
});

describe("annotateDependents", () => {
  it("returns ModuleInfo[] with dependents filled in", () => {
    const result = annotateDependents([
      mkModule({ name: "core" }),
      mkModule({ name: "sales", dependsOn: ["core"] }),
    ]);
    expect(result.find((m) => m.name === "core")?.dependents).toEqual(["sales"]);
    expect(result.find((m) => m.name === "sales")?.dependents).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [mkModule({ name: "core" })];
    annotateDependents(input);
    expect(input[0].dependents).toEqual([]);
  });
});
