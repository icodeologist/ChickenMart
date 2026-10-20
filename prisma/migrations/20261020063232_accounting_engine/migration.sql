-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "key" VARCHAR(120) NOT NULL,
    "operation" VARCHAR(80) NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountReconciliation" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "reconciledAt" TIMESTAMPTZ(6) NOT NULL,
    "actualBalance" DECIMAL(16,2) NOT NULL,
    "expectedBalance" DECIMAL(16,2) NOT NULL,
    "difference" DECIMAL(16,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_key_key" ON "IdempotencyKey"("key");

-- CreateIndex
CREATE INDEX "IdempotencyKey_operation_createdAt_idx" ON "IdempotencyKey"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "AccountReconciliation_accountId_reconciledAt_idx" ON "AccountReconciliation"("accountId", "reconciledAt");

-- AddForeignKey
ALTER TABLE "AccountReconciliation" ADD CONSTRAINT "AccountReconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
