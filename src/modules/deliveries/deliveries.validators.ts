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

export const proofSchema = z.object({
  type: z.enum(['SIGNATURE', 'OTP', 'PHOTO', 'GPS']),
  data: z.record(z.unknown()),
});

export const recordAttemptSchema = z
  .object({
    result: z.enum(['SUCCESS', 'CUSTOMER_ABSENT', 'WRONG_ADDRESS', 'CUSTOMER_REFUSED', 'OTHER_FAILURE']),
    notes: z.string().max(1000).optional(),
    proof: proofSchema.optional(),
    latitude: latitudeSchema.optional(),
    longitude: longitudeSchema.optional(),
  })
  .refine((data) => data.result !== 'SUCCESS' || !!data.proof, {
    message: 'Une preuve de livraison (proof) est requise quand result = SUCCESS.',
    path: ['proof'],
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
export type RecordAttemptInput = z.infer<typeof recordAttemptSchema>;
export type RecordEventInput = z.infer<typeof recordEventSchema>;
export type ResolveFailedDeliveryInput = z.infer<typeof resolveFailedDeliverySchema>;
