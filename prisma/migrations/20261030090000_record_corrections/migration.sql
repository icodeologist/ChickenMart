ALTER TABLE "ManualPassbookEntry"
  ADD COLUMN "voidedAt" TIMESTAMPTZ(6),
  ADD COLUMN "replacementOfId" UUID;

ALTER TABLE "CustomerCreditEntry"
  ADD COLUMN "voidedAt" TIMESTAMPTZ(6),
  ADD COLUMN "replacementOfId" UUID;

ALTER TABLE "SupplierPayment"
  ADD COLUMN "voidedAt" TIMESTAMPTZ(6),
  ADD COLUMN "replacementOfId" UUID;

ALTER TABLE "CustomerCreditEntryPayment"
  ADD COLUMN "voidedAt" TIMESTAMPTZ(6),
  ADD COLUMN "replacementOfId" UUID;

CREATE UNIQUE INDEX "ManualPassbookEntry_replacementOfId_key"
  ON "ManualPassbookEntry"("replacementOfId");

CREATE UNIQUE INDEX "CustomerCreditEntry_replacementOfId_key"
  ON "CustomerCreditEntry"("replacementOfId");

CREATE UNIQUE INDEX "SupplierPayment_replacementOfId_key"
  ON "SupplierPayment"("replacementOfId");

CREATE UNIQUE INDEX "CustomerCreditEntryPayment_replacementOfId_key"
  ON "CustomerCreditEntryPayment"("replacementOfId");

ALTER TABLE "ManualPassbookEntry"
  ADD CONSTRAINT "ManualPassbookEntry_replacementOfId_fkey"
  FOREIGN KEY ("replacementOfId") REFERENCES "ManualPassbookEntry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerCreditEntry"
  ADD CONSTRAINT "CustomerCreditEntry_replacementOfId_fkey"
  FOREIGN KEY ("replacementOfId") REFERENCES "CustomerCreditEntry"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierPayment"
  ADD CONSTRAINT "SupplierPayment_replacementOfId_fkey"
  FOREIGN KEY ("replacementOfId") REFERENCES "SupplierPayment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerCreditEntryPayment"
  ADD CONSTRAINT "CustomerCreditEntryPayment_replacementOfId_fkey"
  FOREIGN KEY ("replacementOfId") REFERENCES "CustomerCreditEntryPayment"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
