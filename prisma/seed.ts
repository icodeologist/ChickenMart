import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const d = (value: string) => new Prisma.Decimal(value);

async function main() {
  if (await prisma.shopSetup.findFirst()) {
    console.info("Demo seed skipped: a shop setup already exists.");
    return;
  }
  await prisma.$transaction(async (tx) => {
    const [broiler, tyson, lineChicken] = await Promise.all(
      [
        { code: "BROILER", name: "Broiler" },
        { code: "TYSON", name: "Tyson" },
        { code: "LINE_CHICKEN", name: "Layer Chicken" },
      ].map((data) => tx.chickenType.upsert({
        where: { code: data.code },
        update: { name: data.name, isActive: true },
        create: data,
      })),
    );
    const setup = await tx.shopSetup.create({
      data: { shopName: "Demo Chicken Shop", openingDate: new Date("2026-01-01T00:00:00.000Z") },
    });
    const [cash, bank] = await Promise.all([
      tx.account.upsert({ where: { name: "Shop Cash" }, update: { type: "CASH", isActive: true }, create: { name: "Shop Cash", type: "CASH" } }),
      tx.account.upsert({ where: { name: "Shop Bank" }, update: { type: "BANK", isActive: true }, create: { name: "Shop Bank", type: "BANK" } }),
    ]);
    const openedAt = new Date("2026-01-01T09:00:00.000Z");
    for (const [account, amount] of [[cash, "25000.00"], [bank, "50000.00"]] as const) {
      const movement = await tx.moneyMovement.create({
        data: { occurredAt: openedAt, amount: d(amount), type: "OPENING_BALANCE", toAccountId: account.id, reference: "Opening balance" },
      });
      await tx.openingAccountBalance.create({
        data: { setupId: setup.id, accountId: account.id, amount: d(amount), moneyMovementId: movement.id },
      });
    }
    for (const [chickenType, quantityKg, unitCost] of [
      [broiler, "120.500", "182.7500"],
      [tyson, "65.250", "205.5000"],
      [lineChicken, "40.000", "168.2500"],
    ] as const) {
      const position = await tx.openingInventoryPosition.create({
        data: { setupId: setup.id, chickenTypeId: chickenType.id, quantityKg: d(quantityKg), unitCost: d(unitCost) },
      });
      await tx.inventoryMovement.create({
        data: { chickenTypeId: chickenType.id, occurredAt: openedAt, quantityKg: d(quantityKg), unitCost: d(unitCost), kind: "OPENING", openingInventoryPositionId: position.id },
      });
    }
    await Promise.all([
      tx.supplier.upsert({
        where: { name: "Demo Poultry Supplier" },
        update: { phone: "9876543210", isActive: true },
        create: { name: "Demo Poultry Supplier", phone: "9876543210" },
      }),
      tx.customer.upsert({
        where: { name: "Demo Credit Customer" },
        update: { phone: "9123456780", isActive: true },
        create: { name: "Demo Credit Customer", phone: "9123456780" },
      }),
    ]);
  });
  console.info("Demo shop setup, accounts, and opening inventory created.");
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
