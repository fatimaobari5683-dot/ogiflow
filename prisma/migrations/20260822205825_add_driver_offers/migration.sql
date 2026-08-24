-- CreateEnum
CREATE TYPE "DriverOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "driver_offers" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "score" DECIMAL(5,2),
    "status" "DriverOfferStatus" NOT NULL DEFAULT 'PENDING',
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "driver_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "driver_offers_orderId_idx" ON "driver_offers"("orderId");

-- CreateIndex
CREATE INDEX "driver_offers_driverId_status_idx" ON "driver_offers"("driverId", "status");

-- AddForeignKey
ALTER TABLE "driver_offers" ADD CONSTRAINT "driver_offers_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_offers" ADD CONSTRAINT "driver_offers_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
