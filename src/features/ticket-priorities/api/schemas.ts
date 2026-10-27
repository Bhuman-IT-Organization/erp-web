import { z } from 'zod';

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 50;

export const ticketPriorityNameSchema = z
  .string()
  .trim()
  .min(1, 'Priority name is required')
  .min(MIN_NAME_LENGTH, 'Name must be at least 2 characters')
  .max(MAX_NAME_LENGTH, 'Name must be 50 characters or less')
  .regex(/^[A-Za-z0-9 _-]+$/, 'Only letters, numbers, spaces, - and _ allowed');

export const ticketPrioritySchema = z.object({
  name: ticketPriorityNameSchema,
});

export type TicketPriorityInput = z.infer<typeof ticketPrioritySchema>;
