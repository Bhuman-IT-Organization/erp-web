import { describe, expect, it } from 'vitest';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import {
  EMAIL_PIPING_DEFAULT_CODE,
  IN_USE_CODE,
  NOT_FOUND_CODE,
  TICKET_PRIORITIES_ENDPOINTS,
  TICKET_PRIORITIES_ERRORS,
  TICKET_PRIORITIES_PATH,
  ticketPrioritiesHooks,
  ticketPrioritiesPath,
  VALIDATION_CODE,
} from '../ticket-priorities.endpoints';

describe('ticket-priorities endpoints', () => {
  it('declares exactly the six calls the api module serves, method and path', () => {
    expect(TICKET_PRIORITIES_ENDPOINTS).toEqual({
      list: { method: 'GET', path: '/api/v1/ticket-priorities' },
      export: { method: 'GET', path: '/api/v1/ticket-priorities/export' },
      detail: { method: 'GET', path: '/api/v1/ticket-priorities/:id' },
      create: { method: 'POST', path: '/api/v1/ticket-priorities' },
      update: { method: 'PATCH', path: '/api/v1/ticket-priorities/:id' },
      remove: { method: 'DELETE', path: '/api/v1/ticket-priorities/:id' },
    });
  });

  it('derives the list and a record path from the table, the id encoded', () => {
    expect(TICKET_PRIORITIES_PATH).toBe('/api/v1/ticket-priorities');
    expect(ticketPrioritiesPath('7')).toBe('/api/v1/ticket-priorities/7');
    expect(ticketPrioritiesPath('a b')).toBe('/api/v1/ticket-priorities/a%20b');
    expect(ticketPrioritiesPath('a/1')).toBe('/api/v1/ticket-priorities/a%2F1');
  });

  it("names the api's codes: not found, used by a ticket, the email-piping default; never a name-taken code", () => {
    expect(NOT_FOUND_CODE).toBe('ERP-CORE-0004');
    expect(IN_USE_CODE).toBe('ERP-TICKETPRIORITIES-0001');
    expect(EMAIL_PIPING_DEFAULT_CODE).toBe('ERP-TICKETPRIORITIES-0002');
    expect(TICKET_PRIORITIES_ERRORS).toEqual({
      namespace: 'ticket-priorities',
      codes: ['ERP-CORE-0004', 'ERP-TICKETPRIORITIES-0001', 'ERP-TICKETPRIORITIES-0002'],
    });
    expect(JSON.stringify(TICKET_PRIORITIES_ERRORS)).not.toContain('ERP-TICKET-PRIORITIES');
  });

  it('every declared code has a message in English and in Arabic', () => {
    for (const code of TICKET_PRIORITIES_ERRORS.codes) {
      expect(en['ticket-priorities'].errors).toHaveProperty(code);
      expect(ar['ticket-priorities'].errors).toHaveProperty(code);
    }
  });

  it('exposes the resource hooks and the validation code whose issues the form maps', () => {
    expect(Object.keys(ticketPrioritiesHooks).sort()).toEqual([
      'useCreate',
      'useList',
      'useOne',
      'useRemove',
      'useUpdate',
    ]);
    expect(VALIDATION_CODE).toBe('ERP-VALIDATION-0001');
  });
});
