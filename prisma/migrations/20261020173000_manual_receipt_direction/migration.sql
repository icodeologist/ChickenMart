ALTER TABLE "MoneyMovement"
  DROP CONSTRAINT "MoneyMovement_type_matches_direction";

UPDATE "MoneyMovement" AS movement
SET
  "type" = 'MANUAL_RECEIPT',
  "toAccountId" = movement."fromAccountId",
  "fromAccountId" = NULL
FROM "ManualPassbookEntry" AS entry
WHERE entry."moneyMovementId" = movement."id"
  AND entry."paymentType" IN ('HARD_CASH', 'UPI');

ALTER TABLE "MoneyMovement"
  ADD CONSTRAINT "MoneyMovement_type_matches_direction" CHECK (
    ("type" IN ('OPENING_BALANCE', 'SALE_RECEIPT', 'CUSTOMER_COLLECTION', 'MANUAL_RECEIPT') AND "fromAccountId" IS NULL AND "toAccountId" IS NOT NULL) OR
    ("type" IN ('EXPENSE_PAYMENT', 'SUPPLIER_PAYMENT', 'OWNER_WITHDRAWAL', 'MANUAL_PAYMENT') AND "fromAccountId" IS NOT NULL AND "toAccountId" IS NULL) OR
    ("type" = 'ACCOUNT_TRANSFER' AND "fromAccountId" IS NOT NULL AND "toAccountId" IS NOT NULL) OR
    ("type" = 'MONEY_ADJUSTMENT')
  );
