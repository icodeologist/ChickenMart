CREATE TYPE "SupplierPaymentMethod" AS ENUM ('CASH', 'UPI', 'NET_BANKING');

ALTER TABLE "SupplierPayment"
ADD COLUMN "method" "SupplierPaymentMethod" NOT NULL DEFAULT 'CASH';
