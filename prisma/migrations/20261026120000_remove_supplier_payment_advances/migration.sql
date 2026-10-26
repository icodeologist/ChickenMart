-- Supplier advances are no longer part of the active payment model.
-- Preserve the payment records and normalize each payment to the amount actually posted.
UPDATE "SupplierPayment"
SET "appliedAmount" = "amount",
    "advanceAmount" = 0;

UPDATE "SupplierPayable" AS payable
SET "status" = CASE
  WHEN payable."status" = 'VOID' THEN 'VOID'::"PayableStatus"
  WHEN COALESCE((SELECT SUM(payment."appliedAmount") FROM "SupplierPayment" AS payment WHERE payment."payableId" = payable."id"), 0) >= payable."originalAmount" THEN 'PAID'::"PayableStatus"
  WHEN COALESCE((SELECT SUM(payment."appliedAmount") FROM "SupplierPayment" AS payment WHERE payment."payableId" = payable."id"), 0) > 0 THEN 'PARTIALLY_PAID'::"PayableStatus"
  ELSE 'OPEN'::"PayableStatus"
END;
