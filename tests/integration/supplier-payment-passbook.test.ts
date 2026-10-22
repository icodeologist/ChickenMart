import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MoneyMovementType } from "@prisma/client";
import { getPurchasePassbook, postReceipt, postSupplierSettlement } from "@/lib/accounting/engine";
import { prisma } from "@/lib/prisma";

const keyPrefix = "supplier-payment-passbook-test";
const receiptNumber = "SUPPLIER-PAYMENT-PASSBOOK-TEST";
const supplierName = "Supplier Payment Passbook Test";
const chickenCode = "SUPPLIER_PAYMENT_TEST";

async function cleanup() {
  const receipt = await prisma.stockReceipt.findUnique({
    where: { receiptNumber },
    include: { items: true, payable: { include: { payments: true } } },
  });
  if (receipt) {
    const itemIds = receipt.items.map((item) => item.id);
    const movementIds = receipt.payable?.payments.map((payment) => payment.moneyMovementId) ?? [];
    await prisma.inventoryMovement.deleteMany({ where: { stockReceiptItemId: { in: itemIds } } });
    if (receipt.payable) {
      await prisma.supplierPayment.deleteMany({ where: { payableId: receipt.payable.id } });
      await prisma.moneyMovement.deleteMany({ where: { id: { in: movementIds } } });
      await prisma.supplierPayable.delete({ where: { id: receipt.payable.id } });
    }
    await prisma.stockReceiptItem.deleteMany({ where: { stockReceiptId: receipt.id } });
    await prisma.stockReceipt.delete({ where: { id: receipt.id } });
  }
  await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: keyPrefix } } });
  await prisma.supplier.deleteMany({ where: { name: supplierName } });
  await prisma.chickenType.deleteMany({ where: { code: chickenCode } });
}

describe("supplier payments in the passbook", () => {
  let supplierId = "";
  let chickenTypeId = "";

  beforeAll(async () => {
    await cleanup();
    const [supplier, chickenType] = await Promise.all([
      prisma.supplier.create({ data: { name: supplierName } }),
      prisma.chickenType.create({ data: { code: chickenCode, name: "Supplier Payment Test Chicken" } }),
    ]);
    supplierId = supplier.id;
    chickenTypeId = chickenType.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("decreases the running balance when money is paid to a supplier", async () => {
    const startingBalance = (await getPurchasePassbook()).currentBalance;
    const receipt = await postReceipt({
      idempotencyKey: `${keyPrefix}-receipt`,
      receiptNumber,
      supplierId,
      receivedAt: new Date("2026-10-22T09:00:00.000Z"),
      paidAmount: "0",
      items: [{
        chickenTypeId,
        birdCount: 5,
        quantityKg: "10.000",
        unitCost: "100.0000",
        suggestedSellRate: "150.0000",
      }],
    });
    const payable = await prisma.supplierPayable.findUniqueOrThrow({ where: { stockReceiptId: receipt.id } });
    const afterPurchase = (await getPurchasePassbook()).currentBalance;
    expect(afterPurchase.minus(startingBalance).toFixed(2)).toBe("-1000.00");

    const payment = await postSupplierSettlement({
      idempotencyKey: `${keyPrefix}-payment`,
      payableId: payable.id,
      paidAt: new Date("2026-10-22T10:00:00.000Z"),
      paymentAmount: "200.00",
      paymentMethod: "CASH",
    });

    const savedPayment = await prisma.supplierPayment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { moneyMovement: true },
    });
    expect(savedPayment.moneyMovement.type).toBe(MoneyMovementType.SUPPLIER_PAYMENT);
    expect(savedPayment.moneyMovement.fromAccountId).not.toBeNull();
    expect((await getPurchasePassbook()).currentBalance.minus(afterPurchase).toFixed(2)).toBe("-200.00");
  });
});
