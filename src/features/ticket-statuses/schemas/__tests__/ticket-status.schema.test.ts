import { describe, expect, it } from 'vitest';
import {
  toTicketStatusWriteValues,
  ticketStatusFormSchema,
  ticketStatusesListResponseSchema,
} from '@/features/ticket-statuses/schemas/ticket-status.schema';

const ticketStatus = {
  ticketstatusid: '1',
  name: 'Open',
  ticket_count: 4,
  isdefault: 1,
  statuscolor: '#03a9f4',
  statusorder: 1,
};

describe('Ticket Statuses API contract', () => {
  it('parses the backend list shape without pagination metadata and rejects unexpected fields', () => {
    expect(ticketStatusesListResponseSchema.parse({ data: [ticketStatus] })).toEqual({
      data: [
        {
          id: '1',
          name: 'Open',
          ticket_count: 4,
          isdefault: 1,
          statuscolor: '#03a9f4',
          statusorder: 1,
        },
      ],
    });
    expect(
      ticketStatusesListResponseSchema.safeParse({
        data: [ticketStatus],
        meta: { nextCursor: null },
      }).success,
    ).toBe(false);
  });

  it('validates form names, colors and status order before sending', () => {
    const valid = { name: 'Waiting', statuscolor: '#a1B2c3', statusorder: 2 };

    expect(ticketStatusFormSchema.safeParse(valid).success).toBe(true);
    expect(ticketStatusFormSchema.safeParse({ ...valid, name: 'x'.repeat(51) }).success).toBe(
      false,
    );

    expect(ticketStatusFormSchema.safeParse({ ...valid, statuscolor: 'red' }).success).toBe(true);
    expect(ticketStatusFormSchema.safeParse({ ...valid, statuscolor: 'text!!' }).success).toBe(
      true,
    );
    expect(ticketStatusFormSchema.safeParse({ ...valid, statuscolor: '12345678' }).success).toBe(
      false,
    );

    const emptyOrder = ticketStatusFormSchema.parse({ ...valid, statusorder: '' });
    expect(emptyOrder.statusorder).toBe('');
    expect(toTicketStatusWriteValues(emptyOrder).statusorder).toBeNull();
    expect(ticketStatusFormSchema.safeParse({ ...valid, statusorder: -1 }).success).toBe(true);
    expect(ticketStatusFormSchema.safeParse({ ...valid, statusorder: '-2147483648' }).success).toBe(
      true,
    );
    expect(ticketStatusFormSchema.safeParse({ ...valid, statusorder: '1.5' }).success).toBe(false);
    expect(ticketStatusFormSchema.safeParse({ ...valid, statusorder: 1.5 }).success).toBe(false);
  });
});
