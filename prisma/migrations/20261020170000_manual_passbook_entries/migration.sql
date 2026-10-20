ALTER TYPE "MoneyMovementType" ADD VALUE 'MANUAL_PAYMENT';

CREATE TYPE "PassbookPaymentType" AS ENUM ('HARD_CASH', 'UPI', 'CREDIT');

CREATE TABLE "ManualPassbookEntry" (
    "id" UUID NOT NULL,
    "entryDate" TIMESTAMPTZ(6) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "paymentType" "PassbookPaymentType" NOT NULL,
    "moneyMovementId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManualPassbookEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManualPassbookEntry_moneyMovementId_key" ON "ManualPassbookEntry"("moneyMovementId");
CREATE INDEX "ManualPassbookEntry_entryDate_createdAt_idx" ON "ManualPassbookEntry"("entryDate", "createdAt");
CREATE INDEX "ManualPassbookEntry_paymentType_entryDate_idx" ON "ManualPassbookEntry"("paymentType", "entryDate");

ALTER TABLE "ManualPassbookEntry" ADD CONSTRAINT "ManualPassbookEntry_moneyMovementId_fkey" FOREIGN KEY ("moneyMovementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
