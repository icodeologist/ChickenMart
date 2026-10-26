import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CreditStatus, MoneyMovementType } from "@prisma/client";
import { getAdminOverview, getPurchasePassbook, postCustomerCreditPayment, postCustomerCreditSale } from "@/lib/accounting/engine";
import { prisma } from "@/lib/prisma";

const key = "customer-credit-unpaid-integration-test";
let customerId = "";
let chickenTypeId = "";
let cashAccountId = "";

describe("customer credit sales", () => {
  beforeAll(async () => {
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: key } } });
    const customer = await prisma.customer.upsert({
      where: { name: "Integration Credit Customer" },
      update: { isActive: true },
      create: { name: "Integration Credit Customer", phone: "9000000001", address: "Test address" },
    });
    const chickenType = await prisma.chickenType.upsert({
      where: { code: "CREDIT_TEST" },
      update: { isActive: true },
      create: { code: "CREDIT_TEST", name: "Credit Test Chicken" },
    });
    customerId = customer.id;
    chickenTypeId = chickenType.id;
    const cashAccount = await prisma.account.upsert({
      where: { name: "Customer Credit Test Cash" },
      update: { isActive: true },
      create: { name: "Customer Credit Test Cash", type: "CASH" },
    });
    cashAccountId = cashAccount.id;

  });

  afterAll(async () => {
    const sales = await prisma.creditSale.findMany({ where: { customerId }, include: { items: true, payments: true } });
    const itemIds = sales.flatMap((sale) => sale.items.map((item) => item.id));
    const paymentMovementIds = sales.flatMap((sale) => sale.payments.map((payment) => payment.moneyMovementId));
    await prisma.inventoryMovement.deleteMany({ where: { creditSaleItemId: { in: itemIds } } });
    await prisma.creditSalePayment.deleteMany({ where: { creditSaleId: { in: sales.map((sale) => sale.id) } } });
    await prisma.moneyMovement.deleteMany({ where: { id: { in: paymentMovementIds } } });
    await prisma.creditSaleItem.deleteMany({ where: { creditSaleId: { in: sales.map((sale) => sale.id) } } });
    await prisma.creditSale.deleteMany({ where: { id: { in: sales.map((sale) => sale.id) } } });
    await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: key } } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.chickenType.deleteMany({ where: { id: chickenTypeId } });
    await prisma.$disconnect();
  });

  it("records an unpaid sale without requiring or changing inventory", async () => {
    const balanceBefore = (await getPurchasePassbook()).balance;
    const outstandingBefore = (await getPurchasePassbook()).customerOutstanding;
    const result = await postCustomerCreditSale({
      idempotencyKey: key,
      customerId,
      soldAt: new Date("2026-10-20T09:00:00.000Z"),
      chickenTypeId,
      quantityKg: "1.000",
      unitPrice: "200.0000",
      paidAmount: "0",
      paymentMethod: "CREDIT",
    });

    const sale = await prisma.creditSale.findUniqueOrThrow({
      where: { id: result.id },
      include: { items: true, payments: true },
    });
    expect(sale.status).toBe(CreditStatus.OPEN);
    expect(sale.totalAmount.toFixed(2)).toBe("200.00");
    expect(sale.payments).toHaveLength(0);
    expect(await prisma.inventoryMovement.count({ where: { creditSaleItemId: { in: sale.items.map((item) => item.id) } } })).toBe(0);
    expect(await prisma.moneyMovement.count({ where: { reference: sale.id, type: MoneyMovementType.SALE_RECEIPT } })).toBe(0);

    const afterCredit = await getPurchasePassbook();
    expect(afterCredit.balance.toFixed(2)).toBe(balanceBefore.toFixed(2));
    expect(afterCredit.customerOutstanding.minus(outstandingBefore).toFixed(2)).toBe("200.00");
    expect(afterCredit.entries.some((entry) => entry.id === `customer-credit-${sale.id}`)).toBe(false);
    expect(afterCredit.entries.some((entry) => entry.id.startsWith("customer-credit-summary-") && entry.entryType === "CUSTOMER_CREDIT")).toBe(true);

    await postCustomerCreditPayment({
      idempotencyKey: `${key}-partial-payment`,
      creditSaleId: sale.id,
      paidAt: new Date("2026-10-21T09:00:00.000Z"),
      amount: "80.00",
      paymentMethod: "CASH",
      accountId: cashAccountId,
    });

    const afterPayment = await getPurchasePassbook();
    expect(afterPayment.balance.minus(balanceBefore).toFixed(2)).toBe("80.00");
    expect(afterPayment.customerOutstanding.minus(outstandingBefore).toFixed(2)).toBe("120.00");
    expect(afterPayment.entries.some((entry) => entry.entryType === "CUSTOMER_PAYMENT" && entry.customerPaymentAmount.toFixed(2) === "80.00")).toBe(true);

    const overview = await getAdminOverview();
    expect(overview.balance.toFixed(2)).toBe(afterPayment.balance.toFixed(2));
    expect(overview.customerOutstanding.toFixed(2)).toBe(afterPayment.customerOutstanding.toFixed(2));
    expect(overview.estimatedSales.minus(overview.estimatedPurchaseCost).toFixed(2)).toBe(overview.estimatedProfit.toFixed(2));
    expect(overview.customersOwing.find((customer) => customer.id === customerId)?.amount.toFixed(2)).toBe("120.00");
    expect(overview.recentActivity.some((entry) => entry.entryType === "CUSTOMER_PAYMENT" && entry.amount.toFixed(2) === "80.00")).toBe(true);
  });

  it("resolves an account when a customer payment has no account id", async () => {
    const saleResult = await postCustomerCreditSale({
      idempotencyKey: `${key}-missing-account-sale`,
      customerId,
      soldAt: new Date("2026-10-21T10:00:00.000Z"),
      chickenTypeId,
      quantityKg: "1.000",
      unitPrice: "200.0000",
      paidAmount: "0",
      paymentMethod: "CREDIT",
    });

    const paymentResult = await postCustomerCreditPayment({
      idempotencyKey: `${key}-missing-account-payment`,
      creditSaleId: saleResult.id,
      paidAt: new Date("2026-10-21T11:00:00.000Z"),
      amount: "25.00",
      paymentMethod: "UPI",
    });

    const payment = await prisma.creditSalePayment.findUniqueOrThrow({
      where: { id: paymentResult.id },
      include: { moneyMovement: { include: { toAccount: true } } },
    });
    expect(payment.moneyMovement?.toAccount?.type).toBe("BANK");
  });
});
