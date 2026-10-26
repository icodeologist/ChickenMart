import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MoneyMovementType } from "@prisma/client";
import { getPurchasePassbook, postManualPassbookEntry } from "@/lib/accounting/engine";
import { prisma } from "@/lib/prisma";

describe("manual passbook entries", () => {
  beforeEach(async () => {
    const testExpenses = await prisma.expense.findMany({ where: { category: "Business expense" }, select: { moneyMovementId: true } });
    await prisma.manualPassbookEntry.deleteMany();
    await prisma.expense.deleteMany({ where: { category: "Business expense" } });
    await prisma.idempotencyKey.deleteMany({ where: { operation: "manual-passbook-entry" } });
    await prisma.moneyMovement.deleteMany({
      where: {
        OR: [
          { type: { in: [MoneyMovementType.MANUAL_PAYMENT, MoneyMovementType.MANUAL_RECEIPT] } },
          { id: { in: testExpenses.map((expense) => expense.moneyMovementId) } },
        ],
      },
    });
    await prisma.account.upsert({ where: { name: "Test Cash" }, update: { isActive: true }, create: { name: "Test Cash", type: "CASH" } });
    await prisma.account.upsert({ where: { name: "Test Bank" }, update: { isActive: true }, create: { name: "Test Bank", type: "BANK" } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("atomically records hard cash received as a money inflow", async () => {
    const balanceBefore = (await getPurchasePassbook()).balance;
    const result = await postManualPassbookEntry({
      idempotencyKey: "passbook-hard-cash-test",
      entryDate: new Date("2026-10-20T18:00:00.000Z"),
      description: "Shop supplies",
      amount: "1.00",
      paymentType: "HARD_CASH",
    });

    const entry = await prisma.manualPassbookEntry.findUniqueOrThrow({
      where: { id: result.id },
      include: { moneyMovement: true },
    });
    expect(entry.amount.toFixed(2)).toBe("1.00");
    expect(entry.moneyMovement?.type).toBe(MoneyMovementType.MANUAL_RECEIPT);
    expect(entry.moneyMovement?.fromAccountId).toBeNull();
    expect(entry.moneyMovement?.toAccountId).not.toBeNull();
    expect((await getPurchasePassbook()).balance.minus(balanceBefore).toFixed(2)).toBe("1.00");
  });

  it("records credit without changing cash or bank", async () => {
    const before = await prisma.moneyMovement.count();
    const balanceBefore = (await getPurchasePassbook()).balance;
    const result = await postManualPassbookEntry({
      idempotencyKey: "passbook-credit-test",
      entryDate: new Date("2026-10-20T18:00:00.000Z"),
      description: "Credit purchase",
      amount: "1.00",
      paymentType: "CREDIT",
    });

    const entry = await prisma.manualPassbookEntry.findUniqueOrThrow({ where: { id: result.id } });
    expect(entry.moneyMovementId).toBeNull();
    expect(await prisma.moneyMovement.count()).toBe(before);
    expect((await getPurchasePassbook()).balance.minus(balanceBefore).toFixed(2)).toBe("0.00");
  });

  it("records a business expense and reduces the balance", async () => {
    const balanceBefore = (await getPurchasePassbook()).balance;
    const result = await postManualPassbookEntry({
      idempotencyKey: "passbook-expense-test",
      entryDate: new Date("2026-10-20T18:00:00.000Z"),
      description: "Cleaning supplies",
      amount: "1.00",
      paymentType: "EXPENSE",
    });

    const entry = await prisma.manualPassbookEntry.findUniqueOrThrow({ where: { id: result.id }, include: { moneyMovement: true } });
    const expense = await prisma.expense.findUniqueOrThrow({ where: { moneyMovementId: entry.moneyMovementId! } });
    expect(entry.moneyMovement?.type).toBe(MoneyMovementType.EXPENSE_PAYMENT);
    expect(entry.moneyMovement?.fromAccountId).not.toBeNull();
    expect(expense.amount.toFixed(2)).toBe("1.00");
    expect((await getPurchasePassbook()).balance.minus(balanceBefore).toFixed(2)).toBe("-1.00");
  });

  it("sorts recent and oldest by the time recorded, not the transaction date", async () => {
    const older = await postManualPassbookEntry({
      idempotencyKey: "passbook-sort-older-test",
      entryDate: new Date("2026-10-20T18:00:00.000Z"),
      description: "Recorded first with newer transaction date",
      amount: "1.00",
      paymentType: "HARD_CASH",
    });
    const newer = await postManualPassbookEntry({
      idempotencyKey: "passbook-sort-newer-test",
      entryDate: new Date("2026-01-01T18:00:00.000Z"),
      description: "Recorded second with older transaction date",
      amount: "1.00",
      paymentType: "HARD_CASH",
    });
    await prisma.manualPassbookEntry.update({ where: { id: older.id }, data: { createdAt: new Date("2026-10-20T10:00:00.000Z") } });
    await prisma.manualPassbookEntry.update({ where: { id: newer.id }, data: { createdAt: new Date("2026-10-20T11:00:00.000Z") } });

    const recent = await getPurchasePassbook({ sort: "RECENT" });
    const oldest = await getPurchasePassbook({ sort: "OLDEST" });
    const recentTestEntries = recent.entries.filter((entry) => entry.id === `manual-${older.id}` || entry.id === `manual-${newer.id}`);
    const oldestTestEntries = oldest.entries.filter((entry) => entry.id === `manual-${older.id}` || entry.id === `manual-${newer.id}`);

    expect(recentTestEntries.map((entry) => entry.id)).toEqual([`manual-${newer.id}`, `manual-${older.id}`]);
    expect(oldestTestEntries.map((entry) => entry.id)).toEqual([`manual-${older.id}`, `manual-${newer.id}`]);
  });

  it("paginates after applying filters and sorting", async () => {
    await postManualPassbookEntry({
      idempotencyKey: "passbook-pagination-first-test",
      entryDate: new Date("2026-10-20T18:00:00.000Z"),
      description: "Pagination first",
      amount: "1.00",
      paymentType: "HARD_CASH",
    });
    await postManualPassbookEntry({
      idempotencyKey: "passbook-pagination-second-test",
      entryDate: new Date("2026-10-21T18:00:00.000Z"),
      description: "Pagination second",
      amount: "1.00",
      paymentType: "HARD_CASH",
    });

    const firstPage = await getPurchasePassbook({ sort: "RECENT", page: 1, pageSize: 1 });
    const secondPage = await getPurchasePassbook({ sort: "RECENT", page: 2, pageSize: 1 });
    expect(firstPage.entries).toHaveLength(1);
    expect(secondPage.entries).toHaveLength(1);
    expect(firstPage.entries[0].id).not.toBe(secondPage.entries[0].id);
    expect(firstPage.pagination.pageSize).toBe(1);
    expect(firstPage.pagination.totalPages).toBe(firstPage.pagination.totalEntries);
    expect(secondPage.totalHardCash.toFixed(2)).toBe(firstPage.totalHardCash.toFixed(2));

    const clampedPage = await getPurchasePassbook({ page: 9999, pageSize: 1 });
    expect(clampedPage.pagination.page).toBe(clampedPage.pagination.totalPages);
  });
});
