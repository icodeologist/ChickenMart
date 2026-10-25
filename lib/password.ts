import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const algorithm = "scrypt";
const keyLength = 64;
const options: ScryptOptions = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function derive(password: string, salt: Buffer, derivationOptions: ScryptOptions = options) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, derivationOptions, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export function validateAdminPassword(password: string) {
  if (password.length < 12) throw new Error("Admin password must contain at least 12 characters.");
  if (password.length > 200) throw new Error("Admin password is too long.");
}

export async function hashPassword(password: string) {
  validateAdminPassword(password);
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return [algorithm, options.N, options.r, options.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, encoded: string) {
  const [storedAlgorithm, n, r, p, saltValue, hashValue, extra] = encoded.split("$");
  if (storedAlgorithm !== algorithm || extra !== undefined || !saltValue || !hashValue) return false;
  const derivationOptions: ScryptOptions = {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  };
  if (derivationOptions.N !== options.N || derivationOptions.r !== options.r || derivationOptions.p !== options.p) return false;

  try {
    const expected = Buffer.from(hashValue, "base64url");
    if (expected.length !== keyLength) return false;
    const actual = await derive(password, Buffer.from(saltValue, "base64url"), derivationOptions);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
