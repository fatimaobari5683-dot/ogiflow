import { z } from 'zod';

/**
 * Statuts qu'un livreur peut s'attribuer lui-même. BUSY est géré exclusivement
 * par le moteur de dispatch, SUSPENDED/PENDING_APPROVAL uniquement par un manager.
 */
export const selfServiceStatusSchema = z.enum(['AVAILABLE', 'OFFLINE']);

export const updateDriverStatusSchema = z.object({
  status: selfServiceStatusSchema,
});

export const updateDriverLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const assignZoneSchema = z.object({
  zoneId: z.string().min(1),
});

export const listDriversQuerySchema = z.object({
  status: z.enum(['PENDING_APPROVAL', 'AVAILABLE', 'BUSY', 'OFFLINE', 'SUSPENDED']).optional(),
  zoneId: z.string().optional(),
});

export type UpdateDriverStatusInput = z.infer<typeof updateDriverStatusSchema>;
export type UpdateDriverLocationInput = z.infer<typeof updateDriverLocationSchema>;
export type AssignZoneInput = z.infer<typeof assignZoneSchema>;
export type ListDriversQuery = z.infer<typeof listDriversQuerySchema>;
