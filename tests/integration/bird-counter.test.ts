import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { getAdminOverview, getBirdCounter, postBirdCountAdjustment } from "@/lib/accounting/engine";
import { prisma } from "@/lib/prisma";

const layerCode = "LAYER_COUNTER_TEST";
const supplierName = "Bird Counter Integration Supplier";
const receiptNumbers = ["BIRD-COUNTER-INTEGRATION", "BIRD-COUNTER-VOID"];
const keyPrefix = "bird-counter-integration-";
const adjustmentNotes = ["Bird counter integration removal", "Bird counter integration addition"];
let broilerId = "";
let layerId = "";
let baselineBroilerCount = 0;
let baselineTotalBirds = 0;

async function cleanup() {
  const layer = await prisma.chickenType.findUnique({ where: { code: layerCode }, select: { id: true } });
  const receipts = await prisma.stockReceipt.findMany({ where: { receiptNumber: { in: receiptNumbers } }, select: { id: true } });
  const supplier = await prisma.supplier.findUnique({ where: { name: supplierName }, select: { id: true } });
  await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: keyPrefix } } });
  await prisma.birdCountAdjustment.deleteMany({ where: { notes: { in: adjustmentNotes } } });
  if (layer) await prisma.birdCountAdjustment.deleteMany({ where: { chickenTypeId: layer.id } });
  if (receipts.length) {
    const receiptIds = receipts.map((receipt) => receipt.id);
    await prisma.stockReceiptItem.deleteMany({ where: { stockReceiptId: { in: receiptIds } } });
    await prisma.supplierPayable.deleteMany({ where: { stockReceiptId: { in: receiptIds } } });
    await prisma.stockReceipt.deleteMany({ where: { id: { in: receiptIds } } });
  }
  if (supplier) await prisma.supplier.delete({ where: { id: supplier.id } });
  if (layer) await prisma.chickenType.delete({ where: { id: layer.id } });
}

describe("admin bird counter", () => {
  beforeAll(async () => {
    await cleanup();
    const [broiler, , layer, supplier] = await Promise.all([
      prisma.chickenType.upsert({ where: { code: "BROILER" }, update: { isActive: true }, create: { code: "BROILER", name: "Broiler" } }),
      prisma.chickenType.upsert({ where: { code: "TYSON" }, update: { isActive: true }, create: { code: "TYSON", name: "Tyson" } }),
      prisma.chickenType.create({ data: { code: layerCode, name: "Layer Chicken" } }),
      prisma.supplier.create({ data: { name: supplierName } }),
    ]);
    broilerId = broiler.id;
    layerId = layer.id;
    const baseline = await getBirdCounter();
    baselineBroilerCount = baseline.byType.find((type) => type.id === broilerId)?.count ?? 0;
    baselineTotalBirds = baseline.totalBirds;

    await prisma.stockReceipt.create({
      data: {
        receiptNumber: receiptNumbers[0],
        supplierId: supplier.id,
        receivedAt: new Date("2026-10-26T09:00:00.000Z"),
        items: {
          create: [
            { chickenTypeId: broiler.id, quantityKg: new Prisma.Decimal("50.000"), birdCount: 20, wastagePerBirdKg: new Prisma.Decimal("0.600"), unitCost: new Prisma.Decimal("100.0000"), suggestedSellRate: new Prisma.Decimal("150.0000"), lineAmount: new Prisma.Decimal("5000.00") },
            { chickenTypeId: layer.id, quantityKg: new Prisma.Decimal("25.000"), birdCount: 30, wastagePerBirdKg: new Prisma.Decimal("0.000"), unitCost: new Prisma.Decimal("100.0000"), suggestedSellRate: new Prisma.Decimal("150.0000"), lineAmount: new Prisma.Decimal("2500.00") },
          ],
        },
        payable: { create: { supplierId: supplier.id, payableDate: new Date("2026-10-26T00:00:00.000Z"), originalAmount: new Prisma.Decimal("7500.00") } },
      },
    });

    await prisma.stockReceipt.create({
      data: {
        receiptNumber: receiptNumbers[1],
        supplierId: supplier.id,
        receivedAt: new Date("2026-10-26T09:30:00.000Z"),
        items: {
          create: { chickenTypeId: broiler.id, quantityKg: new Prisma.Decimal("100.000"), birdCount: 99, wastagePerBirdKg: new Prisma.Decimal("0.600"), unitCost: new Prisma.Decimal("100.0000"), suggestedSellRate: new Prisma.Decimal("150.0000"), lineAmount: new Prisma.Decimal("10000.00") },
        },
        payable: { create: { supplierId: supplier.id, payableDate: new Date("2026-10-26T00:00:00.000Z"), originalAmount: new Prisma.Decimal("10000.00"), status: "VOID" } },
      },
    });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("shows only Broiler and Tyson and ignores Layer Chicken and voided entries", async () => {
    const initial = await getBirdCounter();
    expect(initial.byType.map((type) => type.name)).toEqual(["Broiler", "Tyson"]);
    expect(initial.totalBirds).toBe(baselineTotalBirds + 20);
    expect(initial.byType.find((type) => type.id === broilerId)?.count).toBe(baselineBroilerCount + 20);
    expect(initial.byType.some((type) => type.id === layerId)).toBe(false);

    await expect(postBirdCountAdjustment({ idempotencyKey: `${keyPrefix}layer`, chickenTypeId: layerId, occurredAt: new Date("2026-10-26T09:45:00.000Z"), direction: "REMOVE", quantity: 1 })).rejects.toMatchObject({ status: 400 });
  });

  it("reflects View Entry edits without replacing adjustment history", async () => {
    const item = await prisma.stockReceiptItem.findFirstOrThrow({ where: { chickenTypeId: broilerId, stockReceipt: { receiptNumber: receiptNumbers[0] } } });
    await prisma.stockReceiptItem.update({ where: { id: item.id }, data: { birdCount: 25 } });
    expect((await getBirdCounter()).byType.find((type) => type.id === broilerId)?.count).toBe(baselineBroilerCount + 25);
    await prisma.stockReceiptItem.update({ where: { id: item.id }, data: { birdCount: 20 } });
  });

  it("records idempotent additions and removals", async () => {
    const removal = { idempotencyKey: `${keyPrefix}remove`, chickenTypeId: broilerId, occurredAt: new Date("2026-10-26T10:00:00.000Z"), direction: "REMOVE" as const, quantity: 5, notes: adjustmentNotes[0] };
    const first = await postBirdCountAdjustment(removal);
    const retry = await postBirdCountAdjustment(removal);
    expect(retry.id).toBe(first.id);
    expect(retry.duplicate).toBe(true);

    await postBirdCountAdjustment({ idempotencyKey: `${keyPrefix}add`, chickenTypeId: broilerId, occurredAt: new Date("2026-10-26T11:00:00.000Z"), direction: "ADD", quantity: 2, notes: adjustmentNotes[1] });

    const counter = await getBirdCounter();
    expect(counter.byType.find((type) => type.id === broilerId)?.count).toBe(baselineBroilerCount + 17);
    expect(await prisma.birdCountAdjustment.count({ where: { notes: { in: adjustmentNotes } } })).toBe(2);
    expect(counter.recentAdjustments.some((entry) => entry.notes === adjustmentNotes[0])).toBe(true);
    expect((await getAdminOverview()).birdCounter.byType.find((type) => type.id === broilerId)?.count).toBe(baselineBroilerCount + 17);
  });

  it("does not allow removing more birds than are available", async () => {
    const available = (await getBirdCounter()).byType.find((type) => type.id === broilerId)?.count ?? 0;
    await expect(postBirdCountAdjustment({ idempotencyKey: `${keyPrefix}too-many`, chickenTypeId: broilerId, occurredAt: new Date("2026-10-26T12:00:00.000Z"), direction: "REMOVE", quantity: available + 1 })).rejects.toMatchObject({ status: 409 });
  });
});
