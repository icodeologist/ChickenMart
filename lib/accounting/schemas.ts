import { z } from "zod";
import { Prisma } from "@prisma/client";

const uuid = z.string().uuid();
const trimmed = z.string().trim();
const dateTime = z.coerce.date();
const businessDate = z.coerce.date();
const idempotencyKey = trimmed.min(1).max(120);

const decimalString = (scale: number, positive = true) =>
  trimmed
    .regex(new RegExp(`^${positive ? "[1-9]\\d*" : "-?\\d+"}(?:\\.\\d{1,${scale}})?$`), `Use a decimal with at most ${scale} places.`);

export const weightString = decimalString(3);
export const rateString = decimalString(4, false).refine((value) => new Prisma.Decimal(value).gte(0), "Must not be negative.");
export const moneyString = decimalString(2);
export const nonnegativeMoneyString = decimalString(2, false).refine((value) => new Prisma.Decimal(value).gte(0), "Must not be negative.");
export const nonnegativeWeightString = decimalString(3, false).refine((value) => new Prisma.Decimal(value).gte(0), "Must not be negative.");
export const signedMoneyString = decimalString(2, false);

const receiptLine = z.object({ chickenTypeId: uuid, quantityKg: weightString, birdCount: z.coerce.number().int().min(0).default(0), unitCost: rateString, suggestedSellRate: rateString.default("0") });
const saleLine = z.object({ chickenTypeId: uuid, quantityKg: weightString, unitSellingPrice: rateString });
const creditAllocation = z.object({ customerId: uuid, amount: moneyString, notes: trimmed.max(500).optional() });

const uniqueBy = (field: string) => (items: Record<string, unknown>[]) =>
  new Set(items.map((item) => item[field])).size === items.length;

export const receiptInput = z.object({
  idempotencyKey,
  receiptNumber: trimmed.min(1).max(50),
  supplierId: uuid,
  receivedAt: dateTime,
  supplierInvoice: trimmed.max(80).optional(),
  dueDate: businessDate.optional(),
  paidAmount: nonnegativeMoneyString.default("0"),
  paidFromAccountId: uuid.optional(),
  notes: trimmed.max(2000).optional(),
  items: z.array(receiptLine).min(1).refine(uniqueBy("chickenTypeId"), "A chicken type may appear once per receipt."),
}).superRefine((value, ctx) => {
  if (!new Prisma.Decimal(value.paidAmount).isZero() && !value.paidFromAccountId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paidFromAccountId"], message: "Paying a receipt requires a cash or bank account." });
});

export const receiptEditInput = z.object({
  idempotencyKey,
  itemId: uuid,
  supplierId: uuid,
  receivedAt: dateTime,
  chickenTypeId: uuid,
  birdCount: z.coerce.number().int().min(0),
  quantityKg: weightString,
  unitCost: rateString,
  suggestedSellRate: rateString,
});

export const receiptDeleteInput = z.object({ idempotencyKey, itemId: uuid });

export const dailySaleInput = z.object({
  idempotencyKey,
  businessDate,
  occurredAt: dateTime,
  notes: trimmed.max(2000).optional(),
  items: z.array(saleLine).min(1).refine(uniqueBy("chickenTypeId"), "A chicken type may appear once per daily sale."),
  cashAccountId: uuid.optional(),
  cashAmount: nonnegativeMoneyString.default("0"),
  bankAccountId: uuid.optional(),
  bankAmount: nonnegativeMoneyString.default("0"),
  credits: z.array(creditAllocation).default([]).refine(uniqueBy("customerId"), "A customer may have one credit balance per daily sale."),
}).superRefine((value, ctx) => {
  if (!new Prisma.Decimal(value.cashAmount).isZero() && !value.cashAccountId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["cashAccountId"], message: "Cash account is required." });
  if (!new Prisma.Decimal(value.bankAmount).isZero() && !value.bankAccountId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["bankAccountId"], message: "Bank/UPI account is required." });
});

export const stockCountInput = z.object({
  idempotencyKey,
  countedAt: dateTime,
  notes: trimmed.max(2000).optional(),
  lines: z.array(z.object({ chickenTypeId: uuid, countedQuantity: nonnegativeWeightString, unitCost: rateString.optional() })).min(1).refine(uniqueBy("chickenTypeId"), "A chicken type may appear once per count."),
});

export const expenseInput = z.object({
  idempotencyKey,
  expenseDate: businessDate,
  paidAt: dateTime,
  accountId: uuid,
  category: trimmed.min(1).max(80),
  description: trimmed.min(1).max(2000),
  amount: moneyString,
});

export const supplierPaymentInput = z.object({ idempotencyKey, payableId: uuid, paidAt: dateTime, accountId: uuid, amount: moneyString, notes: trimmed.max(2000).optional() });
export const supplierSettlementInput = z.object({
  idempotencyKey,
  payableId: uuid,
  paidAt: dateTime,
  accountId: uuid,
  paymentAmount: moneyString,
  paymentMethod: z.enum(["CASH", "UPI", "NET_BANKING"]),
  notes: trimmed.max(500).optional(),
});

export const supplierInput = z.object({
  idempotencyKey,
  name: trimmed.min(1).max(140),
  phone: trimmed.min(5).max(30).optional(),
  notes: trimmed.max(2000).optional(),
});

export const chickenTypeInput = z.object({
  idempotencyKey,
  code: trimmed.min(1).max(32).regex(/^[A-Za-z0-9_-]+$/),
  name: trimmed.min(1).max(80),
});

export const manualPassbookEntryInput = z.object({
  idempotencyKey,
  entryDate: dateTime,
  description: trimmed.min(1).max(200),
  amount: moneyString,
  paymentType: z.enum(["HARD_CASH", "UPI", "CREDIT", "EXPENSE"]),
});

const customerPaymentMethod = z.enum(["CASH", "UPI", "NET_BANKING"]);
const customerSalePaymentMethod = z.enum(["CASH", "UPI", "NET_BANKING", "CREDIT"]);

export const creditCustomerInput = z.object({
  idempotencyKey,
  name: trimmed.min(1).max(140),
  phone: trimmed.min(5).max(30),
  address: trimmed.min(1).max(500),
});

export const customerCreditSaleInput = z.object({
  idempotencyKey,
  customerId: uuid,
  soldAt: dateTime,
  chickenTypeId: uuid,
  quantityKg: weightString,
  unitPrice: rateString,
  paidAmount: nonnegativeMoneyString,
  paymentMethod: customerSalePaymentMethod,
  accountId: uuid.optional(),
}).superRefine((value, ctx) => {
  const paidAmount = new Prisma.Decimal(value.paidAmount);
  if (value.paymentMethod === "CREDIT" && !paidAmount.isZero()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paidAmount"], message: "A credit sale must have zero paid now." });
  }
  if (value.paymentMethod !== "CREDIT" && !paidAmount.isZero() && !value.accountId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["accountId"], message: "A paid sale requires a cash or bank account." });
  }
});

export const customerCreditPaymentInput = z.object({
  idempotencyKey,
  creditSaleId: uuid,
  paidAt: dateTime,
  amount: moneyString,
  paymentMethod: customerPaymentMethod,
  accountId: uuid.optional(),
});
export const customerCollectionInput = z.object({ idempotencyKey, customerCreditId: uuid, collectedAt: dateTime, accountId: uuid, amount: moneyString, notes: trimmed.max(2000).optional() });
export const ownerWithdrawalInput = z.object({ idempotencyKey, withdrawnAt: dateTime, accountId: uuid, amount: moneyString, purpose: trimmed.max(2000).optional() });
export const transferInput = z.object({ idempotencyKey, occurredAt: dateTime, fromAccountId: uuid, toAccountId: uuid, amount: moneyString, reference: trimmed.max(100).optional(), notes: trimmed.max(2000).optional() }).refine((value) => value.fromAccountId !== value.toAccountId, "Transfer accounts must differ.");
export const inventoryCorrectionInput = z.object({
  idempotencyKey,
  chickenTypeId: uuid,
  occurredAt: dateTime,
  quantityKg: decimalString(3, false).refine((value) => !new Prisma.Decimal(value).isZero(), "Quantity cannot be zero."),
  unitCost: rateString,
  notes: trimmed.min(1).max(2000),
  reversalOfId: uuid.optional(),
});
export const wastageInput = z.object({
  idempotencyKey,
  chickenTypeId: uuid,
  occurredAt: dateTime,
  quantityKg: weightString,
  reason: z.enum(["SPOILAGE", "MORTALITY"]).default("SPOILAGE"),
  notes: trimmed.min(1).max(2000),
});
export const reconciliationInput = z.object({ idempotencyKey, accountId: uuid, reconciledAt: dateTime, actualBalance: signedMoneyString, notes: trimmed.max(2000).optional() });
export const moneyCorrectionInput = z.object({
  idempotencyKey,
  occurredAt: dateTime,
  accountId: uuid,
  amount: moneyString,
  direction: z.enum(["INFLOW", "OUTFLOW"]),
  notes: trimmed.min(1).max(2000),
  reversalOfId: uuid.optional(),
});

export const inventoryReportInput = z.object({ asOf: dateTime.optional() });
export const profitReportInput = z.object({ from: dateTime, to: dateTime }).refine((value) => value.to >= value.from, "End must be on or after start.");
export const cashLedgerReportInput = z.object({ accountId: uuid, from: dateTime, to: dateTime }).refine((value) => value.to >= value.from, "End must be on or after start.");
export const monthlyReportInput = z.object({ year: z.coerce.number().int().min(2000).max(2200), month: z.coerce.number().int().min(1).max(12) });
export const dailyEntryContextInput = z.object({ date: z.coerce.date() });
export const passbookInput = z.object({ accountId: uuid.optional(), from: dateTime.optional(), to: dateTime.optional(), query: trimmed.max(100).optional(), type: z.string().max(40).optional() });
export const dashboardInput = z.object({ date: dateTime.optional() });
export const settingsShopInput = z.object({ shopName: trimmed.min(1).max(120) });
export const chickenTypeSettingsInput = z.object({ code: trimmed.min(1).max(32), name: trimmed.min(1).max(80) });
export const expenseCategorySettingsInput = z.object({ name: trimmed.min(1).max(80) });

export type ReceiptInput = z.infer<typeof receiptInput>;
export type DailySaleInput = z.infer<typeof dailySaleInput>;
export type StockCountInput = z.infer<typeof stockCountInput>;
export type ExpenseInput = z.infer<typeof expenseInput>;
export type SupplierPaymentInput = z.infer<typeof supplierPaymentInput>;
export type SupplierSettlementInput = z.infer<typeof supplierSettlementInput>;
export type SupplierInput = z.infer<typeof supplierInput>;
export type ChickenTypeInput = z.infer<typeof chickenTypeInput>;
export type ManualPassbookEntryInput = z.infer<typeof manualPassbookEntryInput>;
export type CreditCustomerInput = z.infer<typeof creditCustomerInput>;
export type CustomerCreditSaleInput = z.infer<typeof customerCreditSaleInput>;
export type CustomerCreditPaymentInput = z.infer<typeof customerCreditPaymentInput>;
export type CustomerCollectionInput = z.infer<typeof customerCollectionInput>;
export type OwnerWithdrawalInput = z.infer<typeof ownerWithdrawalInput>;
export type TransferInput = z.infer<typeof transferInput>;
export type InventoryCorrectionInput = z.infer<typeof inventoryCorrectionInput>;
export type WastageInput = z.infer<typeof wastageInput>;
export type ReconciliationInput = z.infer<typeof reconciliationInput>;
export type MoneyCorrectionInput = z.infer<typeof moneyCorrectionInput>;
