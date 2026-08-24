-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'REFERRAL_BONUS';

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "referralRewardedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "drivers_referralCode_key" ON "drivers"("referralCode");

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
