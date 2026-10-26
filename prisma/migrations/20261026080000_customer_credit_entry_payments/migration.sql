-- CreateTable
CREATE TABLE "CustomerCreditEntryPayment" (
    "id" UUID NOT NULL,
    "customerCreditEntryId" UUID NOT NULL,
    "paidAt" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "method" "CustomerPaymentMethod" NOT NULL,
    "moneyMovementId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCreditEntryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerCreditEntryPayment_moneyMovementId_key" ON "CustomerCreditEntryPayment"("moneyMovementId");

-- CreateIndex
CREATE INDEX "CustomerCreditEntryPayment_customerCreditEntryId_paidAt_idx" ON "CustomerCreditEntryPayment"("customerCreditEntryId", "paidAt");

-- AddForeignKey
ALTER TABLE "CustomerCreditEntryPayment" ADD CONSTRAINT "CustomerCreditEntryPayment_customerCreditEntryId_fkey" FOREIGN KEY ("customerCreditEntryId") REFERENCES "CustomerCreditEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCreditEntryPayment" ADD CONSTRAINT "CustomerCreditEntryPayment_moneyMovementId_fkey" FOREIGN KEY ("moneyMovementId") REFERENCES "MoneyMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
