import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteManualPassbookEntry, editManualPassbookEntry, getPurchasePassbook, postManualPassbookEntry } from "@/lib/accounting/engine";
import { prisma } from "@/lib/prisma";

const keyPrefix = "record-correction-integration";
const description = "Record correction integration entry";

async function cleanup() {
  const entries = await prisma.manualPassbookEntry.findMany({ where: { description }, select: { id: true, moneyMovementId: true } });
  const movementIds = entries.flatMap((entry) => entry.moneyMovementId ? [entry.moneyMovementId] : []);
  await prisma.manualPassbookEntry.updateMany({ where: { id: { in: entries.map((entry) => entry.id) } }, data: { replacementOfId: null } });
  await prisma.manualPassbookEntry.deleteMany({ where: { id: { in: entries.map((entry) => entry.id) } } });
  await prisma.moneyMovement.deleteMany({ where: { reversalOfId: { in: movementIds } } });
  await prisma.moneyMovement.deleteMany({ where: { id: { in: movementIds } } });
  await prisma.idempotencyKey.deleteMany({ where: { key: { startsWith: keyPrefix } } });
}

describe("record corrections", () => {
  beforeAll(async () => {
    await cleanup();
    await prisma.account.upsert({ where: { name: "Correction Test Cash" }, update: { isActive: true }, create: { name: "Correction Test Cash", type: "CASH" } });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("replaces and then deletes a manual passbook entry without changing the final balance", async () => {
    const startingBalance = (await getPurchasePassbook()).balance;
    const original = await postManualPassbookEntry({ idempotencyKey: `${keyPrefix}-add`, entryDate: new Date("2026-10-20T18:00:00.000Z"), description, amount: "100.00", paymentType: "HARD_CASH" });
    const replacement = await editManualPassbookEntry({ idempotencyKey: `${keyPrefix}-edit`, manualPassbookEntryId: original.id, entryDate: new Date("2026-10-21T18:00:00.000Z"), description, amount: "250.00", paymentType: "UPI" });

    const afterEdit = await getPurchasePassbook();
    expect(afterEdit.entries.some((entry) => entry.id === `manual-${original.id}`)).toBe(false);
    expect(afterEdit.entries.some((entry) => entry.id === `manual-${replacement.id}`)).toBe(true);
    expect(afterEdit.balance.minus(startingBalance).toFixed(2)).toBe("250.00");

    await deleteManualPassbookEntry({ idempotencyKey: `${keyPrefix}-delete`, manualPassbookEntryId: replacement.id });
    const afterDelete = await getPurchasePassbook();
    expect(afterDelete.entries.some((entry) => entry.id === `manual-${replacement.id}`)).toBe(false);
    expect(afterDelete.balance.toFixed(2)).toBe(startingBalance.toFixed(2));
  });
});
