CREATE TABLE "SupplierDiscount" (
    "id" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "discountedAt" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierDiscount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierDiscount_payableId_discountedAt_idx" ON "SupplierDiscount"("payableId", "discountedAt");

ALTER TABLE "SupplierDiscount" ADD CONSTRAINT "SupplierDiscount_payableId_fkey"
FOREIGN KEY ("payableId") REFERENCES "SupplierPayable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
