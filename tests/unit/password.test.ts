import { describe, expect, it } from "vitest";
import { hashPassword, validateAdminPassword, verifyPassword } from "@/lib/password";

describe("admin password hashing", () => {
  it("stores a salted scrypt hash and verifies only the original password", async () => {
    const password = "correct horse battery staple";
    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).not.toBe(password);
    expect(second).not.toBe(first);
    await expect(verifyPassword(password, first)).resolves.toBe(true);
    await expect(verifyPassword("incorrect password", first)).resolves.toBe(false);
  });

  it("rejects weak passwords and malformed hashes", async () => {
    expect(() => validateAdminPassword("too-short")).toThrow("at least 12 characters");
    await expect(verifyPassword("anything at all", "not-a-password-hash")).resolves.toBe(false);
  });
});
