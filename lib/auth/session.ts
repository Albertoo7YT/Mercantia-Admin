import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";

export const SESSION_COOKIE_NAME = "mercantia_admin_session";

type SessionPayload = {
  id: string;
  iat: number;
  exp: number;
};

function base64url(input: Buffer | string): string {
  return (input instanceof Buffer ? input : Buffer.from(input))
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  return Buffer.from(
    input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad),
    "base64",
  );
}

function sign(payload: string): string {
  return base64url(
    createHmac("sha256", env.SESSION_SECRET()).update(payload).digest(),
  );
}

export function createSession(): { token: string; expiresAt: Date } {
  const id = randomBytes(24).toString("hex");
  const now = Date.now();
  const maxAgeMs = env.SESSION_MAX_AGE_HOURS() * 60 * 60 * 1000;
  const payload: SessionPayload = {
    id,
    iat: now,
    exp: now + maxAgeMs,
  };

  const payloadStr = base64url(JSON.stringify(payload));
  const signature = sign(payloadStr);
  const token = `${payloadStr}.${signature}`;

  return { token, expiresAt: new Date(payload.exp) };
}

type VerifyResult =
  | { ok: true; expiresAt: Date }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifySession(token: string | undefined | null): VerifyResult {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "malformed" };
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false, reason: "malformed" };
  }
  const [payloadStr, signature] = parts;
  const expected = sign(payloadStr);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(fromBase64url(payloadStr).toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    typeof payload.exp !== "number" ||
    typeof payload.iat !== "number" ||
    typeof payload.id !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (Date.now() >= payload.exp) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, expiresAt: new Date(payload.exp) };
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    secure: env.isProd(),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
