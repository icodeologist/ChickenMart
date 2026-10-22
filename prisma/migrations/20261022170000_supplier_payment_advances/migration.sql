ALTER TABLE "SupplierPayment"
ADD COLUMN "appliedAmount" DECIMAL(16, 2) NOT NULL DEFAULT 0,
ADD COLUMN "advanceAmount" DECIMAL(16, 2) NOT NULL DEFAULT 0;

UPDATE "SupplierPayment"
SET "appliedAmount" = "amount";

ALTER TABLE "SupplierPayment"
ADD CONSTRAINT "SupplierPayment_amount_breakdown_check"
CHECK (
  "amount" > 0
  AND "appliedAmount" >= 0
  AND "advanceAmount" >= 0
  AND "amount" = "appliedAmount" + "advanceAmount"
);
