import { describe, expect, it } from "vitest";
import { summarizeSupplierPayments } from "@/lib/accounting/supplier-credit-summary";

describe("supplier payment summaries", () => {
  it("totals KSP and NPF exactly and ignores paid or unrelated suppliers", () => {
    expect(summarizeSupplierPayments([
      { payableId: "ksp-1", supplier: "KSP", remainingAmount: "1000.25" },
      { payableId: "ksp-2", supplier: " ksp ", remainingAmount: "499.75" },
      { payableId: "ksp-paid", supplier: "KSP", remainingAmount: "0.00" },
      { payableId: "npf-1", supplier: "NPF", remainingAmount: "250.00" },
      { payableId: "other-1", supplier: "Other", remainingAmount: "9000.00" },
    ])).toEqual([
      { supplier: "KSP", amount: "1500.00", pendingInvoices: 2 },
      { supplier: "NPF", amount: "250.00", pendingInvoices: 1 },
    ]);
  });

  it("counts a multi-item payable once and never uses floating point", () => {
    const rows = [
      { payableId: "same-invoice", supplier: "KSP", remainingAmount: "90071992547409.91" },
      { payableId: "same-invoice", supplier: "KSP", remainingAmount: "90071992547409.91" },
    ];
    expect(summarizeSupplierPayments(rows)[0]).toEqual({
      supplier: "KSP",
      amount: "90071992547409.91",
      pendingInvoices: 1,
    });
  });

  it("returns zero cards when neither supplier has an entry", () => {
    expect(summarizeSupplierPayments([])).toEqual([
      { supplier: "KSP", amount: "0.00", pendingInvoices: 0 },
      { supplier: "NPF", amount: "0.00", pendingInvoices: 0 },
    ]);
  });
});
