-- CreateTable
CREATE TABLE "delivery_reviews" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_reviews_orderId_key" ON "delivery_reviews"("orderId");

-- CreateIndex
CREATE INDEX "delivery_reviews_driverId_idx" ON "delivery_reviews"("driverId");

-- AddForeignKey
ALTER TABLE "delivery_reviews" ADD CONSTRAINT "delivery_reviews_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_reviews" ADD CONSTRAINT "delivery_reviews_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
