ALTER TABLE "MoneyMovement"
  DROP CONSTRAINT "MoneyMovement_type_matches_direction";

ALTER TABLE "MoneyMovement"
  ADD CONSTRAINT "MoneyMovement_type_matches_direction" CHECK (
    ("type" IN ('OPENING_BALANCE', 'SALE_RECEIPT', 'CUSTOMER_COLLECTION') AND "fromAccountId" IS NULL AND "toAccountId" IS NOT NULL) OR
    ("type" IN ('EXPENSE_PAYMENT', 'SUPPLIER_PAYMENT', 'OWNER_WITHDRAWAL', 'MANUAL_PAYMENT') AND "fromAccountId" IS NOT NULL AND "toAccountId" IS NULL) OR
    ("type" = 'ACCOUNT_TRANSFER' AND "fromAccountId" IS NOT NULL AND "toAccountId" IS NOT NULL) OR
    ("type" = 'MONEY_ADJUSTMENT')
  );

ALTER TABLE "ManualPassbookEntry"
  ADD CONSTRAINT "ManualPassbookEntry_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "ManualPassbookEntry_movement_matches_type" CHECK (
    ("paymentType" = 'CREDIT' AND "moneyMovementId" IS NULL) OR
    ("paymentType" IN ('HARD_CASH', 'UPI') AND "moneyMovementId" IS NOT NULL)
  );
