ALTER TABLE "InventoryMovement"
  DROP CONSTRAINT "InventoryMovement_one_source",
  DROP CONSTRAINT "InventoryMovement_kind_matches_source";

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_one_source" CHECK (
    (CASE WHEN "openingInventoryPositionId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "stockReceiptItemId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "dailySaleItemId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "creditSaleItemId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "stockAdjustmentId" IS NULL THEN 0 ELSE 1 END) = 1
  ),
  ADD CONSTRAINT "InventoryMovement_kind_matches_source" CHECK (
    ("kind" = 'OPENING' AND "openingInventoryPositionId" IS NOT NULL) OR
    ("kind" = 'RECEIPT' AND "stockReceiptItemId" IS NOT NULL) OR
    ("kind" = 'SALE' AND ("dailySaleItemId" IS NOT NULL OR "creditSaleItemId" IS NOT NULL)) OR
    ("kind" = 'STOCK_ADJUSTMENT' AND "stockAdjustmentId" IS NOT NULL)
  );

ALTER TABLE "CreditSaleItem"
  ADD CONSTRAINT "CreditSaleItem_quantity_positive" CHECK ("quantityKg" > 0),
  ADD CONSTRAINT "CreditSaleItem_unit_price_nonnegative" CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "CreditSaleItem_line_amount_exact" CHECK ("lineAmount" = ROUND("quantityKg" * "unitPrice", 2));

ALTER TABLE "CreditSalePayment"
  ADD CONSTRAINT "CreditSalePayment_amount_positive" CHECK ("amount" > 0);
