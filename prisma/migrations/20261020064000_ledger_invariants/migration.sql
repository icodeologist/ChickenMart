-- Ledger rows carry exact signed/directional history.  Cross-row balance and
-- status validation belongs in the application transaction service.
ALTER TABLE "OpeningAccountBalance"
  ADD CONSTRAINT "OpeningAccountBalance_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "OpeningInventoryPosition"
  ADD CONSTRAINT "OpeningInventoryPosition_quantity_positive" CHECK ("quantityKg" > 0),
  ADD CONSTRAINT "OpeningInventoryPosition_unit_cost_nonnegative" CHECK ("unitCost" >= 0);
ALTER TABLE "StockReceiptItem"
  ADD CONSTRAINT "StockReceiptItem_quantity_positive" CHECK ("quantityKg" > 0),
  ADD CONSTRAINT "StockReceiptItem_unit_cost_nonnegative" CHECK ("unitCost" >= 0),
  ADD CONSTRAINT "StockReceiptItem_line_amount_exact" CHECK ("lineAmount" = ROUND("quantityKg" * "unitCost", 2));
ALTER TABLE "DailySaleItem"
  ADD CONSTRAINT "DailySaleItem_quantity_positive" CHECK ("quantityKg" > 0),
  ADD CONSTRAINT "DailySaleItem_unit_price_nonnegative" CHECK ("unitSellingPrice" >= 0),
  ADD CONSTRAINT "DailySaleItem_line_amount_exact" CHECK ("lineAmount" = ROUND("quantityKg" * "unitSellingPrice", 2));
ALTER TABLE "StockCountLine"
  ADD CONSTRAINT "StockCountLine_expected_nonnegative" CHECK ("expectedQuantity" >= 0),
  ADD CONSTRAINT "StockCountLine_counted_nonnegative" CHECK ("countedQuantity" >= 0);
ALTER TABLE "StockAdjustment"
  ADD CONSTRAINT "StockAdjustment_quantity_nonzero" CHECK ("quantityKg" <> 0),
  ADD CONSTRAINT "StockAdjustment_unit_cost_nonnegative" CHECK ("unitCost" >= 0);
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_quantity_nonzero" CHECK ("quantityKg" <> 0),
  ADD CONSTRAINT "InventoryMovement_unit_cost_nonnegative" CHECK ("unitCost" >= 0),
  ADD CONSTRAINT "InventoryMovement_one_source" CHECK (
    (CASE WHEN "openingInventoryPositionId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "stockReceiptItemId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "dailySaleItemId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "stockAdjustmentId" IS NULL THEN 0 ELSE 1 END) = 1
  ),
  ADD CONSTRAINT "InventoryMovement_kind_matches_source" CHECK (
    ("kind" = 'OPENING' AND "openingInventoryPositionId" IS NOT NULL) OR
    ("kind" = 'RECEIPT' AND "stockReceiptItemId" IS NOT NULL) OR
    ("kind" = 'SALE' AND "dailySaleItemId" IS NOT NULL) OR
    ("kind" = 'STOCK_ADJUSTMENT' AND "stockAdjustmentId" IS NOT NULL)
  );
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "SupplierPayable"
  ADD CONSTRAINT "SupplierPayable_amount_positive" CHECK ("originalAmount" > 0);
ALTER TABLE "SupplierPayment"
  ADD CONSTRAINT "SupplierPayment_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "CustomerCredit"
  ADD CONSTRAINT "CustomerCredit_amount_positive" CHECK ("originalAmount" > 0);
ALTER TABLE "CustomerCollection"
  ADD CONSTRAINT "CustomerCollection_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "OwnerWithdrawal"
  ADD CONSTRAINT "OwnerWithdrawal_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "MoneyMovement"
  ADD CONSTRAINT "MoneyMovement_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "MoneyMovement_valid_direction" CHECK (
    ("fromAccountId" IS NOT NULL OR "toAccountId" IS NOT NULL) AND
    ("fromAccountId" IS NULL OR "toAccountId" IS NULL OR "fromAccountId" <> "toAccountId")
  ),
  ADD CONSTRAINT "MoneyMovement_type_matches_direction" CHECK (
    ("type" IN ('OPENING_BALANCE', 'SALE_RECEIPT', 'CUSTOMER_COLLECTION') AND "fromAccountId" IS NULL AND "toAccountId" IS NOT NULL) OR
    ("type" IN ('EXPENSE_PAYMENT', 'SUPPLIER_PAYMENT', 'OWNER_WITHDRAWAL') AND "fromAccountId" IS NOT NULL AND "toAccountId" IS NULL) OR
    ("type" = 'ACCOUNT_TRANSFER' AND "fromAccountId" IS NOT NULL AND "toAccountId" IS NOT NULL) OR
    ("type" = 'MONEY_ADJUSTMENT')
  );
