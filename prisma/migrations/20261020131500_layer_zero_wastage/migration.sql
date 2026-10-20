UPDATE "StockReceiptItem" AS item
SET "wastagePerBirdKg" = 0.000
FROM "ChickenType" AS chicken
WHERE item."chickenTypeId" = chicken."id"
  AND chicken."code" = 'LINE_CHICKEN';
