CREATE TYPE "BirdCountAdjustmentDirection" AS ENUM ('ADD', 'REMOVE');

CREATE TABLE "BirdCountAdjustment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chickenTypeId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL,
    "direction" "BirdCountAdjustmentDirection" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" VARCHAR(200),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BirdCountAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BirdCountAdjustment_quantity_positive" CHECK ("quantity" > 0)
);

CREATE INDEX "BirdCountAdjustment_chickenTypeId_occurredAt_idx"
  ON "BirdCountAdjustment"("chickenTypeId", "occurredAt");

CREATE INDEX "BirdCountAdjustment_createdAt_idx"
  ON "BirdCountAdjustment"("createdAt");

ALTER TABLE "BirdCountAdjustment"
  ADD CONSTRAINT "BirdCountAdjustment_chickenTypeId_fkey"
  FOREIGN KEY ("chickenTypeId") REFERENCES "ChickenType"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
