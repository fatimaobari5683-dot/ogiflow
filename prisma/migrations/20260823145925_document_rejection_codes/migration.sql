-- CreateEnum
CREATE TYPE "DocumentRejectionReason" AS ENUM ('ILLEGIBLE', 'EXPIRED', 'WRONG_DOCUMENT', 'MISSING_PAGE', 'MISMATCH_IDENTITY', 'MISMATCH_VEHICLE', 'INVALID_FORMAT', 'DUPLICATE', 'INCOMPLETE', 'OTHER');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "rejectionReasonCode" "DocumentRejectionReason";
