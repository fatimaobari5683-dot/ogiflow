-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "scheduledWindowMinutes" INTEGER;
