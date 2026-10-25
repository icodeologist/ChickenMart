ALTER TABLE "AdminUser"
ADD COLUMN "singletonKey" INTEGER NOT NULL DEFAULT 1,
ADD CONSTRAINT "AdminUser_singleton_key_one" CHECK ("singletonKey" = 1);

CREATE UNIQUE INDEX "AdminUser_singletonKey_key" ON "AdminUser"("singletonKey");
