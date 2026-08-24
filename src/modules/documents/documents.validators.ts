import { z } from 'zod';

export const documentOwnerTypeSchema = z.enum(['DRIVER', 'SUPPLIER']);
export const documentTypeSchema = z.enum(['CIN', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'VEHICLE_INSURANCE', 'COMPANY_REGISTRATION']);

export const uploadDocumentMetadataSchema = z.object({
  ownerType: documentOwnerTypeSchema,
  ownerId: z.string().min(1),
  type: documentTypeSchema,
  documentNumber: z.string().max(100).optional(),
  issuedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
});

export const documentRejectionReasonSchema = z.enum([
  'ILLEGIBLE',
  'EXPIRED',
  'WRONG_DOCUMENT',
  'MISSING_PAGE',
  'MISMATCH_IDENTITY',
  'MISMATCH_VEHICLE',
  'INVALID_FORMAT',
  'DUPLICATE',
  'INCOMPLETE',
  'OTHER',
]);

export const rejectDocumentSchema = z.object({
  reasonCode: documentRejectionReasonSchema,
  reason: z.string().min(3, 'Précisez le motif de refus (3 caractères minimum).').max(500),
});

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
export const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 Mo
