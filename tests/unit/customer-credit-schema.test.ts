import { describe, expect, it } from "vitest";
import { customerCreditSaleInput } from "@/lib/accounting/schemas";

const validSale = {
  idempotencyKey: "customer-credit-schema-test",
  customerId: "11111111-1111-4111-8111-111111111111",
  soldAt: "2026-10-20T18:00:00.000Z",
  chickenTypeId: "22222222-2222-4222-8222-222222222222",
  quantityKg: "1.000",
  unitPrice: "200.0000",
};

describe("customer credit sale validation", () => {
  it("accepts an unpaid credit sale without a money account", () => {
    const result = customerCreditSaleInput.safeParse({
      ...validSale,
      paidAmount: "0",
      paymentMethod: "CREDIT",
    });

    expect(result.success).toBe(true);
  });

  it("rejects money collected through the credit option", () => {
    const result = customerCreditSaleInput.safeParse({
      ...validSale,
      paidAmount: "1.00",
      paymentMethod: "CREDIT",
    });

    expect(result.success).toBe(false);
  });

  it("still requires an account for an actual payment", () => {
    const result = customerCreditSaleInput.safeParse({
      ...validSale,
      paidAmount: "1.00",
      paymentMethod: "UPI",
    });

    expect(result.success).toBe(false);
  });
});
