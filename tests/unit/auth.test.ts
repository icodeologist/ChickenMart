import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as accountingGet } from "@/app/api/accounting/[operation]/route";
import { createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, verifySessionToken } from "@/lib/auth";
import { proxy } from "@/proxy";

const originalPassword = process.env.ADMIN_PASSWORD;
const originalSecret = process.env.AUTH_SECRET;

beforeEach(() => {
  process.env.ADMIN_PASSWORD = "correct horse battery staple";
  process.env.AUTH_SECRET = "unit-test-secret-with-more-than-32-characters";
});

afterEach(() => {
  if (originalPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = originalPassword;
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
});

describe("single-admin authentication", () => {
  it("accepts only the configured password", async () => {
    expect(await passwordMatches("correct horse battery staple")).toBe(true);
    expect(await passwordMatches("wrong password")).toBe(false);
  });

  it("signs sessions and rejects expired or tampered tokens", async () => {
    const now = 1_800_000_000_000;
    const token = await createSessionToken(now);
    expect(await verifySessionToken(token, now + 1_000)).toBe(true);
    expect(await verifySessionToken(token, now + SESSION_MAX_AGE_SECONDS * 1_000)).toBe(false);
    const replacement = token.endsWith("0") ? "1" : "0";
    expect(await verifySessionToken(`${token.slice(0, -1)}${replacement}`, now + 1_000)).toBe(false);
  });

  it("sets an HTTP-only session cookie after a valid login", async () => {
    const response = await login(new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "correct horse battery staple" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    const cookie = response.cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBeTruthy();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
  });

  it("redirects unsigned pages and rejects unsigned API calls", async () => {
    const pageResponse = await proxy(new NextRequest("http://localhost:3000/admin"));
    expect(pageResponse.status).toBe(307);
    expect(pageResponse.headers.get("location")).toBe("http://localhost:3000/login?next=%2Fadmin");

    const apiResponse = await proxy(new NextRequest("http://localhost:3000/api/accounting/recent-receipts"));
    expect(apiResponse.status).toBe(401);
    await expect(apiResponse.json()).resolves.toEqual({ error: "Please sign in." });
  });

  it("allows a valid session and protects the accounting route directly", async () => {
    const token = await createSessionToken();
    const headers = { cookie: `${SESSION_COOKIE}=${token}` };
    expect((await proxy(new NextRequest("http://localhost:3000/admin", { headers }))).status).toBe(200);

    const unsigned = await accountingGet(
      new NextRequest("http://localhost:3000/api/accounting/not-a-route"),
      { params: Promise.resolve({ operation: "not-a-route" }) },
    );
    expect(unsigned.status).toBe(401);

    const signed = await accountingGet(
      new NextRequest("http://localhost:3000/api/accounting/not-a-route", { headers }),
      { params: Promise.resolve({ operation: "not-a-route" }) },
    );
    expect(signed.status).toBe(404);
  });
});
