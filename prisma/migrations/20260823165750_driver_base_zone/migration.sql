-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "baseZoneId" TEXT;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_baseZoneId_fkey" FOREIGN KEY ("baseZoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
