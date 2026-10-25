import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function authenticatedAdmin(request: NextRequest) {
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return undefined;
  const admin = await prisma.adminUser.findUnique({
    where: { id: session.adminId },
    select: { id: true, username: true, isActive: true, sessionVersion: true },
  });
  if (!admin?.isActive || admin.sessionVersion !== session.sessionVersion) return undefined;
  return admin;
}
