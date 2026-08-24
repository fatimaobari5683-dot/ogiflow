import { z } from 'zod';

const latitudeSchema = z.number().min(-90).max(90);
const longitudeSchema = z.number().min(-180).max(180);

/**
 * Statuts que le module Deliveries fait avancer manuellement (déclenchés par
 * le livreur ou un manager). DELIVERED et les statuts d'échec passent par
 * recordAttemptSchema, pas par celui-ci.
 */
export const advanceStatusSchema = z.object({
  status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY']),
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
});

// Formats autorisés pour une preuve PHOTO/SIGNATURE capturée depuis le
// navigateur (caméra ou pad de signature converti en image) — pas de PDF
// ici, contrairement aux documents KYC (documents.validators.ts).
export const ALLOWED_PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PROOF_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo

/**
 * Métadonnées d'une tentative de livraison, envoyées en `multipart/form-data`
 * (pas JSON) car SIGNATURE/PHOTO joignent un fichier binaire dans la même
 * requête — voir `attempts/route.ts`. `proofValue` porte le code OTP en
 * texte libre ; le fichier lui-même est extrait séparément du FormData,
 * pas validé par ce schéma.
 */
export const recordAttemptMetadataSchema = z
  .object({
    result: z.enum(['SUCCESS', 'CUSTOMER_ABSENT', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED', 'OTHER_FAILURE']),
    notes: z.string().max(1000).optional(),
    proofType: z.enum(['SIGNATURE', 'OTP', 'PHOTO', 'GPS']).optional(),
    proofValue: z.string().max(200).optional(),
    // Valeurs FormData toujours reçues en texte — coercition explicite plutôt
    // que de faire porter cette règle à latitudeSchema/longitudeSchema
    // (partagés avec des schémas JSON ailleurs, où un nombre est déjà un nombre).
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((data) => data.result !== 'SUCCESS' || !!data.proofType, {
    message: 'Une preuve de livraison (proofType) est requise quand result = SUCCESS.',
    path: ['proofType'],
  });

export const recordEventSchema = z.object({
  eventType: z.string().min(2).max(60),
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const resolveFailedDeliverySchema = z.object({
  status: z.enum(['RESCHEDULED', 'RETURNED']),
  reason: z.string().max(500).optional(),
});

export type AdvanceStatusInput = z.infer<typeof advanceStatusSchema>;
export type RecordAttemptMetadataInput = z.infer<typeof recordAttemptMetadataSchema>;
export type RecordEventInput = z.infer<typeof recordEventSchema>;
export type ResolveFailedDeliveryInput = z.infer<typeof resolveFailedDeliverySchema>;
