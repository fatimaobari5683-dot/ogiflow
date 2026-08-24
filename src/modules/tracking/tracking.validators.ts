import { z } from 'zod';

export const submitReviewSchema = z.object({
  rating: z.number().int().min(1, 'La note doit être entre 1 et 5.').max(5, 'La note doit être entre 1 et 5.'),
  comment: z.string().max(500, 'Commentaire trop long (500 caractères maximum).').optional(),
});

export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
