export type SupplierCreditSummaryRow = {
  payableId: string;
  supplier: string;
  remainingAmount: string;
};

const TRACKED_SUPPLIERS = ["KSP", "NPF"] as const;

function toPaise(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error("Invalid supplier balance.");
  return BigInt(match[1]) * BigInt(100) + BigInt((match[2] ?? "").padEnd(2, "0"));
}

function fromPaise(value: bigint) {
  return `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, "0")}`;
}

export function summarizeSupplierPayments(rows: SupplierCreditSummaryRow[]) {
  const uniquePayables = new Map<string, SupplierCreditSummaryRow>();
  for (const row of rows) {
    const supplier = row.supplier.trim().toUpperCase();
    if (!TRACKED_SUPPLIERS.includes(supplier as (typeof TRACKED_SUPPLIERS)[number])) continue;
    if (!uniquePayables.has(row.payableId)) uniquePayables.set(row.payableId, { ...row, supplier });
  }

  return TRACKED_SUPPLIERS.map((supplier) => {
    const pending = [...uniquePayables.values()].filter((row) => row.supplier === supplier && toPaise(row.remainingAmount) > BigInt(0));
    const amount = pending.reduce((total, row) => total + toPaise(row.remainingAmount), BigInt(0));
    return { supplier, amount: fromPaise(amount), pendingInvoices: pending.length };
  });
}
