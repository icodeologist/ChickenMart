import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authIsConfigured, createSessionToken, passwordMatches, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

const loginInput = z.object({ password: z.string().min(1).max(200) });

export async function POST(request: NextRequest) {
  if (!authIsConfigured()) {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  }

  const parsed = loginInput.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success || !await passwordMatches(parsed.data.password)) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
