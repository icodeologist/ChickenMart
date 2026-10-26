import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MoneyMovementType } from "@prisma/client";
import { deleteReceipt, getPurchasePassbook, getRecentChickenReceipts, getSupplierCreditLines, postReceipt, postSupplierSettlement } from "@/lib/accounting/engine";
import { prisma } from "@/lib/prisma";

const keyPrefix = "supplier-payment-passbook-test";
const receiptNumber = "SUPPLIER-PAYMENT-PASSBOOK-TEST";
const multiPaymentReceiptNumber = "SUPPLIER-MULTI-PAYMENT-DELETE-TEST";
const supplierName = "Supplier Payment Passbook Test";
const chickenCode = "SUPPLIER_PAYMENT_TEST";

async function cleanup() {
  const receipts = await prisma.stockReceipt.findMany({
    where: { receiptNumber: { in: [receiptNumber, multiPaymentReceiptNumber] } },
    include: { items: true, payable: { include: { payments: true } } },
  });
  for (const receipt of receipts) {
    const itemIds = receipt.items.map((item) => item.id);
    const movementIds = receipt.payable?.payments.map((payment) => payment.moneyMovementId) ?? [];
    const receiptMovements = await prisma.inventoryMovement.findMany({ where: { stockReceiptItemId: { in: itemIds } }, select: { id: true } });
    const reversalIds = receiptMovements.map((movement) => movement.id);
    const reversals = await prisma.inventoryMovement.findMany({ where: { reversalOfId: { in: reversalIds } }, select: { id: true, stockAdjustmentId: true } });
    await prisma.inventoryMovement.deleteMany({ where: { id: { in: reversals.map((movement) => movement.id) } } });
    await prisma.stockAdjustment.deleteMany({ where: { id: { in: reversals.flatMap((movement) => movement.stockAdjustmentId ? [movement.stockAdjustmentId] : []) } } });
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

  it("rejects overpayment and settles the invoice exactly", async () => {
    const startingPassbook = await getPurchasePassbook();
    const startingBalance = startingPassbook.balance;
    const startingSupplierOutstanding = startingPassbook.supplierOutstanding;
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
    const postedItem = await prisma.stockReceiptItem.findFirstOrThrow({ where: { stockReceiptId: receipt.id } });
    expect(await prisma.inventoryMovement.count({ where: { stockReceiptItemId: postedItem.id } })).toBe(0);
    const afterPurchase = (await getPurchasePassbook()).balance;
    expect(afterPurchase.minus(startingBalance).toFixed(2)).toBe("0.00");
    expect((await getPurchasePassbook()).supplierOutstanding.minus(startingSupplierOutstanding).toFixed(2)).toBe("1000.00");

    await expect(postSupplierSettlement({
      idempotencyKey: `${keyPrefix}-payment`,
      payableId: payable.id,
      paidAt: new Date("2026-10-22T10:00:00.000Z"),
      paymentAmount: "1200.00",
      paymentMethod: "CASH",
    })).rejects.toMatchObject({ status: 409 });

    const payment = await postSupplierSettlement({
      idempotencyKey: `${keyPrefix}-payment-exact`,
      payableId: payable.id,
      paidAt: new Date("2026-10-22T10:00:00.000Z"),
      paymentAmount: "1000.00",
      paymentMethod: "CASH",
    });

    const savedPayment = await prisma.supplierPayment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { moneyMovement: true },
    });
    expect(savedPayment.moneyMovement.type).toBe(MoneyMovementType.SUPPLIER_PAYMENT);
    expect(savedPayment.moneyMovement.fromAccountId).not.toBeNull();
    expect(savedPayment.amount.toFixed(2)).toBe("1000.00");
    expect(savedPayment.appliedAmount.toFixed(2)).toBe("1000.00");
    expect(savedPayment.advanceAmount.toFixed(2)).toBe("0.00");

    const passbook = await getPurchasePassbook();
    expect(passbook.balance.minus(afterPurchase).toFixed(2)).toBe("-1000.00");
    expect(passbook.supplierOutstanding.minus(startingSupplierOutstanding).toFixed(2)).toBe("0.00");
    expect((await prisma.supplierPayable.findUniqueOrThrow({ where: { id: payable.id } })).status).toBe("PAID");

    const creditLine = (await getSupplierCreditLines()).find((row) => row.payableId === payable.id);
    expect(creditLine?.paidAmount.toFixed(2)).toBe("1000.00");
    expect(creditLine?.remainingAmount.toFixed(2)).toBe("0.00");
    expect(creditLine?.remainingAmount.toFixed(2)).toBe("0.00");
    expect(creditLine?.purchaseRate.toFixed(4)).toBe("100.0000");

    const receiptView = (await getRecentChickenReceipts()).find((row) => row.id === receipt.id || row.supplier === supplierName);
    expect(receiptView?.paidAmount.toFixed(2)).toBe("1000.00");
    expect(receiptView?.remainingAmount.toFixed(2)).toBe("0.00");

    const receiptItem = await prisma.stockReceiptItem.findFirstOrThrow({ where: { stockReceiptId: receipt.id } });
    await deleteReceipt({ idempotencyKey: `${keyPrefix}-delete`, itemId: receiptItem.id });

    expect((await getRecentChickenReceipts()).some((row) => row.id === receiptItem.id)).toBe(false);
    const convertedPayment = await prisma.supplierPayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(convertedPayment.appliedAmount.toFixed(2)).toBe("1000.00");
    expect(convertedPayment.advanceAmount.toFixed(2)).toBe("0.00");
    const afterDelete = await getPurchasePassbook();
    expect(afterDelete.balance.minus(startingBalance).toFixed(2)).toBe("-1000.00");
    expect(afterDelete.entries.some((entry) => entry.id === `purchase-${receiptItem.id}`)).toBe(false);
    expect(afterDelete.entries.some((entry) => entry.id === `payment-${payment.id}`)).toBe(true);
  });

  it("deletes a receipt with several supplier payments", async () => {
    const receipt = await postReceipt({
      idempotencyKey: `${keyPrefix}-multi-receipt`,
      receiptNumber: multiPaymentReceiptNumber,
      supplierId,
      receivedAt: new Date("2026-10-23T09:00:00.000Z"),
      paidAmount: "0",
      items: [{
        chickenTypeId,
        quantityKg: "100.000",
        birdCount: 50,
        unitCost: "100.0000",
        suggestedSellRate: "150.0000",
      }],
    });
    const payable = await prisma.supplierPayable.findUniqueOrThrow({ where: { stockReceiptId: receipt.id } });

    for (const [index, amount] of ["2000.00", "3000.00", "2500.00", "1500.00", "1000.00"].entries()) {
      await postSupplierSettlement({
        idempotencyKey: `${keyPrefix}-multi-payment-${index}`,
        payableId: payable.id,
        paidAt: new Date(`2026-10-23T1${index}:00:00.000Z`),
        paymentAmount: amount,
        paymentMethod: "CASH",
      });
    }

    const receiptItem = await prisma.stockReceiptItem.findFirstOrThrow({ where: { stockReceiptId: receipt.id } });
    await deleteReceipt({ idempotencyKey: `${keyPrefix}-multi-delete`, itemId: receiptItem.id });

    const payments = await prisma.supplierPayment.findMany({ where: { payableId: payable.id } });
    expect(payments).toHaveLength(5);
    expect(payments.every((payment) => payment.appliedAmount.equals(payment.amount))).toBe(true);
    expect(payments.every((payment) => payment.advanceAmount.isZero())).toBe(true);
    expect((await prisma.supplierPayable.findUniqueOrThrow({ where: { id: payable.id } })).status).toBe("VOID");
    expect((await getRecentChickenReceipts()).some((row) => row.id === receiptItem.id)).toBe(false);
  });
});
