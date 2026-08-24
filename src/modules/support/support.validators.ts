import { z } from 'zod';

export const createTicketSchema = z.object({
  subject: z.string().min(3, 'Sujet trop court').max(150),
  description: z.string().min(10, 'Décrivez le problème (10 caractères minimum).').max(2000),
  relatedOrderId: z.string().min(1).optional(),
});

export const addMessageSchema = z.object({
  body: z.string().min(1, 'Message vide').max(2000),
});

export const updateTicketStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
});

export const assignTicketSchema = z.object({
  assignedToId: z.string().min(1),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type AddMessageInput = z.infer<typeof addMessageSchema>;
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
