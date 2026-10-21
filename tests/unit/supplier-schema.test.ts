import { describe, expect, it } from "vitest";
import { supplierInput } from "@/lib/accounting/schemas";

describe("supplier validation", () => {
  it("accepts and trims a supplier name", () => {
    const result = supplierInput.parse({
      idempotencyKey: "supplier-schema-test",
      name: "  Sunrise Farms  ",
    });

    expect(result.name).toBe("Sunrise Farms");
  });

  it("rejects an empty supplier name", () => {
    const result = supplierInput.safeParse({
      idempotencyKey: "supplier-schema-empty-test",
      name: "   ",
    });

    expect(result.success).toBe(false);
  });
});
