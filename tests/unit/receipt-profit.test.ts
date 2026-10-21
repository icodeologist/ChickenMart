import { describe, expect, it } from "vitest";
import { calculateReceiptEstimate } from "@/lib/accounting/engine";

describe("receipt profit estimate", () => {
  it("cross-checks purchase, wastage, meat, sales and profit", () => {
    const result = calculateReceiptEstimate({
      quantityKg: "120.000",
      birdCount: 60,
      wastagePerBirdKg: "0.600",
      purchaseRate: "100.0000",
      sellingRate: "200.0000",
      storedTotalAmount: "12000.00",
    });

    expect(result.totalAmount.toFixed(2)).toBe("12000.00");
    expect(result.wastageKg.toFixed(3)).toBe("36.000");
    expect(result.meatKg.toFixed(3)).toBe("84.000");
    expect(result.salesAmount.toFixed(2)).toBe("16800.00");
    expect(result.profit.toFixed(2)).toBe("4800.00");
    expect(result.salesAmount.minus(result.totalAmount).toFixed(2)).toBe(result.profit.toFixed(2));
  });

  it("rejects a stored total that does not equal weight multiplied by buy rate", () => {
    expect(() => calculateReceiptEstimate({
      quantityKg: "10.000",
      birdCount: 5,
      wastagePerBirdKg: "0.600",
      purchaseRate: "100.0000",
      sellingRate: "150.0000",
      storedTotalAmount: "999.00",
    })).toThrow("Stored purchase total does not match");
  });
});
