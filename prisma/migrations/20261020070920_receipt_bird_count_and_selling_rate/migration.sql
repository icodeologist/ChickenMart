-- AlterTable
ALTER TABLE "StockReceiptItem" ADD COLUMN     "birdCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suggestedSellRate" DECIMAL(16,4) NOT NULL DEFAULT 0;
