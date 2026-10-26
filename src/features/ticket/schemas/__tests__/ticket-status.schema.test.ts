import { describe, expect, it } from 'vitest';
import {
  ticketStatusFormSchema,
  ticketStatusesListResponseSchema,
} from '@/features/ticket/schemas/ticket-status.schema';

const ticketStatus = {
  ticketstatusid: '1',
  name: 'Open',
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
    expect(ticketStatusFormSchema.safeParse({ ...valid, statuscolor: 'red' }).success).toBe(false);
    expect(ticketStatusFormSchema.safeParse({ ...valid, statusorder: -1 }).success).toBe(false);
  });
});
