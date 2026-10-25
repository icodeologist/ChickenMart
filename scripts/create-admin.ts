import "dotenv/config";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const selectedDatabaseUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
if (!selectedDatabaseUrl) throw new Error("Set DATABASE_URL or ADMIN_DATABASE_URL before creating an admin.");
process.env.DATABASE_URL = selectedDatabaseUrl;

const target = new URL(selectedDatabaseUrl);
const schema = target.searchParams.get("schema") ?? "public";
const targetLabel = `${target.hostname}:${target.port || "5432"}${target.pathname} (${schema})`;
const isLocal = target.hostname === "localhost" || target.hostname === "127.0.0.1";

async function hiddenPrompt(label: string) {
  if (!stdin.isTTY || !stdin.setRawMode) throw new Error("Use ADMIN_SETUP_PASSWORD when running without an interactive terminal.");
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") return finish(new Error("Admin creation cancelled."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f") {
          if (value) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
        } else if (character >= " ") {
          value += character;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  console.info(`Admin database target: ${targetLabel}`);
  const interactive = stdin.isTTY && stdout.isTTY;
  const reader = interactive ? createInterface({ input: stdin, output: stdout }) : undefined;
  try {
    if (!isLocal) {
      const confirmation = process.env.ADMIN_SETUP_CONFIRM_HOST ?? await reader?.question(`Type ${target.hostname} to confirm this remote database: `);
      if (confirmation !== target.hostname) throw new Error("Remote database hostname confirmation did not match.");
    }

    const enteredUsername = process.env.ADMIN_SETUP_USERNAME ?? await reader?.question("Admin username [admin]: ") ?? "admin";
    const username = (enteredUsername.trim() || "admin").toLowerCase();
    if (!/^[a-z0-9_.-]{3,80}$/.test(username)) throw new Error("Username must be 3-80 letters, numbers, dots, underscores, or hyphens.");
    reader?.close();

    const password = process.env.ADMIN_SETUP_PASSWORD ?? await hiddenPrompt("Admin password: ");
    if (!process.env.ADMIN_SETUP_PASSWORD) {
      const confirmation = await hiddenPrompt("Confirm password: ");
      if (password !== confirmation) throw new Error("Passwords do not match.");
    }
    const passwordHash = await hashPassword(password);
    const prisma = new PrismaClient();
    try {
      const existing = await prisma.adminUser.findFirst({ orderBy: { createdAt: "asc" } });
      if (existing && existing.username !== username) {
        throw new Error(`A single admin already exists as '${existing.username}'. Use that username to rotate its password.`);
      }
      const admin = existing
        ? await prisma.adminUser.update({
            where: { id: existing.id },
            data: { passwordHash, isActive: true, sessionVersion: { increment: 1 } },
          })
        : await prisma.adminUser.create({ data: { username, passwordHash } });
      console.info(existing
        ? `Password rotated for '${admin.username}'. Existing sessions are now invalid.`
        : `Admin '${admin.username}' created successfully.`);
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    reader?.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
