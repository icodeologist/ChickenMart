import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH, POST as accountingPost } from "@/app/api/accounting/[operation]/route";
import { POST as login } from "@/app/api/auth/login/route";
import { SESSION_COOKIE } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const username = "integration-admin";
const password = "integration password 2026";
const originalSecret = process.env.AUTH_SECRET;

async function cleanup() {
  await prisma.adminUser.deleteMany({ where: { username } });
}

async function createAdmin() {
  return prisma.adminUser.create({
    data: { username, passwordHash: await hashPassword(password) },
  });
}

function loginRequest(candidateUsername = username, candidatePassword = password) {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: candidateUsername, password: candidatePassword }),
  });
}

describe("database-backed admin authentication", () => {
  beforeEach(async () => {
    process.env.AUTH_SECRET = "integration-test-secret-with-32-characters";
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    if (originalSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = originalSecret;
    await prisma.$disconnect();
  });

  it("logs in with the stored password and sets an HTTP-only session cookie", async () => {
    await createAdmin();
    const response = await login(loginRequest());

    expect(response.status).toBe(200);
    expect(response.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
  });

  it("uses the same generic failure for unknown users, bad passwords, and disabled admins", async () => {
    const admin = await createAdmin();
    for (const request of [loginRequest("missing-admin"), loginRequest(username, "wrong password value")]) {
      const response = await login(request);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "Incorrect username or password." });
    }

    await prisma.adminUser.update({ where: { id: admin.id }, data: { isActive: false } });
    expect((await login(loginRequest())).status).toBe(401);
  });

  it("enforces the single-admin rule in PostgreSQL", async () => {
    await createAdmin();
    await expect(prisma.adminUser.create({
      data: { username: "second-integration-admin", passwordHash: await hashPassword(password) },
    })).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects every accounting method without a database-backed session", async () => {
    const context = { params: Promise.resolve({ operation: "not-a-route" }) };
    for (const [method, handler] of [
      ["GET", GET],
      ["POST", accountingPost],
      ["PATCH", PATCH],
      ["DELETE", DELETE],
    ] as const) {
      const response = await handler(new NextRequest("http://localhost:3000/api/accounting/not-a-route", { method }), context);
      expect(response.status, method).toBe(401);
    }
  });

  it("accepts a valid session and revokes it after a password-version change", async () => {
    const admin = await createAdmin();
    const loginResponse = await login(loginRequest());
    const token = loginResponse.cookies.get(SESSION_COOKIE)?.value;
    expect(token).toBeTruthy();
    const context = { params: Promise.resolve({ operation: "not-a-route" }) };
    const request = () => new NextRequest("http://localhost:3000/api/accounting/not-a-route", {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });

    expect((await GET(request(), context)).status).toBe(404);
    await prisma.adminUser.update({ where: { id: admin.id }, data: { sessionVersion: { increment: 1 } } });
    expect((await GET(request(), context)).status).toBe(401);
  });
});
