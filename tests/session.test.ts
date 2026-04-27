import { describe, expect, it } from "vitest";
import { createSession, verifySession } from "@/lib/auth/session";

describe("session", () => {
  it("creates and verifies a fresh session", () => {
    const { token, expiresAt } = createSession();
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const result = verifySession(token);
    expect(result.ok).toBe(true);
  });

  it("rejects malformed tokens", () => {
    expect(verifySession("").ok).toBe(false);
    expect(verifySession("foo").ok).toBe(false);
    expect(verifySession("foo.bar.baz").ok).toBe(false);
    expect(verifySession(null).ok).toBe(false);
    expect(verifySession(undefined).ok).toBe(false);
  });

  it("rejects tampered signatures", () => {
    const { token } = createSession();
    const [payload, sig] = token.split(".");
    const flipped = sig.startsWith("A") ? "B" + sig.slice(1) : "A" + sig.slice(1);
    const result = verifySession(`${payload}.${flipped}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });
});
