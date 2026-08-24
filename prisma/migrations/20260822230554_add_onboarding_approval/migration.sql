-- AlterEnum
ALTER TYPE "DriverStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "SupplierStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "rejectionReason" TEXT;
