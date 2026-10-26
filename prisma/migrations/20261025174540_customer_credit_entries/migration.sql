-- CreateTable
CREATE TABLE "CustomerCreditEntry" (
    "id" UUID NOT NULL,
    "customerName" VARCHAR(140) NOT NULL,
    "description" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(16,2) NOT NULL,
    "creditedAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerCreditEntry_creditedAt_createdAt_idx" ON "CustomerCreditEntry"("creditedAt", "createdAt");
