import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { getAdminOverview, getBirdCounter, postBirdCountAdjustment } from "@/lib/accounting/engine";
import { prisma } from "@/lib/prisma";

const code = "BIRD_COUNTER_TEST";
const supplierName = "Bird Counter Integration Supplier";
const receiptNumber = "BIRD-COUNTER-INTEGRATION";
const keyPrefix = "bird-counter-integration-";
let chickenTypeId = "";
let supplierId = "";

async function cleanup() {
  const type = await prisma.chickenType.findUnique({ where: { code }, select: { id: true } });
  const supplier = await prisma.supplier.findUnique({ where: { name: supplierName }, select: { id: true } });
  const receipt = await prisma.stockReceipt.findUnique({ where: { receiptNumber }, select: { id: true } });
  await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: keyPrefix } } });
  if (type) await prisma.birdCountAdjustment.deleteMany({ where: { chickenTypeId: type.id } });
  if (receipt) {
    await prisma.stockReceiptItem.deleteMany({ where: { stockReceiptId: receipt.id } });
    await prisma.supplierPayable.deleteMany({ where: { stockReceiptId: receipt.id } });
    await prisma.stockReceipt.delete({ where: { id: receipt.id } });
  }
  if (supplier) await prisma.supplier.delete({ where: { id: supplier.id } });
  if (type) await prisma.chickenType.delete({ where: { id: type.id } });
}

describe("admin bird counter", () => {
  beforeAll(async () => {
    await cleanup();
    const [chickenType, supplier] = await Promise.all([
      prisma.chickenType.create({ data: { code, name: "Bird Counter Test Broiler" } }),
      prisma.supplier.create({ data: { name: supplierName } }),
    ]);
    chickenTypeId = chickenType.id;
    supplierId = supplier.id;
    await prisma.stockReceipt.create({
      data: {
        receiptNumber,
        supplierId,
        receivedAt: new Date("2026-10-26T09:00:00.000Z"),
        items: {
          create: {
            chickenTypeId,
            quantityKg: new Prisma.Decimal("50.000"),
            birdCount: 20,
            wastagePerBirdKg: new Prisma.Decimal("0.600"),
            unitCost: new Prisma.Decimal("100.0000"),
            suggestedSellRate: new Prisma.Decimal("150.0000"),
            lineAmount: new Prisma.Decimal("5000.00"),
          },
        },
        payable: {
          create: {
            supplierId,
            payableDate: new Date("2026-10-26T00:00:00.000Z"),
            originalAmount: new Prisma.Decimal("5000.00"),
          },
        },
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("derives purchases and records idempotent additions and removals", async () => {
    const initial = await getBirdCounter();
    expect(initial.byType.find((type) => type.id === chickenTypeId)?.count).toBe(20);

    const removal = {
      idempotencyKey: `${keyPrefix}remove`,
      chickenTypeId,
      occurredAt: new Date("2026-10-26T10:00:00.000Z"),
      direction: "REMOVE" as const,
      quantity: 5,
      notes: "Taken for shop use",
    };
    const first = await postBirdCountAdjustment(removal);
    const retry = await postBirdCountAdjustment(removal);
    expect(retry.id).toBe(first.id);
    expect(retry.duplicate).toBe(true);

    await postBirdCountAdjustment({
      idempotencyKey: `${keyPrefix}add`,
      chickenTypeId,
      occurredAt: new Date("2026-10-26T11:00:00.000Z"),
      direction: "ADD",
      quantity: 2,
      notes: "Count correction",
    });

    const counter = await getBirdCounter();
    expect(counter.byType.find((type) => type.id === chickenTypeId)?.count).toBe(17);
    expect(await prisma.birdCountAdjustment.count({ where: { chickenTypeId } })).toBe(2);
    expect(counter.recentAdjustments.some((entry) => entry.notes === "Taken for shop use")).toBe(true);
    expect((await getAdminOverview()).birdCounter.byType.find((type) => type.id === chickenTypeId)?.count).toBe(17);
  });

  it("does not allow removing more birds than are available", async () => {
    await expect(postBirdCountAdjustment({
      idempotencyKey: `${keyPrefix}too-many`,
      chickenTypeId,
      occurredAt: new Date("2026-10-26T12:00:00.000Z"),
      direction: "REMOVE",
      quantity: 18,
    })).rejects.toMatchObject({ status: 409 });
  });
});
