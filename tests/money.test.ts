import { describe, expect, it } from "vitest";
import { centsToEuros, eurosToCents, formatEur } from "@/lib/money";

describe("eurosToCents", () => {
  it("returns 0 for nullish / empty inputs", () => {
    expect(eurosToCents(undefined)).toBe(0);
    expect(eurosToCents(null)).toBe(0);
    expect(eurosToCents("")).toBe(0);
    expect(eurosToCents("   ")).toBe(0);
  });

  it("converts whole-euro inputs precisely", () => {
    expect(eurosToCents("49")).toBe(4900);
    expect(eurosToCents("0")).toBe(0);
    expect(eurosToCents("1")).toBe(100);
    expect(eurosToCents(49)).toBe(4900);
    expect(eurosToCents(83)).toBe(8300);
    expect(eurosToCents(166)).toBe(16600);
  });

  it("converts decimals via toFixed(2) without float drift", () => {
    expect(eurosToCents("49.99")).toBe(4999);
    expect(eurosToCents("4.99")).toBe(499);
    expect(eurosToCents("0.10")).toBe(10);
    expect(eurosToCents("0.05")).toBe(5);
    expect(eurosToCents("0.01")).toBe(1);
    // Classic IEEE-754 traps that bite naive `n * 100`.
    expect(eurosToCents("0.1")).toBe(10);
    expect(eurosToCents("0.2")).toBe(20);
    expect(eurosToCents("0.3")).toBe(30);
    // 1.005 in IEEE-754 is actually 1.0049999..., so toFixed(2) → "1.00".
    // We accept the JS-native behavior here (consistent and predictable).
    expect(eurosToCents("1.005")).toBe(100);
  });

  it("accepts comma as decimal separator (Spanish locale)", () => {
    expect(eurosToCents("49,00")).toBe(4900);
    expect(eurosToCents("49,99")).toBe(4999);
    expect(eurosToCents("0,01")).toBe(1);
  });

  it("trims whitespace from string inputs", () => {
    expect(eurosToCents(" 49 ")).toBe(4900);
    expect(eurosToCents("\t49.5\n")).toBe(4950);
  });
});

describe("centsToEuros", () => {
  it("converts integer cents back to euros without drift", () => {
    expect(centsToEuros(4900)).toBe(49);
    expect(centsToEuros(4999)).toBe(49.99);
    expect(centsToEuros(1)).toBe(0.01);
    expect(centsToEuros(0)).toBe(0);
  });

  it("treats nullish input as 0", () => {
    expect(centsToEuros(null)).toBe(0);
    expect(centsToEuros(undefined)).toBe(0);
  });
});

describe("eurosToCents → centsToEuros round trip", () => {
  it("preserves common values exactly", () => {
    for (const v of ["49", "49,99", "0", "0,01", "1", "1000", "0.1", "0.05"]) {
      const cents = eurosToCents(v);
      const back = centsToEuros(cents);
      // Compare numerically, not lexically.
      expect(eurosToCents(back)).toBe(cents);
    }
  });
});

describe("formatEur", () => {
  it("formats 4900 cents as 49,00 €", () => {
    const out = formatEur(4900);
    expect(out).toContain("49,00");
    expect(out).toContain("€");
  });

  it("formats null as a dash", () => {
    expect(formatEur(null)).toBe("—");
  });
});
