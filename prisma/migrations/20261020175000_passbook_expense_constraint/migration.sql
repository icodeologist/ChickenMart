ALTER TABLE "ManualPassbookEntry"
  DROP CONSTRAINT "ManualPassbookEntry_movement_matches_type";

ALTER TABLE "ManualPassbookEntry"
  ADD CONSTRAINT "ManualPassbookEntry_movement_matches_type" CHECK (
    ("paymentType" = 'CREDIT' AND "moneyMovementId" IS NULL) OR
    ("paymentType" IN ('HARD_CASH', 'UPI', 'EXPENSE') AND "moneyMovementId" IS NOT NULL)
  );
