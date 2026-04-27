import { describe, expect, it } from "vitest";
import { decrypt, encrypt, safeDecrypt } from "@/lib/crypto";

describe("crypto", () => {
  it("round-trips short ASCII", () => {
    const cipher = encrypt("hello world");
    expect(cipher).not.toBe("hello world");
    expect(decrypt(cipher)).toBe("hello world");
  });

  it("round-trips unicode and long strings", () => {
    const text = "tóken-súper-largo-€_" + "x".repeat(500);
    const cipher = encrypt(text);
    expect(decrypt(cipher)).toBe(text);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encrypt("repeat");
    const b = encrypt("repeat");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it("safeDecrypt returns null on tampered ciphertext", () => {
    const cipher = encrypt("important");
    const buf = Buffer.from(cipher, "base64");
    // Flip one bit of the encrypted payload (after IV + auth tag).
    buf[buf.length - 1] ^= 0x01;
    const tampered = buf.toString("base64");
    expect(safeDecrypt(tampered)).toBeNull();
  });

  it("safeDecrypt returns null on tampered auth tag", () => {
    const cipher = encrypt("important");
    const buf = Buffer.from(cipher, "base64");
    // Auth tag occupies bytes 12..28.
    buf[20] ^= 0x80;
    const tampered = buf.toString("base64");
    expect(safeDecrypt(tampered)).toBeNull();
  });

  it("decrypt throws on malformed input", () => {
    expect(() => decrypt("nope")).toThrow();
  });
});
