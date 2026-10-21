import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSupplier } from "@/lib/accounting/engine";
import { prisma } from "@/lib/prisma";

const supplierName = "Integration Supplier";
const keyPrefix = "supplier-integration-test";

describe("supplier creation", () => {
  beforeEach(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: keyPrefix } } });
    await prisma.supplier.deleteMany({ where: { name: { equals: supplierName, mode: "insensitive" } } });
  });

  afterAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: keyPrefix } } });
    await prisma.supplier.deleteMany({ where: { name: { equals: supplierName, mode: "insensitive" } } });
    await prisma.$disconnect();
  });

  it("creates once, returns duplicate retries, and rejects duplicate names", async () => {
    const first = await createSupplier({
      idempotencyKey: keyPrefix,
      name: supplierName,
    });
    const retry = await createSupplier({
      idempotencyKey: keyPrefix,
      name: supplierName,
    });

    expect(first.name).toBe(supplierName);
    expect(first.duplicate).toBe(false);
    expect(retry.id).toBe(first.id);
    expect(retry.duplicate).toBe(true);
    expect(await prisma.supplier.count({ where: { name: supplierName } })).toBe(1);

    await expect(createSupplier({
      idempotencyKey: `${keyPrefix}-different-request`,
      name: supplierName.toLowerCase(),
    })).rejects.toMatchObject({ status: 409 });
  });
});
