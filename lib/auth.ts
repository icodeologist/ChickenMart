import { jwtVerify, SignJWT } from "jose";

const encoder = new TextEncoder();
const issuer = "chicken-mart";
const audience = "chicken-mart-admin";

export const SESSION_COOKIE = "chicken_mart_session";
export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

export type AdminSession = {
  adminId: string;
  sessionVersion: number;
};

function signingKey() {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 32 ? encoder.encode(secret) : undefined;
}

export function authIsConfigured() {
  return Boolean(signingKey());
}

export async function createSessionToken(session: AdminSession) {
  const key = signingKey();
  if (!key) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  if (!session.adminId || !Number.isInteger(session.sessionVersion) || session.sessionVersion < 1) {
    throw new Error("Cannot create an invalid admin session.");
  }

  return new SignJWT({ sessionVersion: session.sessionVersion })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(session.adminId)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key);
}

export async function verifySessionToken(token: string | undefined): Promise<AdminSession | undefined> {
  const key = signingKey();
  if (!key || !token) return undefined;

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer,
      audience,
    });
    if (!payload.sub || !Number.isInteger(payload.sessionVersion) || Number(payload.sessionVersion) < 1) return undefined;
    return { adminId: payload.sub, sessionVersion: Number(payload.sessionVersion) };
  } catch {
    return undefined;
  }
}
