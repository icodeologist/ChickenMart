import {
  AccountType,
  CreditStatus,
  InventoryMovementKind,
  MoneyMovementType,
  PayableStatus,
  Prisma,
  PrismaClient,
  StockAdjustmentReason,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AccountingError } from "@/lib/accounting/errors";
import { D, exactLineAmount, money, rate, sum, weight, ZERO } from "@/lib/accounting/decimal";
import {
  creditCustomerInput,
  chickenTypeInput,
  customerCreditPaymentInput,
  customerCreditSaleInput,
  customerCollectionInput,
  dailySaleInput,
  expenseInput,
  inventoryCorrectionInput,
  manualPassbookEntryInput,
  moneyCorrectionInput,
  ownerWithdrawalInput,
  receiptDeleteInput,
  receiptEditInput,
  receiptInput,
  reconciliationInput,
  stockCountInput,
  supplierInput,
  supplierPaymentInput,
  supplierSettlementInput,
  transferInput,
  wastageInput,
} from "@/lib/accounting/schemas";
import type {
  CreditCustomerInput,
  ChickenTypeInput,
  CustomerCreditPaymentInput,
  CustomerCreditSaleInput,
  CustomerCollectionInput,
  DailySaleInput,
  ExpenseInput,
  InventoryCorrectionInput,
  ManualPassbookEntryInput,
  MoneyCorrectionInput,
  OwnerWithdrawalInput,
  ReconciliationInput,
  StockCountInput,
  SupplierPaymentInput,
  SupplierInput,
  SupplierSettlementInput,
  TransferInput,
  WastageInput,
} from "@/lib/accounting/schemas";
import type { z } from "zod";

type DbClient = PrismaClient | Prisma.TransactionClient;
type IdempotentResult = { id: string; duplicate: boolean };
type InventoryState = { quantityKg: Prisma.Decimal; value: Prisma.Decimal };
type InventoryEffect = { quantityKg: Prisma.Decimal; valueDelta: Prisma.Decimal; issuedCost?: Prisma.Decimal; kind: InventoryMovementKind; occurredAt: Date; spoilage: boolean };

export function calculateReceiptEstimate(input: {
  quantityKg: Prisma.Decimal.Value;
  birdCount: number;
  wastagePerBirdKg: Prisma.Decimal.Value;
  purchaseRate: Prisma.Decimal.Value;
  sellingRate: Prisma.Decimal.Value;
  storedTotalAmount?: Prisma.Decimal.Value;
}) {
  const quantityKg = weight(input.quantityKg);
  const purchaseRate = rate(input.purchaseRate);
  const sellingRate = rate(input.sellingRate);
  const totalAmount = exactLineAmount(quantityKg, purchaseRate);
  if (input.storedTotalAmount !== undefined && !money(input.storedTotalAmount).equals(totalAmount)) {
    throw new AccountingError("Stored purchase total does not match total weight × buy rate.", 500);
  }
  const wastageKg = weight(D(input.birdCount).mul(weight(input.wastagePerBirdKg)));
  if (wastageKg.greaterThan(quantityKg)) throw new AccountingError("Wastage cannot exceed total chicken weight.", 500);
  const meatKg = weight(quantityKg.minus(wastageKg));
  const salesAmount = money(meatKg.mul(sellingRate));
  const profit = money(salesAmount.minus(totalAmount));
  return { quantityKg, purchaseRate, sellingRate, totalAmount, wastageKg, meatKg, salesAmount, profit };
}

function toDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function wastageRateForChicken(code: string) {
  if (code === "TYSON") return D("1.000");
  if (code === "LINE_CHICKEN") return D("0.000");
  return D("0.600");
}

function assertPositive(value: Prisma.Decimal.Value, field: string) {
  if (!D(value).greaterThan(ZERO)) throw new AccountingError(`${field} must be greater than zero.`);
}

async function requireAccount(tx: Prisma.TransactionClient, accountId: string, type?: AccountType) {
  const account = await tx.account.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive) throw new AccountingError("Account is not active.", 404);
  if (type && account.type !== type) throw new AccountingError(`Expected a ${type.toLowerCase()} account.`);
  return account;
}

async function requirePaymentAccount(tx: Prisma.TransactionClient, accountId: string, method: "CASH" | "UPI" | "NET_BANKING") {
  return requireAccount(tx, accountId, method === "CASH" ? AccountType.CASH : AccountType.BANK);
}

async function requireOrCreatePaymentAccount(tx: Prisma.TransactionClient, accountId: string | undefined, method: "CASH" | "UPI" | "NET_BANKING") {
  if (accountId) return requirePaymentAccount(tx, accountId, method);
  const type = method === "CASH" ? AccountType.CASH : AccountType.BANK;
  const existing = await tx.account.findFirst({ where: { type, isActive: true }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return tx.account.create({ data: { name: type === AccountType.CASH ? "Shop Cash" : "Shop Bank", type } });
}

async function requireActiveChickenTypes(tx: Prisma.TransactionClient, ids: string[]) {
  const types = await tx.chickenType.findMany({ where: { id: { in: ids }, isActive: true } });
  if (types.length !== ids.length) throw new AccountingError("One or more chicken types are not active.", 404);
}

async function requireActiveCustomers(tx: Prisma.TransactionClient, ids: string[]) {
  const customers = await tx.customer.findMany({ where: { id: { in: ids }, isActive: true } });
  if (customers.length !== ids.length) throw new AccountingError("One or more customers are not active.", 404);
}

async function runIdempotent(
  operation: string,
  key: string,
  work: (tx: Prisma.TransactionClient) => Promise<{ id: string }>,
): Promise<IdempotentResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const previous = await tx.idempotencyKey.findUnique({ where: { key } });
      if (previous) {
        if (previous.operation !== operation) throw new AccountingError("Idempotency key belongs to another operation.", 409);
        return { id: (previous.result as { id: string }).id, duplicate: true };
      }
      const result = await work(tx);
      await tx.idempotencyKey.create({ data: { key, operation, result: { id: result.id } } });
      return { ...result, duplicate: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const previous = await prisma.idempotencyKey.findUnique({ where: { key } });
      if (previous?.operation === operation) return { id: (previous.result as { id: string }).id, duplicate: true };
    }
    throw error;
  }
}

export async function inventoryStates(db: DbClient, asOf = new Date(), from?: Date) {
  const [types, movements] = await Promise.all([
    db.chickenType.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    db.inventoryMovement.findMany({
      where: { occurredAt: { lte: asOf } },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      include: { stockAdjustment: { select: { reason: true } } },
    }),
  ]);
  const states = new Map<string, InventoryState>(types.map((type) => [type.id, { quantityKg: ZERO, value: ZERO }]));
  const effects = new Map<string, InventoryEffect>();
  const salesCost = new Map<string, Prisma.Decimal>();
  let spoilageLoss = ZERO;

  for (const movement of movements) {
    const state = states.get(movement.chickenTypeId) ?? { quantityKg: ZERO, value: ZERO };
    const quantity = D(movement.quantityKg);
    const inPeriod = !from || movement.occurredAt >= from;
    if (movement.reversalOfId) {
      const original = effects.get(movement.reversalOfId);
      if (!original) throw new AccountingError("A reversal must occur after the movement it reverses.", 409);
      if (!quantity.equals(original.quantityKg.negated())) throw new AccountingError("Inventory reversal quantity does not match its original movement.", 409);
      state.quantityKg = state.quantityKg.plus(quantity);
      state.value = state.value.minus(original.valueDelta);
      if (state.quantityKg.lessThan(ZERO)) throw new AccountingError("Inventory reversal makes inventory negative.", 409);
      if (state.quantityKg.isZero()) state.value = ZERO;
      if (from && original.occurredAt >= from && original.kind === InventoryMovementKind.SALE) {
        salesCost.set(movement.chickenTypeId, (salesCost.get(movement.chickenTypeId) ?? ZERO).minus(original.issuedCost ?? ZERO));
      }
      if (from && original.occurredAt >= from && original.spoilage) spoilageLoss = spoilageLoss.minus(original.issuedCost ?? ZERO);
      effects.set(movement.id, { quantityKg: quantity, valueDelta: original.valueDelta.negated(), issuedCost: original.issuedCost, kind: movement.kind, occurredAt: movement.occurredAt, spoilage: false });
    } else if (quantity.greaterThan(ZERO)) {
      const valueDelta = quantity.mul(movement.unitCost);
      state.quantityKg = state.quantityKg.plus(quantity);
      state.value = state.value.plus(valueDelta);
      effects.set(movement.id, { quantityKg: quantity, valueDelta, kind: movement.kind, occurredAt: movement.occurredAt, spoilage: false });
    } else {
      const issuedQuantity = quantity.abs();
      if (state.quantityKg.lessThan(issuedQuantity)) {
        throw new AccountingError(`Inventory history goes negative for chicken type ${movement.chickenTypeId} at ${movement.occurredAt.toISOString()}.`, 409);
      }
      const average = state.quantityKg.isZero() ? ZERO : state.value.div(state.quantityKg);
      const issuedCost = issuedQuantity.mul(average);
      state.quantityKg = state.quantityKg.minus(issuedQuantity);
      state.value = state.value.minus(issuedCost);
      if (state.quantityKg.isZero()) state.value = ZERO;
      if (inPeriod && movement.kind === InventoryMovementKind.SALE) {
        salesCost.set(movement.chickenTypeId, (salesCost.get(movement.chickenTypeId) ?? ZERO).plus(issuedCost));
      }
      const isSpoilage = movement.kind === InventoryMovementKind.STOCK_ADJUSTMENT &&
        (movement.stockAdjustment?.reason === StockAdjustmentReason.SPOILAGE || movement.stockAdjustment?.reason === StockAdjustmentReason.MORTALITY);
      if (inPeriod && isSpoilage) spoilageLoss = spoilageLoss.plus(issuedCost);
      effects.set(movement.id, { quantityKg: quantity, valueDelta: issuedCost.negated(), issuedCost, kind: movement.kind, occurredAt: movement.occurredAt, spoilage: isSpoilage });
    }
    states.set(movement.chickenTypeId, state);
  }
  return { types, states, salesCost, spoilageLoss };
}

async function inventoryAt(tx: Prisma.TransactionClient, chickenTypeId: string, occurredAt: Date) {
  const replay = await inventoryStates(tx, occurredAt);
  return replay.states.get(chickenTypeId) ?? { quantityKg: ZERO, value: ZERO };
}

function averageCost(state: InventoryState) {
  return state.quantityKg.isZero() ? ZERO : rate(state.value.div(state.quantityKg));
}

async function accountBalance(db: DbClient, accountId: string, asOf: Date) {
  const movements = await db.moneyMovement.findMany({
    where: { occurredAt: { lte: asOf }, OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] },
  });
  return money(sum(movements.map((movement) => {
    const amount = D(movement.amount);
    if (movement.toAccountId === accountId) return amount;
    return amount.negated();
  })));
}

async function payableOutstanding(tx: Prisma.TransactionClient, payableId: string) {
  const payable = await tx.supplierPayable.findUnique({ where: { id: payableId }, include: { payments: true } });
  if (!payable || payable.status === PayableStatus.VOID) throw new AccountingError("Supplier payable is not available.", 404);
  const paid = sum(payable.payments.map((payment) => payment.amount));
  return { payable, paid, remaining: D(payable.originalAmount).minus(paid) };
}

async function creditOutstanding(tx: Prisma.TransactionClient, customerCreditId: string) {
  const credit = await tx.customerCredit.findUnique({ where: { id: customerCreditId }, include: { collections: true } });
  if (!credit || credit.status === CreditStatus.WRITTEN_OFF) throw new AccountingError("Customer credit is not available.", 404);
  const collected = sum(credit.collections.map((collection) => collection.amount));
  return { credit, collected, remaining: D(credit.originalAmount).minus(collected) };
}

export async function postReceipt(input: z.input<typeof receiptInput>) {
  input = receiptInput.parse(input);
  return runIdempotent("receipt", input.idempotencyKey, async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier || !supplier.isActive) throw new AccountingError("Supplier is not active.", 404);
    await requireActiveChickenTypes(tx, input.items.map((item) => item.chickenTypeId));
    const receiptChickenTypes = await tx.chickenType.findMany({ where: { id: { in: input.items.map((item) => item.chickenTypeId) } }, select: { id: true, code: true } });
    const wastageRateByType = new Map(receiptChickenTypes.map((type) => [type.id, wastageRateForChicken(type.code)]));
    for (const line of input.items) {
      const wastageKg = D(line.birdCount ?? 0).mul(wastageRateByType.get(line.chickenTypeId) ?? D("0.600"));
      if (wastageKg.greaterThan(line.quantityKg)) throw new AccountingError("Wastage cannot exceed total chicken weight.");
    }
    const total = sum(input.items.map((item) => exactLineAmount(item.quantityKg, item.unitCost)));
    const paidAmount = money(input.paidAmount ?? "0");
    if (paidAmount.greaterThan(total)) throw new AccountingError("Paid amount cannot exceed the receipt total.");
    if (paidAmount.greaterThan(ZERO)) await requireAccount(tx, input.paidFromAccountId!);
    const receipt = await tx.stockReceipt.create({
      data: { receiptNumber: input.receiptNumber, supplierId: input.supplierId, receivedAt: input.receivedAt, supplierInvoice: input.supplierInvoice, notes: input.notes },
    });
    for (const line of input.items) {
      const item = await tx.stockReceiptItem.create({
        data: { stockReceiptId: receipt.id, chickenTypeId: line.chickenTypeId, quantityKg: weight(line.quantityKg), birdCount: line.birdCount ?? 0, wastagePerBirdKg: weight(wastageRateByType.get(line.chickenTypeId) ?? D("0.600")), unitCost: rate(line.unitCost), suggestedSellRate: rate(line.suggestedSellRate ?? "0"), lineAmount: exactLineAmount(line.quantityKg, line.unitCost) },
      });
      await tx.inventoryMovement.create({
        data: { chickenTypeId: line.chickenTypeId, occurredAt: input.receivedAt, quantityKg: weight(line.quantityKg), unitCost: rate(line.unitCost), kind: InventoryMovementKind.RECEIPT, stockReceiptItemId: item.id },
      });
    }
    const payable = await tx.supplierPayable.create({ data: { stockReceiptId: receipt.id, supplierId: input.supplierId, payableDate: toDateOnly(input.receivedAt), dueDate: input.dueDate ? toDateOnly(input.dueDate) : null, originalAmount: money(total), status: paidAmount.equals(total) ? PayableStatus.PAID : paidAmount.greaterThan(ZERO) ? PayableStatus.PARTIALLY_PAID : PayableStatus.OPEN, notes: input.notes } });
    if (paidAmount.greaterThan(ZERO)) {
      const movement = await tx.moneyMovement.create({ data: { occurredAt: input.receivedAt, amount: paidAmount, type: MoneyMovementType.SUPPLIER_PAYMENT, fromAccountId: input.paidFromAccountId, reference: payable.id, notes: `Paid against receipt ${receipt.receiptNumber}` } });
      await tx.supplierPayment.create({ data: { payableId: payable.id, paidAt: input.receivedAt, amount: paidAmount, moneyMovementId: movement.id, notes: "Payment recorded with receipt" } });
    }
    return receipt;
  });
}

async function reverseReceipt(
  tx: Prisma.TransactionClient,
  itemId: string,
  reason: string,
) {
  const item = await tx.stockReceiptItem.findUnique({
    where: { id: itemId },
    include: {
      inventoryMovement: { include: { reversedBy: true } },
      stockReceipt: { include: { items: true, payable: { include: { payments: true } } } },
    },
  });
  if (!item) throw new AccountingError("Chicken entry was not found.", 404);
  if (item.stockReceipt.items.length !== 1) throw new AccountingError("This receipt contains multiple chicken entries and cannot be changed here.", 409);
  if (!item.inventoryMovement) throw new AccountingError("Chicken entry has no inventory movement.", 409);
  if (item.inventoryMovement.reversedBy || item.stockReceipt.payable?.status === PayableStatus.VOID) {
    throw new AccountingError("Chicken entry has already been changed or deleted.", 409);
  }
  if (item.stockReceipt.payable?.payments.length) {
    throw new AccountingError("This chicken entry has a supplier settlement and cannot be changed here.", 409);
  }

  const adjustment = await tx.stockAdjustment.create({
    data: {
      chickenTypeId: item.chickenTypeId,
      occurredAt: item.stockReceipt.receivedAt,
      quantityKg: weight(D(item.quantityKg).negated()),
      unitCost: rate(item.unitCost),
      reason: StockAdjustmentReason.CORRECTION,
      notes: reason,
    },
  });
  await tx.inventoryMovement.create({
    data: {
      chickenTypeId: item.chickenTypeId,
      occurredAt: item.stockReceipt.receivedAt,
      quantityKg: weight(D(item.quantityKg).negated()),
      unitCost: rate(item.unitCost),
      kind: InventoryMovementKind.STOCK_ADJUSTMENT,
      stockAdjustmentId: adjustment.id,
      reversalOfId: item.inventoryMovement.id,
    },
  });
  if (item.stockReceipt.payable) {
    await tx.supplierPayable.update({ where: { id: item.stockReceipt.payable.id }, data: { status: PayableStatus.VOID } });
  }
  return item;
}

export async function editReceipt(input: z.input<typeof receiptEditInput>) {
  input = receiptEditInput.parse(input);
  return runIdempotent("receipt-edit", input.idempotencyKey, async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier || !supplier.isActive) throw new AccountingError("Supplier is not active.", 404);
    await requireActiveChickenTypes(tx, [input.chickenTypeId]);
    const chickenType = await tx.chickenType.findUniqueOrThrow({ where: { id: input.chickenTypeId }, select: { code: true } });
    const wastagePerBirdKg = wastageRateForChicken(chickenType.code);
    if (D(input.birdCount).mul(wastagePerBirdKg).greaterThan(input.quantityKg)) {
      throw new AccountingError("Wastage cannot exceed total chicken weight.");
    }

    const original = await reverseReceipt(tx, input.itemId, `Reversed for edit of chicken entry ${input.itemId}`);
    const receiptNumber = `EDIT-${crypto.randomUUID()}`.slice(0, 50);
    const receipt = await tx.stockReceipt.create({
      data: { receiptNumber, supplierId: input.supplierId, receivedAt: input.receivedAt, notes: `Replacement for receipt ${original.stockReceipt.receiptNumber}` },
    });
    const lineAmount = exactLineAmount(input.quantityKg, input.unitCost);
    const item = await tx.stockReceiptItem.create({
      data: {
        stockReceiptId: receipt.id,
        chickenTypeId: input.chickenTypeId,
        quantityKg: weight(input.quantityKg),
        birdCount: input.birdCount,
        wastagePerBirdKg: weight(wastagePerBirdKg),
        unitCost: rate(input.unitCost),
        suggestedSellRate: rate(input.suggestedSellRate),
        lineAmount,
      },
    });
    await tx.inventoryMovement.create({
      data: { chickenTypeId: input.chickenTypeId, occurredAt: input.receivedAt, quantityKg: weight(input.quantityKg), unitCost: rate(input.unitCost), kind: InventoryMovementKind.RECEIPT, stockReceiptItemId: item.id },
    });
    await tx.supplierPayable.create({
      data: { stockReceiptId: receipt.id, supplierId: input.supplierId, payableDate: toDateOnly(input.receivedAt), originalAmount: money(lineAmount), status: PayableStatus.OPEN, notes: `Replacement for receipt ${original.stockReceipt.receiptNumber}` },
    });
    await inventoryStates(tx, new Date("9999-12-31T23:59:59.999Z"));
    return item;
  });
}

export async function deleteReceipt(input: z.input<typeof receiptDeleteInput>) {
  input = receiptDeleteInput.parse(input);
  return runIdempotent("receipt-delete", input.idempotencyKey, async (tx) => {
    const original = await reverseReceipt(tx, input.itemId, `Deleted chicken entry ${input.itemId}`);
    await inventoryStates(tx, new Date("9999-12-31T23:59:59.999Z"));
    return { id: original.id };
  });
}

export async function postDailySale(input: DailySaleInput) {
  input = dailySaleInput.parse(input);
  return runIdempotent("daily-sale", input.idempotencyKey, async (tx) => {
    await requireActiveChickenTypes(tx, input.items.map((item) => item.chickenTypeId));
    const cashAmount = money(input.cashAmount);
    const bankAmount = money(input.bankAmount);
    const creditTotal = sum(input.credits.map((credit) => credit.amount));
    const salesTotal = sum(input.items.map((item) => exactLineAmount(item.quantityKg, item.unitSellingPrice)));
    if (!cashAmount.plus(bankAmount).plus(creditTotal).equals(salesTotal)) throw new AccountingError("Cash, bank, and credit allocations must equal total sales.");
    if (cashAmount.greaterThan(ZERO)) await requireAccount(tx, input.cashAccountId!, AccountType.CASH);
    if (bankAmount.greaterThan(ZERO)) await requireAccount(tx, input.bankAccountId!, AccountType.BANK);
    await requireActiveCustomers(tx, input.credits.map((credit) => credit.customerId));
    const sale = await tx.dailySale.create({ data: { businessDate: toDateOnly(input.businessDate), notes: input.notes } });
    for (const line of input.items) {
      const state = await inventoryAt(tx, line.chickenTypeId, input.occurredAt);
      const sold = weight(line.quantityKg);
      if (state.quantityKg.lessThan(sold)) throw new AccountingError("Sale would make inventory negative.", 409);
      const item = await tx.dailySaleItem.create({ data: { dailySaleId: sale.id, chickenTypeId: line.chickenTypeId, quantityKg: sold, unitSellingPrice: rate(line.unitSellingPrice), lineAmount: exactLineAmount(line.quantityKg, line.unitSellingPrice) } });
      await tx.inventoryMovement.create({ data: { chickenTypeId: line.chickenTypeId, occurredAt: input.occurredAt, quantityKg: sold.negated(), unitCost: averageCost(state), kind: InventoryMovementKind.SALE, dailySaleItemId: item.id } });
    }
    if (cashAmount.greaterThan(ZERO)) await tx.moneyMovement.create({ data: { occurredAt: input.occurredAt, amount: cashAmount, type: MoneyMovementType.SALE_RECEIPT, toAccountId: input.cashAccountId, dailySaleId: sale.id, reference: `Daily sale ${sale.businessDate.toISOString().slice(0, 10)}` } });
    if (bankAmount.greaterThan(ZERO)) await tx.moneyMovement.create({ data: { occurredAt: input.occurredAt, amount: bankAmount, type: MoneyMovementType.SALE_RECEIPT, toAccountId: input.bankAccountId, dailySaleId: sale.id, reference: `Daily sale ${sale.businessDate.toISOString().slice(0, 10)}` } });
    for (const credit of input.credits) await tx.customerCredit.create({ data: { dailySaleId: sale.id, customerId: credit.customerId, creditDate: toDateOnly(input.businessDate), originalAmount: money(credit.amount), notes: credit.notes } });
    return sale;
  });
}

export async function postStockCount(input: StockCountInput) {
  input = stockCountInput.parse(input);
  return runIdempotent("stock-count", input.idempotencyKey, async (tx) => {
    await requireActiveChickenTypes(tx, input.lines.map((line) => line.chickenTypeId));
    const count = await tx.stockCount.create({ data: { countedAt: input.countedAt, notes: input.notes } });
    for (const line of input.lines) {
      const state = await inventoryAt(tx, line.chickenTypeId, input.countedAt);
      const actual = weight(line.countedQuantity);
      const difference = actual.minus(state.quantityKg);
      const countLine = await tx.stockCountLine.create({ data: { stockCountId: count.id, chickenTypeId: line.chickenTypeId, expectedQuantity: weight(state.quantityKg), countedQuantity: actual } });
      if (!difference.isZero()) {
        const resolvedCost = line.unitCost ? rate(line.unitCost) : averageCost(state);
        if (difference.greaterThan(ZERO) && resolvedCost.isZero()) throw new AccountingError("A positive stock variance requires unit cost when no average cost exists.");
        const adjustment = await tx.stockAdjustment.create({ data: { stockCountLineId: countLine.id, chickenTypeId: line.chickenTypeId, occurredAt: input.countedAt, quantityKg: weight(difference), unitCost: resolvedCost, reason: StockAdjustmentReason.COUNT_VARIANCE, notes: input.notes } });
        await tx.inventoryMovement.create({ data: { chickenTypeId: line.chickenTypeId, occurredAt: input.countedAt, quantityKg: weight(difference), unitCost: resolvedCost, kind: InventoryMovementKind.STOCK_ADJUSTMENT, stockAdjustmentId: adjustment.id } });
      }
    }
    return count;
  });
}

export async function postExpense(input: ExpenseInput) {
  input = expenseInput.parse(input);
  return runIdempotent("expense", input.idempotencyKey, async (tx) => {
    await requireAccount(tx, input.accountId);
    const amount = money(input.amount);
    assertPositive(amount, "Expense amount");
    const movement = await tx.moneyMovement.create({ data: { occurredAt: input.paidAt, amount, type: MoneyMovementType.EXPENSE_PAYMENT, fromAccountId: input.accountId, reference: input.category, notes: input.description } });
    return tx.expense.create({ data: { expenseDate: toDateOnly(input.expenseDate), category: input.category, description: input.description, amount, moneyMovementId: movement.id } });
  });
}

export async function settleSupplierPayable(input: SupplierPaymentInput) {
  input = supplierPaymentInput.parse(input);
  return runIdempotent("supplier-payment", input.idempotencyKey, async (tx) => {
    await requireAccount(tx, input.accountId);
    const { payable, paid, remaining } = await payableOutstanding(tx, input.payableId);
    const amount = money(input.amount);
    if (amount.greaterThan(remaining)) throw new AccountingError("Supplier payment exceeds the remaining payable.", 409);
    const movement = await tx.moneyMovement.create({ data: { occurredAt: input.paidAt, amount, type: MoneyMovementType.SUPPLIER_PAYMENT, fromAccountId: input.accountId, reference: payable.id, notes: input.notes } });
    const account = await tx.account.findUniqueOrThrow({ where: { id: input.accountId } });
    const payment = await tx.supplierPayment.create({ data: { payableId: payable.id, paidAt: input.paidAt, amount, method: account.type === AccountType.BANK ? "UPI" : "CASH", moneyMovementId: movement.id, notes: input.notes } });
    const newPaid = paid.plus(amount);
    await tx.supplierPayable.update({ where: { id: payable.id }, data: { status: newPaid.equals(payable.originalAmount) ? PayableStatus.PAID : PayableStatus.PARTIALLY_PAID } });
    return payment;
  });
}

export async function postSupplierSettlement(input: SupplierSettlementInput) {
  input = supplierSettlementInput.parse(input);
  return runIdempotent("supplier-settlement", input.idempotencyKey, async (tx) => {
    const { payable, paid, remaining } = await payableOutstanding(tx, input.payableId);
    const paymentAmount = money(input.paymentAmount);
    if (paymentAmount.greaterThan(remaining)) throw new AccountingError("Payment exceeds the remaining amount.", 409);

    const account = await requireOrCreatePaymentAccount(tx, input.accountId, input.paymentMethod);
    const movement = await tx.moneyMovement.create({
      data: { occurredAt: input.paidAt, amount: paymentAmount, type: MoneyMovementType.SUPPLIER_PAYMENT, fromAccountId: account.id, reference: payable.id, notes: input.notes },
    });
    const payment = await tx.supplierPayment.create({
      data: { payableId: payable.id, paidAt: input.paidAt, amount: paymentAmount, method: input.paymentMethod, moneyMovementId: movement.id, notes: input.notes },
    });

    const totalSettled = paid.plus(paymentAmount);
    await tx.supplierPayable.update({
      where: { id: payable.id },
      data: { status: totalSettled.equals(payable.originalAmount) ? PayableStatus.PAID : PayableStatus.PARTIALLY_PAID },
    });
    return payment;
  });
}

export async function createSupplier(input: SupplierInput) {
  input = supplierInput.parse(input);

  try {
    const result = await runIdempotent("supplier-create", input.idempotencyKey, async (tx) => {
      const existing = await tx.supplier.findFirst({
        where: { name: { equals: input.name, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) throw new AccountingError("A supplier with this name already exists.", 409);

      return tx.supplier.create({
        data: { name: input.name, phone: input.phone, notes: input.notes },
      });
    });

    const supplier = await prisma.supplier.findUnique({
      where: { id: result.id },
      select: { id: true, name: true, phone: true, isActive: true },
    });
    if (!supplier) throw new AccountingError("Supplier was not found after creation.", 500);
    return { ...supplier, duplicate: result.duplicate };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AccountingError("A supplier with this name already exists.", 409);
    }
    throw error;
  }
}

export async function createChickenType(input: ChickenTypeInput) {
  input = chickenTypeInput.parse(input);

  try {
    const result = await runIdempotent("chicken-type-create", input.idempotencyKey, async (tx) => {
      const existing = await tx.chickenType.findFirst({
        where: { OR: [{ code: { equals: input.code, mode: "insensitive" } }, { name: { equals: input.name, mode: "insensitive" } }] },
        select: { id: true },
      });
      if (existing) throw new AccountingError("A chicken type with this name or code already exists.", 409);

      return tx.chickenType.create({ data: { code: input.code.toUpperCase(), name: input.name } });
    });

    const chickenType = await prisma.chickenType.findUnique({
      where: { id: result.id },
      select: { id: true, code: true, name: true, isActive: true },
    });
    if (!chickenType) throw new AccountingError("Chicken type was not found after creation.", 500);
    return { ...chickenType, duplicate: result.duplicate };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AccountingError("A chicken type with this name or code already exists.", 409);
    }
    throw error;
  }
}

export async function createCreditCustomer(input: CreditCustomerInput) {
  input = creditCustomerInput.parse(input);
  return runIdempotent("credit-customer", input.idempotencyKey, async (tx) => {
    const existing = await tx.customer.findFirst({ where: { OR: [{ name: { equals: input.name, mode: "insensitive" } }, { phone: input.phone }] } });
    if (existing) throw new AccountingError("A customer with this name or number already exists.", 409);
    return tx.customer.create({ data: { name: input.name, phone: input.phone, address: input.address } });
  });
}

export async function postCustomerCreditSale(input: CustomerCreditSaleInput) {
  input = customerCreditSaleInput.parse(input);
  return runIdempotent("customer-credit-sale", input.idempotencyKey, async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
    if (!customer || !customer.isActive) throw new AccountingError("Customer is not active.", 404);
    await requireActiveChickenTypes(tx, [input.chickenTypeId]);

    const quantityKg = weight(input.quantityKg);
    const totalAmount = exactLineAmount(quantityKg, input.unitPrice);
    const paidAmount = money(input.paidAmount);
    if (paidAmount.greaterThan(totalAmount)) throw new AccountingError("Paid amount cannot exceed the sale total.", 409);
    const paymentMethod = input.paymentMethod;
    if (paymentMethod === "CREDIT" && paidAmount.greaterThan(ZERO)) throw new AccountingError("A credit sale cannot include a payment.", 409);
    if (paymentMethod !== "CREDIT" && paidAmount.greaterThan(ZERO)) await requirePaymentAccount(tx, input.accountId!, paymentMethod);

    const state = await inventoryAt(tx, input.chickenTypeId, input.soldAt);
    if (state.quantityKg.lessThan(quantityKg)) throw new AccountingError("Sale would make inventory negative.", 409);

    const sale = await tx.creditSale.create({
      data: {
        customerId: input.customerId,
        soldAt: input.soldAt,
        totalAmount,
        status: paidAmount.equals(totalAmount) ? CreditStatus.COLLECTED : paidAmount.greaterThan(ZERO) ? CreditStatus.PARTIALLY_COLLECTED : CreditStatus.OPEN,
      },
    });
    const item = await tx.creditSaleItem.create({
      data: { creditSaleId: sale.id, chickenTypeId: input.chickenTypeId, quantityKg, unitPrice: rate(input.unitPrice), lineAmount: totalAmount },
    });
    await tx.inventoryMovement.create({
      data: { chickenTypeId: input.chickenTypeId, occurredAt: input.soldAt, quantityKg: quantityKg.negated(), unitCost: averageCost(state), kind: InventoryMovementKind.SALE, creditSaleItemId: item.id },
    });

    if (paidAmount.greaterThan(ZERO) && paymentMethod !== "CREDIT") {
      const movement = await tx.moneyMovement.create({
        data: { occurredAt: input.soldAt, amount: paidAmount, type: MoneyMovementType.SALE_RECEIPT, toAccountId: input.accountId!, reference: sale.id, notes: `Payment from ${customer.name}` },
      });
      await tx.creditSalePayment.create({
        data: { creditSaleId: sale.id, paidAt: input.soldAt, amount: paidAmount, method: paymentMethod, moneyMovementId: movement.id },
      });
    }
    return sale;
  });
}

export async function postCustomerCreditPayment(input: CustomerCreditPaymentInput) {
  input = customerCreditPaymentInput.parse(input);
  return runIdempotent("customer-credit-payment", input.idempotencyKey, async (tx) => {
    const sale = await tx.creditSale.findUnique({ where: { id: input.creditSaleId }, include: { payments: true, customer: true } });
    if (!sale) throw new AccountingError("Customer sale was not found.", 404);
    if (sale.status === CreditStatus.COLLECTED) throw new AccountingError("This sale is already fully paid.", 409);
    const account = await requireOrCreatePaymentAccount(tx, input.accountId, input.paymentMethod);

    const paid = money(sum(sale.payments.map((payment) => payment.amount)));
    const remaining = money(D(sale.totalAmount).minus(paid));
    const amount = money(input.amount);
    if (amount.greaterThan(remaining)) throw new AccountingError("Payment exceeds the remaining customer balance.", 409);

    const movement = await tx.moneyMovement.create({
      data: { occurredAt: input.paidAt, amount, type: MoneyMovementType.CUSTOMER_COLLECTION, toAccountId: account.id, reference: sale.id, notes: `Payment from ${sale.customer.name}` },
    });
    const payment = await tx.creditSalePayment.create({
      data: { creditSaleId: sale.id, paidAt: input.paidAt, amount, method: input.paymentMethod, moneyMovementId: movement.id },
    });
    await tx.creditSale.update({
      where: { id: sale.id },
      data: { status: paid.plus(amount).equals(sale.totalAmount) ? CreditStatus.COLLECTED : CreditStatus.PARTIALLY_COLLECTED },
    });
    return payment;
  });
}

export async function getCustomerCreditPageData() {
  const [customers, chickenTypes, accounts, sales] = await Promise.all([
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, address: true } }),
    prisma.chickenType.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.account.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, type: true } }),
    prisma.creditSale.findMany({
      orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
      include: { customer: { select: { name: true } }, items: { include: { chickenType: { select: { name: true } } } }, payments: { orderBy: { paidAt: "asc" } } },
    }),
  ]);

  return {
    customers,
    chickenTypes,
    accounts,
    sales: sales.flatMap((sale) => sale.items.map((item) => {
      const paidAmount = money(sum(sale.payments.map((payment) => payment.amount)));
      const paymentMethods = [...new Set(sale.payments.map((payment) => payment.method))];
      return {
        id: sale.id,
        customerId: sale.customerId,
        customer: sale.customer.name,
        soldAt: sale.soldAt,
        chickenType: item.chickenType.name,
        quantityKg: weight(item.quantityKg),
        unitPrice: rate(item.unitPrice),
        totalAmount: money(sale.totalAmount),
        paidAmount,
        remainingAmount: money(D(sale.totalAmount).minus(paidAmount)),
        paymentMethod: paymentMethods.length ? paymentMethods.join(" + ") : null,
        status: sale.status,
      };
    })),
  };
}

export async function collectCustomerCredit(input: CustomerCollectionInput) {
  input = customerCollectionInput.parse(input);
  return runIdempotent("customer-collection", input.idempotencyKey, async (tx) => {
    await requireAccount(tx, input.accountId);
    const { credit, collected, remaining } = await creditOutstanding(tx, input.customerCreditId);
    const amount = money(input.amount);
    if (amount.greaterThan(remaining)) throw new AccountingError("Customer collection exceeds the remaining credit.", 409);
    const movement = await tx.moneyMovement.create({ data: { occurredAt: input.collectedAt, amount, type: MoneyMovementType.CUSTOMER_COLLECTION, toAccountId: input.accountId, reference: credit.id, notes: input.notes } });
    const collection = await tx.customerCollection.create({ data: { customerCreditId: credit.id, collectedAt: input.collectedAt, amount, moneyMovementId: movement.id, notes: input.notes } });
    const newCollected = collected.plus(amount);
    await tx.customerCredit.update({ where: { id: credit.id }, data: { status: newCollected.equals(credit.originalAmount) ? CreditStatus.COLLECTED : CreditStatus.PARTIALLY_COLLECTED } });
    return collection;
  });
}

export async function postOwnerWithdrawal(input: OwnerWithdrawalInput) {
  input = ownerWithdrawalInput.parse(input);
  return runIdempotent("owner-withdrawal", input.idempotencyKey, async (tx) => {
    await requireAccount(tx, input.accountId);
    const amount = money(input.amount);
    const movement = await tx.moneyMovement.create({ data: { occurredAt: input.withdrawnAt, amount, type: MoneyMovementType.OWNER_WITHDRAWAL, fromAccountId: input.accountId, notes: input.purpose } });
    return tx.ownerWithdrawal.create({ data: { withdrawnAt: input.withdrawnAt, amount, purpose: input.purpose, moneyMovementId: movement.id } });
  });
}

export async function postTransfer(input: TransferInput) {
  input = transferInput.parse(input);
  return runIdempotent("transfer", input.idempotencyKey, async (tx) => {
    await Promise.all([requireAccount(tx, input.fromAccountId), requireAccount(tx, input.toAccountId)]);
    return tx.moneyMovement.create({ data: { occurredAt: input.occurredAt, amount: money(input.amount), type: MoneyMovementType.ACCOUNT_TRANSFER, fromAccountId: input.fromAccountId, toAccountId: input.toAccountId, reference: input.reference, notes: input.notes } });
  });
}

export async function postInventoryCorrection(input: InventoryCorrectionInput) {
  input = inventoryCorrectionInput.parse(input);
  return runIdempotent("inventory-correction", input.idempotencyKey, async (tx) => {
    await requireActiveChickenTypes(tx, [input.chickenTypeId]);
    const quantity = weight(input.quantityKg);
    let reversalOfId: string | undefined;
    if (input.reversalOfId) {
      const original = await tx.inventoryMovement.findUnique({ where: { id: input.reversalOfId }, include: { reversedBy: true } });
      if (!original || original.chickenTypeId !== input.chickenTypeId) throw new AccountingError("Original inventory movement was not found.", 404);
      if (original.reversedBy) throw new AccountingError("Inventory movement is already reversed.", 409);
      if (!quantity.equals(D(original.quantityKg).negated()) || !rate(input.unitCost).equals(original.unitCost)) throw new AccountingError("A reversal must use the opposite original quantity and the same unit cost.");
      reversalOfId = original.id;
    }
    if (quantity.lessThan(ZERO)) {
      const state = await inventoryAt(tx, input.chickenTypeId, input.occurredAt);
      if (state.quantityKg.lessThan(quantity.abs())) throw new AccountingError("Correction would make inventory negative.", 409);
    }
    const adjustment = await tx.stockAdjustment.create({ data: { chickenTypeId: input.chickenTypeId, occurredAt: input.occurredAt, quantityKg: quantity, unitCost: rate(input.unitCost), reason: StockAdjustmentReason.CORRECTION, notes: input.notes } });
    return tx.inventoryMovement.create({ data: { chickenTypeId: input.chickenTypeId, occurredAt: input.occurredAt, quantityKg: quantity, unitCost: rate(input.unitCost), kind: InventoryMovementKind.STOCK_ADJUSTMENT, stockAdjustmentId: adjustment.id, reversalOfId } });
  });
}

export async function postWastage(input: WastageInput) {
  input = wastageInput.parse(input);
  return runIdempotent("wastage", input.idempotencyKey, async (tx) => {
    await requireActiveChickenTypes(tx, [input.chickenTypeId]);
    const state = await inventoryAt(tx, input.chickenTypeId, input.occurredAt);
    const quantity = weight(input.quantityKg);
    if (state.quantityKg.lessThan(quantity)) throw new AccountingError("Wastage would make inventory negative.", 409);
    const adjustment = await tx.stockAdjustment.create({ data: { chickenTypeId: input.chickenTypeId, occurredAt: input.occurredAt, quantityKg: quantity.negated(), unitCost: averageCost(state), reason: input.reason, notes: input.notes } });
    return tx.inventoryMovement.create({ data: { chickenTypeId: input.chickenTypeId, occurredAt: input.occurredAt, quantityKg: quantity.negated(), unitCost: averageCost(state), kind: InventoryMovementKind.STOCK_ADJUSTMENT, stockAdjustmentId: adjustment.id } });
  });
}

export async function postMoneyCorrection(input: MoneyCorrectionInput) {
  input = moneyCorrectionInput.parse(input);
  return runIdempotent("money-correction", input.idempotencyKey, async (tx) => {
    await requireAccount(tx, input.accountId);
    const amount = money(input.amount);
    const fromAccountId = input.direction === "OUTFLOW" ? input.accountId : undefined;
    const toAccountId = input.direction === "INFLOW" ? input.accountId : undefined;
    if (input.reversalOfId) {
      const original = await tx.moneyMovement.findUnique({ where: { id: input.reversalOfId }, include: { reversedBy: true } });
      if (!original) throw new AccountingError("Original money movement was not found.", 404);
      if (original.reversedBy) throw new AccountingError("Money movement is already reversed.", 409);
      if (!amount.equals(original.amount) || original.fromAccountId !== (toAccountId ?? null) || original.toAccountId !== (fromAccountId ?? null)) {
        throw new AccountingError("A money reversal must use the original amount and opposite direction.");
      }
    }
    return tx.moneyMovement.create({ data: { occurredAt: input.occurredAt, amount, type: MoneyMovementType.MONEY_ADJUSTMENT, fromAccountId, toAccountId, reversalOfId: input.reversalOfId, notes: input.notes } });
  });
}

export async function reconcileAccount(input: ReconciliationInput) {
  input = reconciliationInput.parse(input);
  return runIdempotent("account-reconciliation", input.idempotencyKey, async (tx) => {
    await requireAccount(tx, input.accountId);
    const expectedBalance = await accountBalance(tx, input.accountId, input.reconciledAt);
    const actualBalance = money(input.actualBalance);
    return tx.accountReconciliation.create({ data: { accountId: input.accountId, reconciledAt: input.reconciledAt, actualBalance, expectedBalance, difference: money(actualBalance.minus(expectedBalance)), notes: input.notes } });
  });
}

export async function getInventoryReport(asOf = new Date()) {
  const replay = await inventoryStates(prisma, asOf);
  return replay.types.map((type) => {
    const state = replay.states.get(type.id) ?? { quantityKg: ZERO, value: ZERO };
    return { chickenTypeId: type.id, code: type.code, name: type.name, quantityKg: weight(state.quantityKg), averageUnitCost: averageCost(state), inventoryValue: money(state.value) };
  });
}

export async function getProfitReport(from: Date, to: Date) {
  const [replay, sales, creditSales, expenses] = await Promise.all([
    inventoryStates(prisma, to, from),
    prisma.dailySaleItem.findMany({ where: { dailySale: { businessDate: { gte: toDateOnly(from), lte: toDateOnly(to) } } }, select: { lineAmount: true } }),
    prisma.creditSale.findMany({ where: { soldAt: { gte: from, lte: to } }, select: { totalAmount: true } }),
    prisma.expense.findMany({ where: { expenseDate: { gte: toDateOnly(from), lte: toDateOnly(to) } }, select: { amount: true } }),
  ]);
  const revenue = money(sum([...sales.map((sale) => sale.lineAmount), ...creditSales.map((sale) => sale.totalAmount)]));
  const costOfGoodsSold = money(sum(replay.salesCost.values()));
  const spoilageLoss = money(replay.spoilageLoss);
  const operatingExpenses = money(sum(expenses.map((expense) => expense.amount)));
  return { from, to, revenue, costOfGoodsSold, spoilageLoss, operatingExpenses, estimatedOperatingProfit: money(revenue.minus(costOfGoodsSold).minus(spoilageLoss).minus(operatingExpenses)) };
}

export async function getCashLedger(accountId: string, from: Date, to: Date) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) throw new AccountingError("Account was not found.", 404);
  const [openingBalance, movements] = await Promise.all([
    (async () => {
      const before = new Date(from.getTime() - 1);
      return accountBalance(prisma, accountId, before);
    })(),
    prisma.moneyMovement.findMany({ where: { occurredAt: { gte: from, lte: to }, OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] }, orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] }),
  ]);
  const entries = movements.map((movement) => ({ ...movement, signedAmount: money(movement.toAccountId === accountId ? movement.amount : D(movement.amount).negated()) }));
  const expectedClosingBalance = money(openingBalance.plus(sum(entries.map((entry) => entry.signedAmount))));
  const collectionTypes: MoneyMovementType[] = [MoneyMovementType.SALE_RECEIPT, MoneyMovementType.CUSTOMER_COLLECTION];
  const collections = money(sum(entries.filter((entry) => entry.signedAmount.greaterThan(ZERO) && collectionTypes.includes(entry.type)).map((entry) => entry.signedAmount)));
  const payments = money(sum(entries.filter((entry) => entry.signedAmount.lessThan(ZERO)).map((entry) => entry.signedAmount.abs())));
  return { account: { id: account.id, name: account.name, type: account.type }, from, to, openingBalance, actualCollections: collections, payments, entries, expectedClosingBalance };
}

export async function getMonthlyReport(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const [profit, accounts, inventory] = await Promise.all([getProfitReport(from, to), prisma.account.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }), getInventoryReport(to)]);
  const accountBalances = await Promise.all(accounts.map(async (account) => ({ accountId: account.id, name: account.name, type: account.type, expectedBalance: await accountBalance(prisma, account.id, to) })));
  return { year, month, from, to, profit, accountBalances, closingInventory: inventory };
}

export async function getDailyEntryContext(date: Date) {
  const dayEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  const [chickenTypes, suppliers, customers, accounts, closingInventory] = await Promise.all([
    prisma.chickenType.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.customer.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.account.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, type: true } }),
    getInventoryReport(dayEnd),
  ]);
  const expectedBalances = await Promise.all(accounts.map(async (account) => ({ accountId: account.id, expectedBalance: await accountBalance(prisma, account.id, dayEnd) })));
  return { date: toDateOnly(date), chickenTypes: chickenTypes.map((type) => { const wastagePerBirdKg = wastageRateForChicken(type.code).toFixed(3); return { ...type, name: `${type.name} — ${wastagePerBirdKg} kg waste/bird`, wastagePerBirdKg }; }), suppliers, customers, accounts, closingInventory, expectedBalances };
}

export async function getRecentChickenReceipts(limit = 25) {
  const receipts = await prisma.stockReceipt.findMany({
    where: { payable: { is: { status: { not: PayableStatus.VOID } } } },
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: { supplier: { select: { name: true } }, items: { include: { chickenType: { select: { name: true } } } } },
  });
  return receipts.flatMap((receipt) => receipt.items.map((item) => {
    const estimate = calculateReceiptEstimate({
      quantityKg: item.quantityKg,
      birdCount: item.birdCount,
      wastagePerBirdKg: item.wastagePerBirdKg,
      purchaseRate: item.unitCost,
      sellingRate: item.suggestedSellRate,
      storedTotalAmount: item.lineAmount,
    });
    const quantityKg = estimate.quantityKg;
    const birds = D(item.birdCount);
    const averageKgPerBird = item.birdCount > 0 ? weight(quantityKg.div(birds)) : ZERO;
    const wastagePerBirdKg = weight(item.wastagePerBirdKg);
    return { id: item.id, receivedAt: receipt.receivedAt, supplierId: receipt.supplierId, supplier: receipt.supplier.name, chickenTypeId: item.chickenTypeId, chickenType: item.chickenType.name, birdCount: item.birdCount, quantityKg, purchaseRate: estimate.purchaseRate, totalAmount: estimate.totalAmount, averageKgPerBird, wastagePerBirdKg, wastageKg: estimate.wastageKg, meatKg: estimate.meatKg, sellingRate: estimate.sellingRate, salesAmount: estimate.salesAmount, profit: estimate.profit };
  }));
}

export async function postManualPassbookEntry(input: ManualPassbookEntryInput) {
  input = manualPassbookEntryInput.parse(input);
  return runIdempotent("manual-passbook-entry", input.idempotencyKey, async (tx) => {
    const amount = money(input.amount);
    let moneyMovementId: string | undefined;

    if (input.paymentType !== "CREDIT") {
      const isExpense = input.paymentType === "EXPENSE";
      const accountType = input.paymentType === "UPI" ? AccountType.BANK : AccountType.CASH;
      const account = await tx.account.findFirst({ where: { type: accountType, isActive: true }, orderBy: { createdAt: "asc" } });
      if (!account) throw new AccountingError(`${accountType === AccountType.CASH ? "Cash" : "Bank"} account was not found.`, 404);
      const movement = await tx.moneyMovement.create({
        data: {
          occurredAt: input.entryDate,
          amount,
          type: isExpense ? MoneyMovementType.EXPENSE_PAYMENT : MoneyMovementType.MANUAL_RECEIPT,
          fromAccountId: isExpense ? account.id : undefined,
          toAccountId: isExpense ? undefined : account.id,
          reference: isExpense ? "Business expense" : "Passbook entry",
          notes: input.description,
        },
      });
      moneyMovementId = movement.id;
    }

    const entry = await tx.manualPassbookEntry.create({
      data: {
        entryDate: input.entryDate,
        description: input.description,
        amount,
        paymentType: input.paymentType,
        moneyMovementId,
      },
    });
    if (input.paymentType === "EXPENSE" && moneyMovementId) {
      await tx.expense.create({
        data: {
          expenseDate: toDateOnly(input.entryDate),
          category: "Business expense",
          description: input.description,
          amount,
          moneyMovementId,
        },
      });
    }
    return entry;
  });
}

type PassbookPeriod = "ALL" | "DAY" | "WEEK" | "MONTH";
type PassbookSort = "RECENT" | "OLDEST" | "HIGHEST";

export async function getPurchasePassbook(input: { period?: string | null; sort?: string | null } = {}) {
  const period: PassbookPeriod = ["DAY", "WEEK", "MONTH"].includes(input.period ?? "") ? input.period as PassbookPeriod : "ALL";
  const sort: PassbookSort = ["OLDEST", "HIGHEST"].includes(input.sort ?? "") ? input.sort as PassbookSort : "RECENT";
  const [receipts, manualEntries, creditSales] = await Promise.all([
    prisma.stockReceipt.findMany({
      where: { payable: { is: { status: { not: PayableStatus.VOID } } } },
      include: {
        supplier: { select: { name: true } },
        items: {
          include: { chickenType: { select: { name: true } } },
        },
        payable: { include: { payments: { include: { moneyMovement: { select: { createdAt: true } } } } } },
      },
    }),
    prisma.manualPassbookEntry.findMany(),
    prisma.creditSale.findMany({
      include: {
        customer: { select: { name: true } },
        items: { include: { chickenType: { select: { name: true } } } },
        payments: true,
      },
    }),
  ]);

  const supplierEntries = receipts.flatMap((receipt) => [
    ...receipt.items.map((item) => ({
      id: `purchase-${item.id}`,
      occurredAt: receipt.receivedAt,
      recordedAt: receipt.createdAt,
      supplier: receipt.supplier.name,
      customer: null,
      chickenType: item.chickenType.name,
      description: item.chickenType.name,
      entryType: "PURCHASE" as const,
      paymentMethod: null,
      manualPaymentType: null,
      manualAmount: ZERO,
      customerCreditAmount: ZERO,
      customerPaymentAmount: ZERO,
      debitAmount: money(item.lineAmount),
      creditAmount: ZERO,
    })),
    ...(receipt.payable?.payments ?? []).map((payment) => ({
      id: `payment-${payment.id}`,
      occurredAt: payment.paidAt,
      recordedAt: payment.moneyMovement.createdAt,
      supplier: receipt.supplier.name,
      customer: null,
      chickenType: null,
      description: `Payment to ${receipt.supplier.name}`,
      entryType: "PAYMENT" as const,
      paymentMethod: payment.method,
      manualPaymentType: null,
      manualAmount: ZERO,
      customerCreditAmount: ZERO,
      customerPaymentAmount: ZERO,
      debitAmount: ZERO,
      creditAmount: money(payment.amount),
    })),
  ]);

  const manualPassbookEntries = manualEntries.map((entry) => ({
    id: `manual-${entry.id}`,
    occurredAt: entry.entryDate,
    recordedAt: entry.createdAt,
    supplier: null,
    customer: null,
    chickenType: null,
    description: entry.description,
    entryType: "MANUAL" as const,
    paymentMethod: null,
    manualPaymentType: entry.paymentType,
    manualAmount: money(entry.amount),
    customerCreditAmount: ZERO,
    customerPaymentAmount: ZERO,
    debitAmount: ZERO,
    creditAmount: ZERO,
  }));

  const customerEntries = creditSales.flatMap((sale) => [
    {
      id: `customer-credit-${sale.id}`,
      occurredAt: sale.soldAt,
      recordedAt: sale.createdAt,
      supplier: null,
      customer: sale.customer.name,
      chickenType: sale.items.map((item) => item.chickenType.name).join(", ") || null,
      description: `Credit sale to ${sale.customer.name}`,
      entryType: "CUSTOMER_CREDIT" as const,
      paymentMethod: null,
      manualPaymentType: null,
      manualAmount: ZERO,
      customerCreditAmount: money(sale.totalAmount),
      customerPaymentAmount: ZERO,
      debitAmount: ZERO,
      creditAmount: ZERO,
    },
    ...sale.payments.map((payment) => ({
      id: `customer-payment-${payment.id}`,
      occurredAt: payment.paidAt,
      recordedAt: payment.createdAt,
      supplier: null,
      customer: sale.customer.name,
      chickenType: null,
      description: `Received from ${sale.customer.name}`,
      entryType: "CUSTOMER_PAYMENT" as const,
      paymentMethod: payment.method,
      manualPaymentType: null,
      manualAmount: ZERO,
      customerCreditAmount: ZERO,
      customerPaymentAmount: money(payment.amount),
      debitAmount: ZERO,
      creditAmount: ZERO,
    })),
  ]);

  const entryOrder = { PURCHASE: 0, CUSTOMER_CREDIT: 1, PAYMENT: 2, CUSTOMER_PAYMENT: 3, MANUAL: 4 } as const;
  const entries = [...supplierEntries, ...customerEntries, ...manualPassbookEntries].sort((left, right) =>
    left.occurredAt.getTime() - right.occurredAt.getTime()
    || entryOrder[left.entryType] - entryOrder[right.entryType]
    || left.id.localeCompare(right.id),
  );

  let runningBalance = ZERO;
  const entriesWithBalance = entries.map((entry, sequence) => {
    if (entry.entryType === "PURCHASE") runningBalance = money(runningBalance.minus(entry.debitAmount));
    else if (entry.entryType === "PAYMENT") runningBalance = money(runningBalance.minus(entry.creditAmount));
    else if (entry.entryType === "CUSTOMER_PAYMENT") runningBalance = money(runningBalance.plus(entry.customerPaymentAmount));
    else if (entry.entryType === "CUSTOMER_CREDIT") runningBalance = money(runningBalance);
    else if (entry.manualPaymentType === "CREDIT" || entry.manualPaymentType === "EXPENSE") runningBalance = money(runningBalance.minus(entry.manualAmount));
    else runningBalance = money(runningBalance.plus(entry.manualAmount));
    return { ...entry, runningBalance, sequence };
  });

  const periodMilliseconds: Partial<Record<PassbookPeriod, number>> = {
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000,
  };
  const cutoff = period === "ALL" ? null : new Date(Date.now() - periodMilliseconds[period]!);
  const visibleEntries = entriesWithBalance
    .filter((entry) => !cutoff || entry.occurredAt >= cutoff)
    .sort((left, right) => {
      if (sort === "HIGHEST") {
        const leftAmount = left.entryType === "PURCHASE" ? left.debitAmount : left.entryType === "PAYMENT" ? left.creditAmount : left.entryType === "CUSTOMER_CREDIT" ? left.customerCreditAmount : left.entryType === "CUSTOMER_PAYMENT" ? left.customerPaymentAmount : left.manualAmount;
        const rightAmount = right.entryType === "PURCHASE" ? right.debitAmount : right.entryType === "PAYMENT" ? right.creditAmount : right.entryType === "CUSTOMER_CREDIT" ? right.customerCreditAmount : right.entryType === "CUSTOMER_PAYMENT" ? right.customerPaymentAmount : right.manualAmount;
        return rightAmount.comparedTo(leftAmount) || right.recordedAt.getTime() - left.recordedAt.getTime() || right.sequence - left.sequence;
      }
      const direction = sort === "OLDEST" ? 1 : -1;
      return direction * (left.recordedAt.getTime() - right.recordedAt.getTime()) || direction * (left.sequence - right.sequence);
    });

  const totalPurchases = money(sum(visibleEntries.map((entry) => entry.debitAmount)));
  const totalPayments = money(sum(visibleEntries.map((entry) => entry.creditAmount)));
  const totalHardCash = money(sum(visibleEntries.map((entry) => entry.manualPaymentType === "HARD_CASH" ? entry.manualAmount : entry.entryType === "CUSTOMER_PAYMENT" && entry.paymentMethod === "CASH" ? entry.customerPaymentAmount : ZERO)));
  const totalUpi = money(sum(visibleEntries.map((entry) => entry.manualPaymentType === "UPI" ? entry.manualAmount : entry.entryType === "CUSTOMER_PAYMENT" && entry.paymentMethod !== "CASH" ? entry.customerPaymentAmount : ZERO)));
  const totalCredit = money(sum(visibleEntries.map((entry) => entry.manualPaymentType === "CREDIT" ? entry.manualAmount : entry.entryType === "CUSTOMER_CREDIT" ? entry.customerCreditAmount : ZERO)));
  const totalExpenses = money(sum(visibleEntries.filter((entry) => entry.manualPaymentType === "EXPENSE").map((entry) => entry.manualAmount)));
  const totalCustomerCollections = money(sum(visibleEntries.filter((entry) => entry.entryType === "CUSTOMER_PAYMENT").map((entry) => entry.customerPaymentAmount)));
  const customerOutstanding = money(sum(creditSales
    .filter((sale) => sale.status !== CreditStatus.WRITTEN_OFF)
    .map((sale) => D(sale.totalAmount).minus(sum(sale.payments.map((payment) => payment.amount))))));

  return {
    entries: visibleEntries,
    totalPurchases,
    totalPayments,
    totalHardCash,
    totalUpi,
    totalCredit,
    totalExpenses,
    totalCustomerCollections,
    customerOutstanding,
    currentBalance: runningBalance,
  };
}

export async function getAdminOverview() {
  const [passbook, creditSales, supplierPayables, activeReceipts, activeSuppliers] = await Promise.all([
    getPurchasePassbook({ sort: "RECENT" }),
    prisma.creditSale.findMany({
      where: { status: { not: CreditStatus.WRITTEN_OFF } },
      include: { customer: { select: { id: true, name: true, phone: true } }, payments: { select: { amount: true } } },
    }),
    prisma.supplierPayable.findMany({
      where: { status: { not: PayableStatus.VOID } },
      include: { supplier: { select: { id: true, name: true } }, payments: { select: { amount: true } } },
    }),
    prisma.stockReceipt.findMany({
      where: { payable: { is: { status: { not: PayableStatus.VOID } } } },
      select: { items: { select: { quantityKg: true, birdCount: true, wastagePerBirdKg: true, unitCost: true, suggestedSellRate: true, lineAmount: true } } },
    }),
    prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const receiptEstimates = activeReceipts.flatMap((receipt) => receipt.items.map((item) => calculateReceiptEstimate({
    quantityKg: item.quantityKg,
    birdCount: item.birdCount,
    wastagePerBirdKg: item.wastagePerBirdKg,
    purchaseRate: item.unitCost,
    sellingRate: item.suggestedSellRate,
    storedTotalAmount: item.lineAmount,
  })));

  const customerMap = new Map<string, { id: string; name: string; phone: string | null; amount: Prisma.Decimal }>();
  for (const sale of creditSales) {
    const remaining = money(D(sale.totalAmount).minus(sum(sale.payments.map((payment) => payment.amount))));
    if (!remaining.greaterThan(ZERO)) continue;
    const current = customerMap.get(sale.customer.id);
    if (current) current.amount = money(current.amount.plus(remaining));
    else customerMap.set(sale.customer.id, { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone, amount: remaining });
  }

  const mainSuppliers = activeSuppliers.filter((supplier) => ["KSP", "NPF"].includes(supplier.name.trim().toUpperCase()));
  const supplierMap = new Map<string, { id: string; name: string; amount: Prisma.Decimal }>(
    mainSuppliers.map((supplier) => [supplier.id, { ...supplier, amount: money(ZERO) }]),
  );
  for (const payable of supplierPayables) {
    const remaining = money(D(payable.originalAmount).minus(sum(payable.payments.map((payment) => payment.amount))));
    if (!remaining.greaterThan(ZERO)) continue;
    const current = supplierMap.get(payable.supplier.id);
    if (current) current.amount = money(current.amount.plus(remaining));
    else supplierMap.set(payable.supplier.id, { id: payable.supplier.id, name: payable.supplier.name, amount: remaining });
  }

  const customersOwing = [...customerMap.values()].sort((left, right) => right.amount.comparedTo(left.amount) || left.name.localeCompare(right.name));
  const suppliersOwed = [...supplierMap.values()].sort((left, right) => right.amount.comparedTo(left.amount) || left.name.localeCompare(right.name));
  const suppliersPendingCount = suppliersOwed.filter((supplier) => supplier.amount.greaterThan(ZERO)).length;
  const recentActivity = passbook.entries.slice(0, 8).map((entry) => {
    const amount = entry.entryType === "PURCHASE" ? entry.debitAmount
      : entry.entryType === "PAYMENT" ? entry.creditAmount
        : entry.entryType === "CUSTOMER_CREDIT" ? entry.customerCreditAmount
          : entry.entryType === "CUSTOMER_PAYMENT" ? entry.customerPaymentAmount
            : entry.manualAmount;
    const direction = entry.entryType === "CUSTOMER_CREDIT" ? "NEUTRAL"
      : entry.entryType === "PURCHASE" || entry.entryType === "PAYMENT" || entry.manualPaymentType === "CREDIT" || entry.manualPaymentType === "EXPENSE" ? "OUT"
        : "IN";
    return {
      id: entry.id,
      occurredAt: entry.occurredAt,
      recordedAt: entry.recordedAt,
      party: entry.customer ?? entry.supplier,
      description: entry.description,
      entryType: entry.entryType,
      paymentMethod: entry.paymentMethod,
      amount: money(amount),
      direction,
    };
  });

  return {
    moneyAvailable: passbook.currentBalance,
    customerOutstanding: passbook.customerOutstanding,
    supplierOutstanding: money(sum(suppliersOwed.map((supplier) => supplier.amount))),
    estimatedPurchaseCost: money(sum(receiptEstimates.map((estimate) => estimate.totalAmount))),
    estimatedSales: money(sum(receiptEstimates.map((estimate) => estimate.salesAmount))),
    estimatedProfit: money(sum(receiptEstimates.map((estimate) => estimate.profit))),
    suppliersPendingCount,
    customersOwing,
    suppliersOwed,
    recentActivity,
  };
}

export async function getSupplierCreditLines(limit = 100) {
  const receipts = await prisma.stockReceipt.findMany({
    where: { payable: { is: { status: { not: PayableStatus.VOID } } } },
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      supplier: { select: { name: true } },
      items: { include: { chickenType: { select: { name: true } } } },
      payable: {
        include: {
          payments: {
            orderBy: { paidAt: "desc" },
            include: { moneyMovement: true },
          },
        },
      },
    },
  });

  return receipts.flatMap((receipt) => {
    if (!receipt.payable) return [];
    const paidAmount = money(sum(receipt.payable.payments.map((payment) => payment.amount)));
    const remainingAmount = money(D(receipt.payable.originalAmount).minus(paidAmount));
    const paymentMethods = [...new Set(receipt.payable.payments.map((payment) => payment.method))];
    const paymentMethod = paymentMethods.length ? paymentMethods.join(" + ") : null;

    return receipt.items.map((item) => {
      const quantityKg = weight(item.quantityKg);
      const averageKgPerBird = item.birdCount > 0 ? weight(quantityKg.div(item.birdCount)) : ZERO;
      return {
        id: item.id,
        payableId: receipt.payable!.id,
        receivedAt: receipt.receivedAt,
        supplierId: receipt.supplierId,
        supplier: receipt.supplier.name,
        chickenType: item.chickenType.name,
        birdCount: item.birdCount,
        quantityKg,
        averageKgPerBird,
        totalAmount: money(receipt.payable!.originalAmount),
        paidAmount,
        remainingAmount,
        paymentMethod,
        status: receipt.payable!.status,
      };
    });
  });
}

export async function getPassbook(input: { accountId?: string; from?: Date; to?: Date; query?: string; type?: string }) {
  const to = input.to ?? new Date();
  const from = input.from ?? new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  const accounts = await prisma.account.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const accountId = input.accountId ?? accounts[0]?.id;
  if (!accountId) return { accounts: [], accountId: null, openingBalance: ZERO, closingBalance: ZERO, entries: [] };
  const ledger = await getCashLedger(accountId, from, to);
  const query = input.query?.toLowerCase();
  let runningBalance = ledger.openingBalance;
  const entriesWithBalance = ledger.entries.map((entry) => {
    runningBalance = money(runningBalance.plus(entry.signedAmount));
    return { ...entry, runningBalance, description: entry.notes || entry.reference || entry.type.replaceAll("_", " ") };
  });
  const entries = entriesWithBalance.filter((entry) => {
    const haystack = `${entry.type} ${entry.reference ?? ""} ${entry.notes ?? ""}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!input.type || entry.type === input.type);
  });
  return { accounts: accounts.map(({ id, name, type }) => ({ id, name, type })), accountId, account: ledger.account, from, to, openingBalance: ledger.openingBalance, closingBalance: ledger.expectedClosingBalance, entries };
}

export async function getDashboard(date = new Date()) {
  const dayStart = toDateOnly(date);
  const dayEnd = new Date(dayStart.getTime() + 86_399_999);
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const [today, month, accounts, inventory, movements, reconciliations] = await Promise.all([
    getProfitReport(dayStart, dayEnd), getProfitReport(monthStart, dayEnd),
    prisma.account.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }), getInventoryReport(dayEnd),
    prisma.moneyMovement.findMany({ where: { occurredAt: { lte: dayEnd } }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 8, include: { fromAccount: true, toAccount: true } }),
    prisma.accountReconciliation.findMany({ where: { reconciledAt: { lte: dayEnd } }, orderBy: { reconciledAt: "desc" }, include: { account: true } }),
  ]);
  const expectedMoney = await Promise.all(accounts.map(async (account) => ({ accountId: account.id, name: account.name, type: account.type, expectedBalance: await accountBalance(prisma, account.id, dayEnd) })));
  const latestActual = accounts.map((account) => reconciliations.find((r) => r.accountId === account.id)).filter(Boolean).map((r) => ({ accountId: r!.accountId, name: r!.account.name, actualBalance: r!.actualBalance, expectedBalance: r!.expectedBalance, difference: r!.difference, reconciledAt: r!.reconciledAt }));
  const daily = await Promise.all(Array.from({ length: 7 }, async (_, index) => { const start = new Date(dayStart.getTime() - (6 - index) * 86_400_000); const end = new Date(start.getTime() + 86_399_999); const p = await getProfitReport(start, end); return { date: start, sales: p.revenue, profit: p.estimatedOperatingProfit, expenses: p.operatingExpenses }; }));
  return { date: dayStart, today, month, expectedMoney, latestActual, stockAlerts: inventory.filter((line) => line.quantityKg.lessThanOrEqualTo(0) || line.quantityKg.lessThan(10)), inventory, recentActivity: movements, daily };
}

export async function getMonthlyDetailedReport(year: number, month: number) {
  const base = await getMonthlyReport(year, month);
  const { from, to } = base;
  const [purchaseItems, saleItems, withdrawals, credits, payables, expenses, reconciliations] = await Promise.all([
    prisma.stockReceiptItem.findMany({ where: { stockReceipt: { receivedAt: { gte: from, lte: to } } }, include: { chickenType: true } }),
    prisma.dailySaleItem.findMany({ where: { dailySale: { businessDate: { gte: toDateOnly(from), lte: toDateOnly(to) } } }, include: { chickenType: true } }),
    prisma.ownerWithdrawal.findMany({ where: { withdrawnAt: { gte: from, lte: to } }, select: { amount: true } }),
    prisma.customerCredit.findMany({ include: { collections: { select: { amount: true } } } }), prisma.supplierPayable.findMany({ include: { payments: { select: { amount: true } } } }),
    prisma.expense.groupBy({ by: ["category"], where: { expenseDate: { gte: toDateOnly(from), lte: toDateOnly(to) } }, _sum: { amount: true } }),
    prisma.accountReconciliation.findMany({ where: { reconciledAt: { lte: to } }, orderBy: { reconciledAt: "desc" }, include: { account: true } }),
  ]);
  const grouped = <T extends { chickenType: { name: string }; quantityKg: Prisma.Decimal; lineAmount: Prisma.Decimal }>(items: T[]) => Object.values(items.reduce<Record<string, { name: string; quantityKg: Prisma.Decimal; amount: Prisma.Decimal }>>((acc, item) => { const row = acc[item.chickenType.name] ?? { name: item.chickenType.name, quantityKg: ZERO, amount: ZERO }; row.quantityKg = row.quantityKg.plus(item.quantityKg); row.amount = row.amount.plus(item.lineAmount); acc[item.chickenType.name] = row; return acc; }, {}));
  const creditOutstanding = money(sum(credits.map((x) => D(x.originalAmount).minus(sum(x.collections.map((c) => c.amount))))));
  const payableOutstanding = money(sum(payables.map((x) => D(x.originalAmount).minus(sum(x.payments.map((p) => p.amount))))));
  return { ...base, purchases: money(sum(purchaseItems.map((x) => x.lineAmount))), purchasesByChicken: grouped(purchaseItems), salesByChicken: grouped(saleItems), expensesByCategory: expenses.map((x) => ({ category: x.category, amount: money(x._sum.amount ?? ZERO) })), withdrawals: money(sum(withdrawals.map((x) => x.amount))), creditOutstanding, payableOutstanding, latestActual: reconciliations.reduce<Record<string, unknown>>((acc, r) => { if (!acc[r.accountId]) acc[r.accountId] = { accountId: r.accountId, name: r.account.name, actualBalance: r.actualBalance, expectedBalance: r.expectedBalance, difference: r.difference, reconciledAt: r.reconciledAt }; return acc; }, {}) };
}

export async function getSettings() {
  const [setup, chickenTypes, categories, accounts, openingInventory] = await Promise.all([prisma.shopSetup.findFirst({ orderBy: { openingDate: "asc" } }), prisma.chickenType.findMany({ orderBy: { name: "asc" } }), prisma.expenseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }), prisma.account.findMany({ orderBy: { name: "asc" } }), prisma.openingInventoryPosition.findMany({ include: { chickenType: true } })]);
  return { setup, chickenTypes, categories, accounts, openingInventory };
}

export async function updateShopName(shopName: string) { const setup = await prisma.shopSetup.findFirst({ orderBy: { openingDate: "asc" } }); if (!setup) throw new AccountingError("Initial shop setup has not been created.", 404); return prisma.shopSetup.update({ where: { id: setup.id }, data: { shopName } }); }
export async function addChickenType(input: { code: string; name: string }) { return prisma.chickenType.create({ data: { code: input.code.toUpperCase(), name: input.name } }); }
export async function addExpenseCategory(name: string) { return prisma.expenseCategory.create({ data: { name } }); }
