import { z } from 'zod';

export const PRIORITY_NAME_MIN = 2;
export const PRIORITY_NAME_MAX = 50;

export const ticketPriorityNameSchema = z
  .string()
  .trim()
  .min(1, 'Priority name is required')
  .min(PRIORITY_NAME_MIN, `Name must be at least ${PRIORITY_NAME_MIN.toString()} characters`)
  .max(PRIORITY_NAME_MAX, `Name must be ${PRIORITY_NAME_MAX.toString()} characters or less`)
  .regex(/^[A-Za-z0-9 _-]+$/, 'Only letters, numbers, spaces, - and _ allowed');

export const ticketPrioritySchema = z.object({
  name: ticketPriorityNameSchema,
});

export type TicketPriorityInput = z.infer<typeof ticketPrioritySchema>;
