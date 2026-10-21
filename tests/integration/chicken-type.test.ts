import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createChickenType } from "@/lib/accounting/engine";

const code = "INTEGRATION_CHICKEN_TYPE";
const name = "Integration Chicken Type";
const keyPrefix = "chicken-type-integration-";

async function cleanup() {
  await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: keyPrefix } } });
  await prisma.chickenType.deleteMany({ where: { code } });
}

describe("chicken type creation", () => {
  beforeAll(cleanup);
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("creates once and returns the same record for an idempotent retry", async () => {
    const input = { idempotencyKey: `${keyPrefix}create`, code, name };
    const first = await createChickenType(input);
    const retry = await createChickenType(input);

    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    expect(retry.id).toBe(first.id);
    expect(await prisma.chickenType.count({ where: { code } })).toBe(1);
  });

  it("rejects a duplicate name or code", async () => {
    await createChickenType({ idempotencyKey: `${keyPrefix}original`, code, name });

    await expect(createChickenType({
      idempotencyKey: `${keyPrefix}duplicate`,
      code: code.toLowerCase(),
      name: "Another label",
    })).rejects.toMatchObject({ status: 409 });
  });
});
