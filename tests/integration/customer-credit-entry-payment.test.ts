import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MoneyMovementType } from "@prisma/client";
import { getCustomerCreditEntries, getPurchasePassbook, postCustomerCreditEntry, postCustomerCreditEntryPayment } from "@/lib/accounting/engine";
import { prisma } from "@/lib/prisma";

const keyPrefix = "customer-credit-entry-payment-test";
const customerName = "Credit Entry Payment Test Customer";

async function cleanup() {
  const entries = await prisma.customerCreditEntry.findMany({
    where: { customerName },
    include: { payments: { select: { moneyMovementId: true } } },
  });
  const entryIds = entries.map((entry) => entry.id);
  const movementIds = entries.flatMap((entry) => entry.payments.map((payment) => payment.moneyMovementId));
  await prisma.customerCreditEntryPayment.deleteMany({ where: { customerCreditEntryId: { in: entryIds } } });
  await prisma.moneyMovement.deleteMany({ where: { id: { in: movementIds } } });
  await prisma.customerCreditEntry.deleteMany({ where: { id: { in: entryIds } } });
  await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: keyPrefix } } });
}

describe("customer credit entry payments", () => {
  beforeAll(cleanup);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("tracks partial payments, posts collections to the passbook, and hides fully paid credit", async () => {
    const startingPassbook = await getPurchasePassbook();
    const credit = await postCustomerCreditEntry({
      idempotencyKey: `${keyPrefix}-credit`,
      customerName,
      description: "Chicken supplied on credit",
      amount: "2500.00",
      creditedAt: new Date("2026-10-24T09:00:00.000Z"),
    });

    const afterCredit = await getPurchasePassbook();
    expect(afterCredit.balance.toFixed(2)).toBe(startingPassbook.balance.toFixed(2));
    expect(afterCredit.customerOutstanding.minus(startingPassbook.customerOutstanding).toFixed(2)).toBe("2500.00");
    expect(afterCredit.entries.some((entry) => entry.id === `customer-credit-entry-${credit.id}`)).toBe(false);
    expect(afterCredit.entries.some((entry) => entry.id.startsWith("customer-credit-summary-") && entry.entryType === "CUSTOMER_CREDIT")).toBe(true);

    const partial = await postCustomerCreditEntryPayment({
      idempotencyKey: `${keyPrefix}-partial`,
      customerCreditEntryId: credit.id,
      paidAt: new Date("2026-10-25T09:00:00.000Z"),
      amount: "500.00",
      paymentMethod: "CASH",
    });
    const savedPartial = await prisma.customerCreditEntryPayment.findUniqueOrThrow({
      where: { id: partial.id },
      include: { moneyMovement: true },
    });
    expect(savedPartial.moneyMovement.type).toBe(MoneyMovementType.CUSTOMER_COLLECTION);
    expect(savedPartial.moneyMovement.toAccountId).not.toBeNull();

    const activeAfterPartial = await getCustomerCreditEntries();
    const partialCredit = activeAfterPartial.find((entry) => entry.id === credit.id);
    expect(partialCredit?.paidAmount.toFixed(2)).toBe("500.00");
    expect(partialCredit?.remainingAmount.toFixed(2)).toBe("2000.00");

    const afterPartial = await getPurchasePassbook();
    expect(afterPartial.balance.minus(startingPassbook.balance).toFixed(2)).toBe("500.00");
    expect(afterPartial.customerOutstanding.minus(startingPassbook.customerOutstanding).toFixed(2)).toBe("2000.00");
    expect(afterPartial.entries.some((entry) => entry.id === `customer-credit-entry-payment-${partial.id}` && entry.paymentMethod === "CASH")).toBe(true);

    await expect(postCustomerCreditEntryPayment({
      idempotencyKey: `${keyPrefix}-overpayment`,
      customerCreditEntryId: credit.id,
      paidAt: new Date("2026-10-25T10:00:00.000Z"),
      amount: "2000.01",
      paymentMethod: "UPI",
    })).rejects.toThrow("Payment exceeds the remaining customer credit.");

    const finalPayment = await postCustomerCreditEntryPayment({
      idempotencyKey: `${keyPrefix}-final`,
      customerCreditEntryId: credit.id,
      paidAt: new Date("2026-10-26T09:00:00.000Z"),
      amount: "2000.00",
      paymentMethod: "UPI",
    });

    expect((await getCustomerCreditEntries()).some((entry) => entry.id === credit.id)).toBe(false);
    const completedPassbook = await getPurchasePassbook();
    expect(completedPassbook.balance.minus(startingPassbook.balance).toFixed(2)).toBe("2500.00");
    expect(completedPassbook.customerOutstanding.toFixed(2)).toBe(startingPassbook.customerOutstanding.toFixed(2));
    expect(completedPassbook.entries.some((entry) => entry.id === `customer-credit-entry-payment-${finalPayment.id}` && entry.paymentMethod === "UPI")).toBe(true);
  });
});
