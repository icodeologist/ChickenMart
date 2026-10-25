import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authIsConfigured, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const loginInput = z.object({
  username: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9_.-]+$/).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200),
});

export async function POST(request: NextRequest) {
  if (!authIsConfigured()) {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  }

  const parsed = loginInput.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }
  const admin = await prisma.adminUser.findUnique({ where: { username: parsed.data.username } });
  if (!admin?.isActive || !await verifyPassword(parsed.data.password, admin.passwordHash)) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken({ adminId: admin.id, sessionVersion: admin.sessionVersion }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
