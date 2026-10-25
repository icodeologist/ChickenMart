import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as logout } from "@/app/api/auth/logout/route";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, verifySessionToken } from "@/lib/auth";
import { proxy } from "@/proxy";

const originalSecret = process.env.AUTH_SECRET;
const adminId = "d1d8dd62-a23c-4f2a-9ae7-735a81827831";
const protectedPages = ["/", "/admin", "/view", "/credit-line", "/credit-page", "/passbook"];

beforeEach(() => {
  process.env.AUTH_SECRET = "unit-test-secret-with-more-than-32-characters";
});

afterEach(() => {
  vi.useRealTimers();
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
});

describe("admin session authentication", () => {
  it("signs sessions and rejects expired or tampered tokens", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T10:00:00.000Z"));
    const token = await createSessionToken({ adminId, sessionVersion: 3 });
    await expect(verifySessionToken(token)).resolves.toEqual({ adminId, sessionVersion: 3 });

    vi.setSystemTime(new Date(Date.now() + (SESSION_MAX_AGE_SECONDS + 1) * 1_000));
    await expect(verifySessionToken(token)).resolves.toBeUndefined();
    const replacement = token.endsWith("0") ? "1" : "0";
    await expect(verifySessionToken(`${token.slice(0, -1)}${replacement}`)).resolves.toBeUndefined();
  });

  it("refuses to issue sessions without a strong server secret", async () => {
    process.env.AUTH_SECRET = "too-short";
    await expect(createSessionToken({ adminId, sessionVersion: 1 })).rejects.toThrow("at least 32 characters");
    await expect(verifySessionToken("anything")).resolves.toBeUndefined();
  });

  it("redirects unsigned pages and rejects unsigned API calls", async () => {
    for (const path of protectedPages) {
      const pageResponse = await proxy(new NextRequest(`http://localhost:3000${path}`));
      expect(pageResponse.status, path).toBe(307);
      expect(pageResponse.headers.get("location"), path).toBe(`http://localhost:3000/login?next=${encodeURIComponent(path)}`);
    }

    const apiResponse = await proxy(new NextRequest("http://localhost:3000/api/accounting/recent-receipts"));
    expect(apiResponse.status).toBe(401);
    await expect(apiResponse.json()).resolves.toEqual({ error: "Please sign in." });
  });

  it("keeps only authentication routes public", async () => {
    for (const path of ["/login", "/api/auth/login", "/api/auth/logout"]) {
      expect((await proxy(new NextRequest(`http://localhost:3000${path}`))).status, path).toBe(200);
    }
  });

  it("expires the session cookie on logout", async () => {
    const response = await logout(new Request("http://localhost:3000/api/auth/logout", { method: "POST" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(response.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=`);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("allows every application page with a valid signed session", async () => {
    const token = await createSessionToken({ adminId, sessionVersion: 1 });
    const headers = { cookie: `${SESSION_COOKIE}=${token}` };
    for (const path of protectedPages) {
      expect((await proxy(new NextRequest(`http://localhost:3000${path}`, { headers }))).status, path).toBe(200);
    }
  });
});
