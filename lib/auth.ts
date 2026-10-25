const encoder = new TextEncoder();

export const SESSION_COOKIE = "chicken_mart_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function configuredSecret() {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 32 ? secret : undefined;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toHex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return undefined;
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < value.length; index += 2) {
    bytes[index / 2] = Number.parseInt(value.slice(index, index + 2), 16);
  }
  return bytes;
}

export function authIsConfigured() {
  return Boolean(configuredSecret() && process.env.ADMIN_PASSWORD);
}

export async function passwordMatches(candidate: string) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !configuredSecret()) return false;

  const key = await hmacKey(configuredSecret()!);
  const candidateDigest = await crypto.subtle.sign("HMAC", key, encoder.encode(candidate));
  return crypto.subtle.verify("HMAC", key, candidateDigest, encoder.encode(expected));
}

export async function createSessionToken(now = Date.now()) {
  const secret = configuredSecret();
  if (!secret) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `v1.admin.${expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(payload));
  return `${payload}.${toHex(signature)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()) {
  const secret = configuredSecret();
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || parts[1] !== "admin") return false;
  const expiresAt = Number(parts[2]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;
  const signature = fromHex(parts[3]);
  if (!signature) return false;
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    encoder.encode(parts.slice(0, 3).join(".")),
  );
}
