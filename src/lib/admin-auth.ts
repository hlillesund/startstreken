/**
 * Minimal admin auth: a single ADMIN_PASSWORD, and a signed, expiring session
 * cookie. Uses Web Crypto so it runs in the proxy as well as in route handlers.
 */

export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_DAYS = 30;

function secret(): string | null {
  return process.env.ADMIN_SECRET || process.env.ADMIN_PASSWORD || null;
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/** In local development without a password, admin stays open for convenience. */
export function adminOpenInDev(): boolean {
  return !adminConfigured() && process.env.NODE_ENV !== "production";
}

const enc = new TextEncoder();

async function hmac(message: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison (compares digests so lengths never leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([hmac(a, "cmp"), hmac(b, "cmp")]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0 && x.length === y.length;
}

export async function createAdminToken(): Promise<string> {
  const key = secret();
  if (!key) throw new Error("ADMIN_PASSWORD er ikke satt");
  const expires = Date.now() + ADMIN_SESSION_DAYS * 86_400_000;
  return `${expires}.${await hmac(`admin:${expires}`, key)}`;
}

export async function verifyAdminToken(token: string | undefined | null): Promise<boolean> {
  const key = secret();
  if (!key || !token) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return safeEqual(sig, await hmac(`admin:${expires}`, key));
}

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function isCronRequest(authHeader: string | null): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !authHeader) return false;
  return safeEqual(authHeader, `Bearer ${cronSecret}`);
}
