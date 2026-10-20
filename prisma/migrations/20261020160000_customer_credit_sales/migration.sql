CREATE TYPE "CustomerPaymentMethod" AS ENUM ('CASH', 'UPI', 'NET_BANKING');

ALTER TABLE "Customer" ADD COLUMN "address" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "creditSaleItemId" UUID;

CREATE TABLE "CreditSale" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "soldAt" TIMESTAMPTZ(6) NOT NULL,
    "totalAmount" DECIMAL(16,2) NOT NULL,
    "status" "CreditStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditSale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditSaleItem" (
    "id" UUID NOT NULL,
    "creditSaleId" UUID NOT NULL,
    "chickenTypeId" UUID NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(16,4) NOT NULL,
    "lineAmount" DECIMAL(16,2) NOT NULL,
    CONSTRAINT "CreditSaleItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditSalePayment" (
    "id" UUID NOT NULL,
    "creditSaleId" UUID NOT NULL,
    "paidAt" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "method" "CustomerPaymentMethod" NOT NULL,
    "moneyMovementId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditSalePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryMovement_creditSaleItemId_key" ON "InventoryMovement"("creditSaleItemId");
CREATE INDEX "CreditSale_customerId_soldAt_idx" ON "CreditSale"("customerId", "soldAt");
CREATE INDEX "CreditSale_status_soldAt_idx" ON "CreditSale"("status", "soldAt");
CREATE INDEX "CreditSaleItem_creditSaleId_idx" ON "CreditSaleItem"("creditSaleId");
CREATE INDEX "CreditSaleItem_chickenTypeId_idx" ON "CreditSaleItem"("chickenTypeId");
CREATE UNIQUE INDEX "CreditSalePayment_moneyMovementId_key" ON "CreditSalePayment"("moneyMovementId");
CREATE INDEX "CreditSalePayment_creditSaleId_paidAt_idx" ON "CreditSalePayment"("creditSaleId", "paidAt");

ALTER TABLE "CreditSale" ADD CONSTRAINT "CreditSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditSaleItem" ADD CONSTRAINT "CreditSaleItem_creditSaleId_fkey" FOREIGN KEY ("creditSaleId") REFERENCES "CreditSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditSaleItem" ADD CONSTRAINT "CreditSaleItem_chickenTypeId_fkey" FOREIGN KEY ("chickenTypeId") REFERENCES "ChickenType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditSalePayment" ADD CONSTRAINT "CreditSalePayment_creditSaleId_fkey" FOREIGN KEY ("creditSaleId") REFERENCES "CreditSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditSalePayment" ADD CONSTRAINT "CreditSalePayment_moneyMovementId_fkey" FOREIGN KEY ("moneyMovementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_creditSaleItemId_fkey" FOREIGN KEY ("creditSaleItemId") REFERENCES "CreditSaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
