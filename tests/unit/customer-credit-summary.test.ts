import { describe, expect, it } from "vitest";
import { calculateDailyCustomerCreditSummaries } from "@/lib/accounting/engine";

describe("daily customer credit summaries", () => {
  const credits = [
    { creditedAt: new Date("2026-10-25T13:59:59.000Z"), amount: "100.00", customerName: "Customer A" },
    { creditedAt: new Date("2026-10-25T14:00:00.000Z"), amount: "200.00", customerName: "Customer B" },
    { creditedAt: new Date("2026-10-26T13:00:00.000Z"), amount: "300.00", customerName: "Customer C" },
  ];

  it("publishes each 7:30 p.m. IST window at 8:00 p.m.", () => {
    expect(calculateDailyCustomerCreditSummaries(credits, new Date("2026-10-25T14:29:59.999Z"))).toHaveLength(0);

    const firstPublished = calculateDailyCustomerCreditSummaries(credits, new Date("2026-10-25T14:30:00.000Z"));
    expect(firstPublished).toHaveLength(1);
    expect(firstPublished[0].customerCreditAmount.toFixed(2)).toBe("100.00");
    expect(firstPublished[0].occurredAt.toISOString()).toBe("2026-10-25T14:30:00.000Z");
    expect(firstPublished[0].description).toContain("1 customer");

    const nextDay = calculateDailyCustomerCreditSummaries(credits, new Date("2026-10-26T14:30:00.000Z"));
    expect(nextDay).toHaveLength(2);
    expect(nextDay[1].customerCreditAmount.toFixed(2)).toBe("500.00");
    expect(nextDay[1].description).toContain("2 customers");
  });
});
