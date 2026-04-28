import { describe, expect, it } from "vitest";
import {
  diffBranding,
  isEmail,
  isHexColor,
  isLogoUrl,
  validateBranding,
} from "@/lib/types/tenant-branding";

describe("branding validators", () => {
  it("isHexColor accepts only #RRGGBB", () => {
    expect(isHexColor("#2563EB")).toBe(true);
    expect(isHexColor("#abcdef")).toBe(true);
    expect(isHexColor("#FFF")).toBe(false);
    expect(isHexColor("2563EB")).toBe(false);
    expect(isHexColor("")).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });

  it("isEmail accepts simple shapes", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("not-an-email")).toBe(false);
    expect(isEmail("")).toBe(false);
  });

  it("isLogoUrl accepts http(s) and root-relative paths", () => {
    expect(isLogoUrl("https://example.com/logo.png")).toBe(true);
    expect(isLogoUrl("http://example.com/logo.png")).toBe(true);
    expect(isLogoUrl("/branding/logo.png")).toBe(true);
    expect(isLogoUrl("logo.png")).toBe(false);
    expect(isLogoUrl("ftp://x/y")).toBe(false);
  });
});

describe("validateBranding", () => {
  it("requires non-empty appName when present", () => {
    expect(validateBranding({ appName: "" })).toMatchObject({
      appName: expect.any(String),
    });
    expect(validateBranding({ appName: "Mercantia" }).appName).toBeUndefined();
  });

  it("flags invalid hex colors", () => {
    expect(validateBranding({ brandColor: "FF0000" })).toMatchObject({
      brandColor: expect.any(String),
    });
    expect(
      validateBranding({ brandColor: "#FF0000" }).brandColor,
    ).toBeUndefined();
    expect(
      validateBranding({ brandColorHover: "wrong" }).brandColorHover,
    ).toBeDefined();
  });

  it("flags invalid emails and skips empty optional ones", () => {
    expect(validateBranding({ supportEmail: "abc" })).toMatchObject({
      supportEmail: expect.any(String),
    });
    expect(validateBranding({ supportEmail: "" }).supportEmail).toBeUndefined();
  });

  it("flags invalid logo urls", () => {
    expect(
      validateBranding({ logoUrl: "logo.png" }).logoUrl,
    ).toBeDefined();
    expect(
      validateBranding({ logoUrl: "/branding/logo.png" }).logoUrl,
    ).toBeUndefined();
  });
});

describe("diffBranding", () => {
  it("returns the keys that differ", () => {
    const before = { appName: "Old", brandColor: "#000000", logoUrl: "" };
    const after = { appName: "New", brandColor: "#000000", logoUrl: "/x.png" };
    expect(diffBranding(before, after).sort()).toEqual([
      "appName",
      "logoUrl",
    ]);
  });

  it("treats undefined/null/empty as equivalent", () => {
    const before = { logoUrl: undefined, supportEmail: "" };
    const after = { logoUrl: null as unknown as undefined, supportEmail: undefined };
    expect(diffBranding(before, after)).toEqual([]);
  });

  it("returns empty when nothing changed", () => {
    const same = { appName: "Mercantia", brandColor: "#2563EB" };
    expect(diffBranding(same, { ...same })).toEqual([]);
  });
});
