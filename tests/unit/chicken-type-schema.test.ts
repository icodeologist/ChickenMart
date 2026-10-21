import { describe, expect, it } from "vitest";
import { chickenTypeInput } from "@/lib/accounting/schemas";

describe("chicken type validation", () => {
  it("accepts a standard chicken type", () => {
    const result = chickenTypeInput.parse({
      idempotencyKey: "chicken-type-schema-test",
      code: "BROILER",
      name: "Broiler",
    });

    expect(result.code).toBe("BROILER");
  });

  it("rejects codes with spaces", () => {
    const result = chickenTypeInput.safeParse({
      idempotencyKey: "chicken-type-schema-invalid-test",
      code: "layer chicken",
      name: "Layer Chicken",
    });

    expect(result.success).toBe(false);
  });
});
