-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('CASH', 'BANK');

-- CreateEnum
CREATE TYPE "InventoryMovementKind" AS ENUM ('OPENING', 'RECEIPT', 'SALE', 'STOCK_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "StockAdjustmentReason" AS ENUM ('COUNT_VARIANCE', 'SPOILAGE', 'MORTALITY', 'CORRECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "MoneyMovementType" AS ENUM ('OPENING_BALANCE', 'SALE_RECEIPT', 'EXPENSE_PAYMENT', 'SUPPLIER_PAYMENT', 'CUSTOMER_COLLECTION', 'OWNER_WITHDRAWAL', 'ACCOUNT_TRANSFER', 'MONEY_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('OPEN', 'PARTIALLY_COLLECTED', 'COLLECTED', 'WRITTEN_OFF');

-- CreateTable
CREATE TABLE "ShopSetup" (
    "id" UUID NOT NULL,
    "openingDate" DATE NOT NULL,
    "shopName" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChickenType" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChickenType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "AccountType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" UUID NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "phone" VARCHAR(30),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "name" VARCHAR(140) NOT NULL,
    "phone" VARCHAR(30),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningAccountBalance" (
    "id" UUID NOT NULL,
    "setupId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "moneyMovementId" UUID NOT NULL,

    CONSTRAINT "OpeningAccountBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpeningInventoryPosition" (
    "id" UUID NOT NULL,
    "setupId" UUID NOT NULL,
    "chickenTypeId" UUID NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(16,4) NOT NULL,

    CONSTRAINT "OpeningInventoryPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceipt" (
    "id" UUID NOT NULL,
    "receiptNumber" VARCHAR(50) NOT NULL,
    "supplierId" UUID NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL,
    "supplierInvoice" VARCHAR(80),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockReceiptItem" (
    "id" UUID NOT NULL,
    "stockReceiptId" UUID NOT NULL,
    "chickenTypeId" UUID NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(16,4) NOT NULL,
    "lineAmount" DECIMAL(16,2) NOT NULL,

    CONSTRAINT "StockReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySale" (
    "id" UUID NOT NULL,
    "businessDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "DailySale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySaleItem" (
    "id" UUID NOT NULL,
    "dailySaleId" UUID NOT NULL,
    "chickenTypeId" UUID NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "unitSellingPrice" DECIMAL(16,4) NOT NULL,
    "lineAmount" DECIMAL(16,2) NOT NULL,

    CONSTRAINT "DailySaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" UUID NOT NULL,
    "countedAt" TIMESTAMPTZ(6) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" UUID NOT NULL,
    "stockCountId" UUID NOT NULL,
    "chickenTypeId" UUID NOT NULL,
    "expectedQuantity" DECIMAL(12,3) NOT NULL,
    "countedQuantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" UUID NOT NULL,
    "stockCountLineId" UUID,
    "chickenTypeId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(16,4) NOT NULL,
    "reason" "StockAdjustmentReason" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" UUID NOT NULL,
    "chickenTypeId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "quantityKg" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(16,4) NOT NULL,
    "kind" "InventoryMovementKind" NOT NULL,
    "openingInventoryPositionId" UUID,
    "stockReceiptItemId" UUID,
    "dailySaleItemId" UUID,
    "stockAdjustmentId" UUID,
    "reversalOfId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "expenseDate" DATE NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "moneyMovementId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayable" (
    "id" UUID NOT NULL,
    "stockReceiptId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "payableDate" DATE NOT NULL,
    "dueDate" DATE,
    "originalAmount" DECIMAL(16,2) NOT NULL,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPayable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPayment" (
    "id" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "paidAt" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "moneyMovementId" UUID NOT NULL,
    "notes" TEXT,

    CONSTRAINT "SupplierPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCredit" (
    "id" UUID NOT NULL,
    "dailySaleId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "creditDate" DATE NOT NULL,
    "originalAmount" DECIMAL(16,2) NOT NULL,
    "status" "CreditStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerCollection" (
    "id" UUID NOT NULL,
    "customerCreditId" UUID NOT NULL,
    "collectedAt" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "moneyMovementId" UUID NOT NULL,
    "notes" TEXT,

    CONSTRAINT "CustomerCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerWithdrawal" (
    "id" UUID NOT NULL,
    "withdrawnAt" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "purpose" TEXT,
    "moneyMovementId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyMovement" (
    "id" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "type" "MoneyMovementType" NOT NULL,
    "fromAccountId" UUID,
    "toAccountId" UUID,
    "dailySaleId" UUID,
    "reversalOfId" UUID,
    "reference" VARCHAR(100),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoneyMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSetup_openingDate_key" ON "ShopSetup"("openingDate");

-- CreateIndex
CREATE UNIQUE INDEX "ChickenType_code_key" ON "ChickenType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ChickenType_name_key" ON "ChickenType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Account_name_key" ON "Account"("name");

-- CreateIndex
CREATE INDEX "Account_type_isActive_idx" ON "Account"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_name_key" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningAccountBalance_moneyMovementId_key" ON "OpeningAccountBalance"("moneyMovementId");

-- CreateIndex
CREATE INDEX "OpeningAccountBalance_accountId_idx" ON "OpeningAccountBalance"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningAccountBalance_setupId_accountId_key" ON "OpeningAccountBalance"("setupId", "accountId");

-- CreateIndex
CREATE INDEX "OpeningInventoryPosition_chickenTypeId_idx" ON "OpeningInventoryPosition"("chickenTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "OpeningInventoryPosition_setupId_chickenTypeId_key" ON "OpeningInventoryPosition"("setupId", "chickenTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReceipt_receiptNumber_key" ON "StockReceipt"("receiptNumber");

-- CreateIndex
CREATE INDEX "StockReceipt_supplierId_receivedAt_idx" ON "StockReceipt"("supplierId", "receivedAt");

-- CreateIndex
CREATE INDEX "StockReceipt_receivedAt_idx" ON "StockReceipt"("receivedAt");

-- CreateIndex
CREATE INDEX "StockReceiptItem_chickenTypeId_idx" ON "StockReceiptItem"("chickenTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "StockReceiptItem_stockReceiptId_chickenTypeId_key" ON "StockReceiptItem"("stockReceiptId", "chickenTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "DailySale_businessDate_key" ON "DailySale"("businessDate");

-- CreateIndex
CREATE INDEX "DailySaleItem_chickenTypeId_idx" ON "DailySaleItem"("chickenTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "DailySaleItem_dailySaleId_chickenTypeId_key" ON "DailySaleItem"("dailySaleId", "chickenTypeId");

-- CreateIndex
CREATE INDEX "StockCount_countedAt_idx" ON "StockCount"("countedAt");

-- CreateIndex
CREATE INDEX "StockCountLine_chickenTypeId_idx" ON "StockCountLine"("chickenTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_stockCountId_chickenTypeId_key" ON "StockCountLine"("stockCountId", "chickenTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_stockCountLineId_key" ON "StockAdjustment"("stockCountLineId");

-- CreateIndex
CREATE INDEX "StockAdjustment_chickenTypeId_occurredAt_idx" ON "StockAdjustment"("chickenTypeId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_openingInventoryPositionId_key" ON "InventoryMovement"("openingInventoryPositionId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_stockReceiptItemId_key" ON "InventoryMovement"("stockReceiptItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_dailySaleItemId_key" ON "InventoryMovement"("dailySaleItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_stockAdjustmentId_key" ON "InventoryMovement"("stockAdjustmentId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryMovement_reversalOfId_key" ON "InventoryMovement"("reversalOfId");

-- CreateIndex
CREATE INDEX "InventoryMovement_chickenTypeId_occurredAt_idx" ON "InventoryMovement"("chickenTypeId", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_occurredAt_idx" ON "InventoryMovement"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_moneyMovementId_key" ON "Expense"("moneyMovementId");

-- CreateIndex
CREATE INDEX "Expense_expenseDate_category_idx" ON "Expense"("expenseDate", "category");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayable_stockReceiptId_key" ON "SupplierPayable"("stockReceiptId");

-- CreateIndex
CREATE INDEX "SupplierPayable_supplierId_status_payableDate_idx" ON "SupplierPayable"("supplierId", "status", "payableDate");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPayment_moneyMovementId_key" ON "SupplierPayment"("moneyMovementId");

-- CreateIndex
CREATE INDEX "SupplierPayment_payableId_paidAt_idx" ON "SupplierPayment"("payableId", "paidAt");

-- CreateIndex
CREATE INDEX "CustomerCredit_customerId_status_creditDate_idx" ON "CustomerCredit"("customerId", "status", "creditDate");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCredit_dailySaleId_customerId_key" ON "CustomerCredit"("dailySaleId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCollection_moneyMovementId_key" ON "CustomerCollection"("moneyMovementId");

-- CreateIndex
CREATE INDEX "CustomerCollection_customerCreditId_collectedAt_idx" ON "CustomerCollection"("customerCreditId", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerWithdrawal_moneyMovementId_key" ON "OwnerWithdrawal"("moneyMovementId");

-- CreateIndex
CREATE INDEX "OwnerWithdrawal_withdrawnAt_idx" ON "OwnerWithdrawal"("withdrawnAt");

-- CreateIndex
CREATE UNIQUE INDEX "MoneyMovement_reversalOfId_key" ON "MoneyMovement"("reversalOfId");

-- CreateIndex
CREATE INDEX "MoneyMovement_occurredAt_idx" ON "MoneyMovement"("occurredAt");

-- CreateIndex
CREATE INDEX "MoneyMovement_fromAccountId_occurredAt_idx" ON "MoneyMovement"("fromAccountId", "occurredAt");

-- CreateIndex
CREATE INDEX "MoneyMovement_toAccountId_occurredAt_idx" ON "MoneyMovement"("toAccountId", "occurredAt");

-- CreateIndex
CREATE INDEX "MoneyMovement_dailySaleId_idx" ON "MoneyMovement"("dailySaleId");

-- AddForeignKey
ALTER TABLE "OpeningAccountBalance" ADD CONSTRAINT "OpeningAccountBalance_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "ShopSetup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningAccountBalance" ADD CONSTRAINT "OpeningAccountBalance_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningAccountBalance" ADD CONSTRAINT "OpeningAccountBalance_moneyMovementId_fkey" FOREIGN KEY ("moneyMovementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningInventoryPosition" ADD CONSTRAINT "OpeningInventoryPosition_setupId_fkey" FOREIGN KEY ("setupId") REFERENCES "ShopSetup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpeningInventoryPosition" ADD CONSTRAINT "OpeningInventoryPosition_chickenTypeId_fkey" FOREIGN KEY ("chickenTypeId") REFERENCES "ChickenType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceipt" ADD CONSTRAINT "StockReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockReceiptItem" ADD CONSTRAINT "StockReceiptItem_chickenTypeId_fkey" FOREIGN KEY ("chickenTypeId") REFERENCES "ChickenType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySaleItem" ADD CONSTRAINT "DailySaleItem_dailySaleId_fkey" FOREIGN KEY ("dailySaleId") REFERENCES "DailySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySaleItem" ADD CONSTRAINT "DailySaleItem_chickenTypeId_fkey" FOREIGN KEY ("chickenTypeId") REFERENCES "ChickenType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "StockCount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_chickenTypeId_fkey" FOREIGN KEY ("chickenTypeId") REFERENCES "ChickenType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_stockCountLineId_fkey" FOREIGN KEY ("stockCountLineId") REFERENCES "StockCountLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_chickenTypeId_fkey" FOREIGN KEY ("chickenTypeId") REFERENCES "ChickenType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_chickenTypeId_fkey" FOREIGN KEY ("chickenTypeId") REFERENCES "ChickenType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_openingInventoryPositionId_fkey" FOREIGN KEY ("openingInventoryPositionId") REFERENCES "OpeningInventoryPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_stockReceiptItemId_fkey" FOREIGN KEY ("stockReceiptItemId") REFERENCES "StockReceiptItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_dailySaleItemId_fkey" FOREIGN KEY ("dailySaleItemId") REFERENCES "DailySaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_stockAdjustmentId_fkey" FOREIGN KEY ("stockAdjustmentId") REFERENCES "StockAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_moneyMovementId_fkey" FOREIGN KEY ("moneyMovementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayable" ADD CONSTRAINT "SupplierPayable_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "StockReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayable" ADD CONSTRAINT "SupplierPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES "SupplierPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPayment" ADD CONSTRAINT "SupplierPayment_moneyMovementId_fkey" FOREIGN KEY ("moneyMovementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCredit" ADD CONSTRAINT "CustomerCredit_dailySaleId_fkey" FOREIGN KEY ("dailySaleId") REFERENCES "DailySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCredit" ADD CONSTRAINT "CustomerCredit_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCollection" ADD CONSTRAINT "CustomerCollection_customerCreditId_fkey" FOREIGN KEY ("customerCreditId") REFERENCES "CustomerCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCollection" ADD CONSTRAINT "CustomerCollection_moneyMovementId_fkey" FOREIGN KEY ("moneyMovementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerWithdrawal" ADD CONSTRAINT "OwnerWithdrawal_moneyMovementId_fkey" FOREIGN KEY ("moneyMovementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_dailySaleId_fkey" FOREIGN KEY ("dailySaleId") REFERENCES "DailySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyMovement" ADD CONSTRAINT "MoneyMovement_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
